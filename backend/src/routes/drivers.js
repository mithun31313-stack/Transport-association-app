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
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
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

// ---- Deactivate / reactivate a driver (keeps all history — the normal way to "remove" someone) ----
router.post("/:id/deactivate", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const before = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: "Not found" });
  const driver = await prisma.$transaction(async (tx) => {
    const rec = await tx.driver.update({ where: { id: req.params.id }, data: { status: "INACTIVE" } });
    await writeAudit(tx, { userId: req.user.id, action: "DRIVER_DEACTIVATED", entity: "Driver", entityId: rec.id, oldValue: before, newValue: rec });
    return rec;
  });
  res.json(driver);
});

router.post("/:id/reactivate", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const driver = await prisma.driver.update({ where: { id: req.params.id }, data: { status: "ACTIVE" } });
  res.json(driver);
});

// ---- Permanently delete a driver ----
// Only allowed when they have no salary/payment history — that history must be kept
// for accounting records. If they have any, deactivate instead (above).
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) return res.status(404).json({ error: "Not found" });

  const [salaryCount, paymentCount, attendanceCount] = await Promise.all([
    prisma.salaryRecord.count({ where: { driverId: driver.id } }),
    prisma.salaryPayment.count({ where: { driverId: driver.id } }),
    prisma.driverAttendance.count({ where: { driverId: driver.id } }),
  ]);
  if (salaryCount > 0 || paymentCount > 0 || attendanceCount > 0) {
    return res.status(409).json({
      error: "This driver has salary, payment, or attendance history and can't be permanently deleted. Deactivate them instead to keep records intact.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.driverVehicleAssignment.deleteMany({ where: { driverId: driver.id } });
    await tx.driverDocument.deleteMany({ where: { driverId: driver.id } });
    await tx.driverBankAccount.deleteMany({ where: { driverId: driver.id } });
    await tx.announcementTarget.deleteMany({ where: { driverId: driver.id } });
    await tx.driver.delete({ where: { id: driver.id } });
    await tx.user.delete({ where: { id: driver.userId } });
    await writeAudit(tx, { userId: req.user.id, action: "DRIVER_DELETED", entity: "Driver", entityId: driver.id, oldValue: driver });
  });

  res.json({ ok: true });
});

// ---- Force delete: permanently removes a driver AND all their salary/payment/
// attendance history. Use only for test/mistaken entries — this is irreversible
// and will also remove the accounting trail of any salary payments they received
// (their salary expense entries disappear too, which changes your balance totals).
router.delete("/:id/force", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) return res.status(404).json({ error: "Not found" });

  await prisma.$transaction(async (tx) => {
    const payments = await tx.salaryPayment.findMany({ where: { driverId: driver.id } });
    for (const payment of payments) {
      await tx.receipt.deleteMany({ where: { salaryPaymentId: payment.id } });
      await tx.expenseTransaction.deleteMany({ where: { salaryPaymentId: payment.id } });
    }
    await tx.salaryPayment.deleteMany({ where: { driverId: driver.id } });

    const salaryRecords = await tx.salaryRecord.findMany({ where: { driverId: driver.id } });
    for (const record of salaryRecords) {
      await tx.salaryCorrection.deleteMany({ where: { salaryRecordId: record.id } });
    }
    await tx.salaryRecord.deleteMany({ where: { driverId: driver.id } });

    await tx.driverAttendance.deleteMany({ where: { driverId: driver.id } });
    await tx.workSession.deleteMany({ where: { driverId: driver.id } });
    await tx.driverVehicleAssignment.deleteMany({ where: { driverId: driver.id } });
    await tx.driverDocument.deleteMany({ where: { driverId: driver.id } });
    await tx.driverBankAccount.deleteMany({ where: { driverId: driver.id } });
    await tx.announcementTarget.deleteMany({ where: { driverId: driver.id } });
    await tx.salaryAdvance.deleteMany({ where: { driverId: driver.id } });
    await tx.salaryDeduction.deleteMany({ where: { driverId: driver.id } });
    await tx.salaryIncrement.deleteMany({ where: { driverId: driver.id } });

    await tx.driver.delete({ where: { id: driver.id } });

    // The driver's own login account has notifications and audit-log entries pointing
    // at it (actions they took themselves) — those must go before the account can be
    // deleted, since both relations are required (not nullable) on User.
    await tx.notification.deleteMany({ where: { userId: driver.userId } });
    await tx.auditLog.deleteMany({ where: { userId: driver.userId } });
    await tx.user.delete({ where: { id: driver.userId } });

    await writeAudit(tx, { userId: req.user.id, action: "DRIVER_FORCE_DELETED", entity: "Driver", entityId: driver.id, oldValue: driver });
  });

  res.json({ ok: true });
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

// ---- Drivers awaiting approval (admin only) ----
router.get("/pending/list", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const pending = await prisma.driver.findMany({
    where: { approvalStatus: "PENDING" },
    include: { documents: true, bankAccount: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(pending);
});

// ---- Approve / reject a self-registered driver (admin only) ----
router.post("/:id/approve", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { employeeId } = req.body;
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) return res.status(404).json({ error: "Driver not found" });
  if (driver.approvalStatus === "APPROVED") return res.status(409).json({ error: "Driver already approved" });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const rec = await tx.driver.update({
        where: { id: req.params.id },
        data: {
          approvalStatus: "APPROVED",
          approvedById: req.user.admin.id,
          approvedAt: new Date(),
          status: "ACTIVE",
          employeeId: employeeId || driver.employeeId,
        },
      });
      await tx.notification.create({
        data: { userId: driver.userId, title: "Account approved", message: "Your driver account has been approved. You can now be assigned a vehicle and paid.", type: "APPROVAL_NEEDED" },
      });
      await writeAudit(tx, { userId: req.user.id, action: "DRIVER_APPROVED", entity: "Driver", entityId: rec.id, oldValue: driver, newValue: rec });
      return rec;
    });
    res.json(updated);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "That employee ID is already in use" });
    throw err;
  }
});

router.post("/:id/reject", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { reason } = req.body;
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) return res.status(404).json({ error: "Driver not found" });

  const updated = await prisma.$transaction(async (tx) => {
    const rec = await tx.driver.update({
      where: { id: req.params.id },
      data: { approvalStatus: "REJECTED", status: "INACTIVE", rejectionReason: reason || null },
    });
    await tx.notification.create({
      data: { userId: driver.userId, title: "Account not approved", message: reason || "Your driver application was not approved. Contact the association for details.", type: "APPROVAL_NEEDED" },
    });
    await writeAudit(tx, { userId: req.user.id, action: "DRIVER_REJECTED", entity: "Driver", entityId: rec.id, newValue: { reason } });
    return rec;
  });
  res.json(updated);
});

// ---- Driver documents: upload (driver, own only, or admin) ----
const documentSchema = z.object({
  type: z.enum(["AADHAR", "PAN", "LICENCE", "ID_PROOF", "OTHER"]),
  docNumber: z.string().optional(),
  fileBase64: z.string().min(1, "File data is required"),
  mimeType: z.string().default("image/jpeg"),
});

router.post("/:id/documents", requireAuth, requireSelfOrAdmin((req) => req.params.id), async (req, res) => {
  const parsed = documentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  if (d.fileBase64.length > 5_500_000) {
    return res.status(413).json({ error: "File too large — please upload a smaller image (under ~4MB)" });
  }

  const fileUrl = `data:${d.mimeType};base64,${d.fileBase64}`;

  const doc = await prisma.$transaction(async (tx) => {
    const rec = await tx.driverDocument.create({
      data: { driverId: req.params.id, type: d.type, docNumber: d.docNumber, fileUrl, status: "VALID" },
    });
    await writeAudit(tx, { userId: req.user.id, action: "DRIVER_DOCUMENT_UPLOADED", entity: "DriverDocument", entityId: rec.id, newValue: { type: d.type } });
    return rec;
  });

  res.status(201).json({ id: doc.id, type: doc.type, docNumber: doc.docNumber, status: doc.status, createdAt: doc.createdAt });
});

router.get("/:id/documents", requireAuth, requireSelfOrAdmin((req) => req.params.id), async (req, res) => {
  const docs = await prisma.driverDocument.findMany({ where: { driverId: req.params.id }, orderBy: { createdAt: "desc" } });
  res.json(docs);
});

// ---- Profile photo (driver, own only, or admin) ----
router.put("/:id/profile-photo", requireAuth, requireSelfOrAdmin((req) => req.params.id), async (req, res) => {
  const { fileBase64, mimeType } = req.body;
  if (!fileBase64) return res.status(400).json({ error: "File data is required" });
  if (fileBase64.length > 5_500_000) return res.status(413).json({ error: "Image too large — use a smaller photo" });

  const profilePhotoUrl = `data:${mimeType || "image/jpeg"};base64,${fileBase64}`;
  const driver = await prisma.driver.update({ where: { id: req.params.id }, data: { profilePhotoUrl } });
  res.json({ profilePhotoUrl: driver.profilePhotoUrl });
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
  const { decision } = req.body;
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
