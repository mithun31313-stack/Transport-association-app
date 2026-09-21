const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole, requireSelfOrAdmin } = require("../middleware/auth");
const { writeAudit } = require("../lib/audit");
const { maskAccountNumber } = require("../lib/bank");

const router = express.Router();

function serializeDriver(driver, { includeBank = false } = {}) {
  if (!driver) return driver;
  const out = { ...driver };
  if (driver.bankAccount) {
    out.bankAccount = {
      ...driver.bankAccount,
      accountNumber: includeBank ? driver.bankAccount.accountNumber : undefined,
      maskedAccountNumber: maskAccountNumber(driver.bankAccount.accountNumber),
    };
  }
  return out;
}

// ---- List / search drivers (admin only) ----
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { q, status } = req.query;
  const drivers = await prisma.driver.findMany({
    where: {
      status: status || undefined,
      OR: q
        ? [
            { fullName: { contains: q, mode: "insensitive" } },
            { employeeId: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { bankAccount: true, vehicleAssignments: { where: { isActive: true }, include: { vehicle: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(drivers.map((d) => serializeDriver(d)));
});

// ---- Create driver (admin only) — also creates the login User ----
const createDriverSchema = z.object({
  employeeId: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  password: z.string().min(8),
  address: z.string().optional(),
  joiningDate: z.string(),
  licenceNumber: z.string().optional(),
  licenceExpiry: z.string().optional(),
  emergencyContact: z.string().optional(),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createDriverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const passwordHash = await bcrypt.hash(d.password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone: d.phone, email: d.email, passwordHash, role: "DRIVER" },
      });
      const driver = await tx.driver.create({
        data: {
          userId: user.id,
          employeeId: d.employeeId,
          fullName: d.fullName,
          phone: d.phone,
          email: d.email,
          address: d.address,
          joiningDate: new Date(d.joiningDate),
          licenceNumber: d.licenceNumber,
          licenceExpiry: d.licenceExpiry ? new Date(d.licenceExpiry) : undefined,
          emergencyContact: d.emergencyContact,
        },
      });
      await writeAudit(tx, { userId: req.user.id, action: "DRIVER_CREATED", entity: "Driver", entityId: driver.id, newValue: driver });
      return driver;
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Employee ID, phone, or email already in use" });
    throw err;
  }
});

// ---- Get one driver ----
router.get("/:id", requireAuth, requireSelfOrAdmin((req) => req.params.id), async (req, res) => {
  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    include: {
      bankAccount: true,
      vehicleAssignments: { where: { isActive: true }, include: { vehicle: true } },
      documents: true,
    },
  });
  if (!driver) return res.status(404).json({ error: "Driver not found" });
  res.json(serializeDriver(driver, { includeBank: req.user.role === "ADMIN" }));
});

// ---- Edit driver (admin only) ----
router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const before = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: "Driver not found" });

  const allowed = ["fullName", "phone", "email", "address", "licenceNumber", "licenceExpiry", "emergencyContact", "status"];
  const data = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) data[key] = key.includes("Expiry") ? new Date(req.body[key]) : req.body[key];
  }

  const updated = await prisma.$transaction(async (tx) => {
    const driver = await tx.driver.update({ where: { id: req.params.id }, data });
    await writeAudit(tx, {
      userId: req.user.id,
      action: before.status !== driver.status && driver.status === "INACTIVE" ? "DRIVER_DEACTIVATED" : "DRIVER_EDITED",
      entity: "Driver",
      entityId: driver.id,
      oldValue: before,
      newValue: driver,
    });
    return driver;
  });

  res.json(updated);
});

// ---- Assign / change vehicle (admin only) ----
router.post("/:id/assign-vehicle", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { vehicleId } = req.body;
  if (!vehicleId) return res.status(400).json({ error: "vehicleId is required" });

  await prisma.$transaction(async (tx) => {
    await tx.driverVehicleAssignment.updateMany({
      where: { driverId: req.params.id, isActive: true },
      data: { isActive: false, unassignedAt: new Date() },
    });
    const assignment = await tx.driverVehicleAssignment.create({
      data: { driverId: req.params.id, vehicleId },
    });
    await writeAudit(tx, { userId: req.user.id, action: "VEHICLE_ASSIGNED", entity: "Driver", entityId: req.params.id, newValue: assignment });
  });

  res.json({ ok: true });
});

// ---- Driver bank details: submit/update (driver, own only) ----
const bankSchema = z.object({
  accountHolderName: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(6),
  ifsc: z.string().min(4),
  branch: z.string().optional(),
});

router.put("/:id/bank", requireAuth, requireSelfOrAdmin((req) => req.params.id), async (req, res) => {
  const parsed = bankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.$transaction(async (tx) => {
    const bank = await tx.driverBankAccount.upsert({
      where: { driverId: req.params.id },
      update: { ...parsed.data, verificationStatus: "PENDING", verifiedAt: null, verifiedByAdminId: null },
      create: { driverId: req.params.id, ...parsed.data, verificationStatus: "PENDING" },
    });
    await writeAudit(tx, { userId: req.user.id, action: "BANK_DETAILS_SUBMITTED", entity: "DriverBankAccount", entityId: bank.id });
    return bank;
  });

  res.json({ ...updated, accountNumber: undefined, maskedAccountNumber: maskAccountNumber(updated.accountNumber) });
});

// ---- Verify bank account (admin only) ----
router.post("/:id/bank/verify", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { decision } = req.body; // "VERIFIED" | "REJECTED"
  if (!["VERIFIED", "REJECTED"].includes(decision)) return res.status(400).json({ error: "decision must be VERIFIED or REJECTED" });

  const updated = await prisma.$transaction(async (tx) => {
    const bank = await tx.driverBankAccount.update({
      where: { driverId: req.params.id },
      data: { verificationStatus: decision, verifiedAt: new Date(), verifiedByAdminId: req.user.admin.id },
    });
    await writeAudit(tx, { userId: req.user.id, action: "BANK_DETAILS_VERIFIED", entity: "DriverBankAccount", entityId: bank.id, newValue: { decision } });
    return bank;
  });

  res.json({ ...updated, accountNumber: undefined, maskedAccountNumber: maskAccountNumber(updated.accountNumber) });
});

module.exports = router;
