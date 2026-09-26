const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole, requireSelfOrAdmin } = require("../middleware/auth");
const { writeAudit } = require("../lib/audit");

const router = express.Router();

// Server always computes net salary — the app never sends/trusts a client-supplied net salary (Section 11).
function computeNetSalary({ basicSalary, allowance = 0, bonus = 0, otherPayment = 0, advance = 0, deduction = 0 }) {
  return (
    Number(basicSalary) + Number(allowance) + Number(bonus) + Number(otherPayment) - Number(advance) - Number(deduction)
  );
}

const createSalarySchema = z.object({
  driverId: z.string(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
  basicSalary: z.number().nonnegative(),
  allowance: z.number().nonnegative().default(0),
  bonus: z.number().nonnegative().default(0),
  otherPayment: z.number().nonnegative().default(0),
  advance: z.number().nonnegative().default(0),
  deduction: z.number().nonnegative().default(0),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createSalarySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const netSalary = computeNetSalary(d);

  try {
    const salary = await prisma.$transaction(async (tx) => {
      const rec = await tx.salaryRecord.create({
        data: { ...d, netSalary, status: "DRAFT", createdById: req.user.admin.id },
      });
      await writeAudit(tx, { userId: req.user.id, action: "SALARY_CREATED", entity: "SalaryRecord", entityId: rec.id, newValue: rec });
      return rec;
    });
    res.status(201).json(salary);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "A salary record already exists for this driver/month/year" });
    throw err;
  }
});

router.get("/", requireAuth, async (req, res) => {
  const { driverId, month, year, status } = req.query;
  const where = { month: month ? Number(month) : undefined, year: year ? Number(year) : undefined, status: status || undefined };

  if (req.user.role === "DRIVER") {
    where.driverId = req.user.driver.id; // drivers only ever see their own salaries
  } else if (driverId) {
    where.driverId = driverId;
  }

  const salaries = await prisma.salaryRecord.findMany({
    where,
    include: { driver: { select: { fullName: true, employeeId: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  res.json(salaries);
});

router.get("/:id", requireAuth, async (req, res) => {
  const salary = await prisma.salaryRecord.findUnique({
    where: { id: req.params.id },
    include: { driver: true, payments: { include: { receipt: true } } },
  });
  if (!salary) return res.status(404).json({ error: "Not found" });
  if (req.user.role === "DRIVER" && salary.driverId !== req.user.driver.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(salary);
});

// Editing: allowed for DRAFT / PENDING / APPROVED. PAID cannot be edited directly (Rule 8).
// Editing an APPROVED salary resets it to PENDING and requires re-approval (Section 13).
const editSalarySchema = createSalarySchema.partial().omit({ driverId: true, month: true, year: true });

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const existing = await prisma.salaryRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.status === "PAID") {
    return res.status(409).json({ error: "Paid salary cannot be edited directly. Create a SalaryCorrection instead." });
  }

  const parsed = editSalarySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const merged = { ...existing, ...parsed.data };
  const netSalary = computeNetSalary(merged);
  const wasApproved = existing.status === "APPROVED";

  const updated = await prisma.$transaction(async (tx) => {
    const rec = await tx.salaryRecord.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        netSalary,
        status: wasApproved ? "PENDING" : existing.status,
        approvedById: wasApproved ? null : existing.approvedById,
        approvedAt: wasApproved ? null : existing.approvedAt,
      },
    });
    await writeAudit(tx, {
      userId: req.user.id,
      action: "SALARY_EDITED",
      entity: "SalaryRecord",
      entityId: rec.id,
      oldValue: existing,
      newValue: rec,
    });
    return rec;
  });

  res.json(updated);
});

router.post("/:id/approve", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const existing = await prisma.salaryRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!["DRAFT", "PENDING"].includes(existing.status)) {
    return res.status(409).json({ error: `Cannot approve a salary in status ${existing.status}` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const rec = await tx.salaryRecord.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedById: req.user.admin.id, approvedAt: new Date() },
    });
    await writeAudit(tx, { userId: req.user.id, action: "SALARY_APPROVED", entity: "SalaryRecord", entityId: rec.id, oldValue: existing, newValue: rec });
    return rec;
  });

  res.json(updated);
});

// ---- Salary increments ----
router.post("/increments", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    driverId: z.string(),
    previousSalary: z.number().nonnegative(),
    incrementAmount: z.number().nonnegative(),
    incrementPercent: z.number().optional(),
    incrementPeriodMonths: z.number().int().positive().default(12),
    lastIncrementDate: z.string().optional(),
    nextIncrementDate: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const inc = await prisma.salaryIncrement.create({
    data: {
      ...d,
      lastIncrementDate: d.lastIncrementDate ? new Date(d.lastIncrementDate) : undefined,
      nextIncrementDate: new Date(d.nextIncrementDate),
    },
  });
  res.status(201).json(inc);
});

router.get("/increments/due", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const due = await prisma.salaryIncrement.findMany({
    where: { nextIncrementDate: { lte: new Date() }, status: { not: "APPROVED" } },
    include: { driver: { select: { fullName: true, employeeId: true } } },
  });
  res.json(due);
});

router.post("/increments/:id/approve", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const inc = await prisma.salaryIncrement.update({
    where: { id: req.params.id },
    data: { status: "APPROVED", approvedAt: new Date(), lastIncrementDate: new Date() },
  });
  await writeAudit(prisma, { userId: req.user.id, action: "INCREMENT_APPROVED", entity: "SalaryIncrement", entityId: inc.id });
  res.json(inc);
});

router.get("/increments/driver/:driverId", requireAuth, requireSelfOrAdmin((req) => req.params.driverId), async (req, res) => {
  const list = await prisma.salaryIncrement.findMany({ where: { driverId: req.params.driverId }, orderBy: { createdAt: "desc" } });
  res.json(list);
});

// ---- Admin: get-or-create this month's (or a chosen month's) salary record for a driver ----
// This is what lets an Admin start editing a new/existing driver's salary even if the
// driver hasn't requested one yet — solves onboarding a driver whose pay differs from others.
router.post("/ensure/:driverId", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { month, year } = req.body;
  const now = new Date();
  const targetMonth = month || now.getMonth() + 1;
  const targetYear = year || now.getFullYear();

  const driver = await prisma.driver.findUnique({ where: { id: req.params.driverId } });
  if (!driver) return res.status(404).json({ error: "Driver not found" });

  let record = await prisma.salaryRecord.findUnique({
    where: { driverId_month_year: { driverId: driver.id, month: targetMonth, year: targetYear } },
    include: { driver: { select: { fullName: true, employeeId: true } } },
  });

  if (!record) {
    record = await prisma.salaryRecord.create({
      data: { driverId: driver.id, month: targetMonth, year: targetYear, basicSalary: 0, netSalary: 0, status: "DRAFT", createdById: req.user.admin.id },
      include: { driver: { select: { fullName: true, employeeId: true } } },
    });
  }

  res.json(record);
});

// ---- Driver requests their salary for the current month ----
// Creates a DRAFT salary record (if one doesn't already exist for this month) and
// notifies admins. Admin still fills in the actual amounts and approves/pays —
// this just starts the conversation instead of the driver waiting silently.
router.post("/request", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driver = req.user.driver;
  if (driver.approvalStatus !== "APPROVED") {
    return res.status(403).json({ error: "Your account isn't approved yet — an admin needs to verify your documents first." });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const existing = await prisma.salaryRecord.findUnique({
    where: { driverId_month_year: { driverId: driver.id, month, year } },
  });
  if (existing) {
    return res.status(409).json({ error: `A salary record for ${month}/${year} already exists (status: ${existing.status}).`, salary: existing });
  }

  const result = await prisma.$transaction(async (tx) => {
    const rec = await tx.salaryRecord.create({
      data: {
        driverId: driver.id,
        month,
        year,
        basicSalary: 0,
        netSalary: 0,
        status: "DRAFT",
        requestedByDriver: true,
        requestedAt: now,
      },
    });

    const admins = await tx.user.findMany({ where: { role: "ADMIN" } });
    for (const admin of admins) {
      await tx.notification.create({
        data: {
          userId: admin.id,
          title: "Salary requested",
          message: `${driver.fullName} requested their ${month}/${year} salary.`,
          type: "APPROVAL_NEEDED",
        },
      });
    }
    await writeAudit(tx, { userId: req.user.id, action: "SALARY_REQUESTED", entity: "SalaryRecord", entityId: rec.id });
    return rec;
  });

  res.status(201).json(result);
});

module.exports = router;
