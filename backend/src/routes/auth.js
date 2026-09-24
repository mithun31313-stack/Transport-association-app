const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { writeAudit } = require("../lib/audit");

const router = express.Router();

const loginSchema = z.object({
  identifier: z.string().min(3), // phone or email
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Phone/email and password are required" });
  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: identifier }, { email: identifier }] },
    include: { admin: true, driver: true },
  });

  // Constant-shape response to avoid leaking which accounts exist
  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

  res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      name: user.admin?.name || user.driver?.fullName,
      driverId: user.driver?.id || null,
      adminId: user.admin?.id || null,
    },
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  // Stateless JWT: client discards the token. (Add a token-blocklist table here if
  // you need server-side revocation before expiry.)
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const { user } = req;
  res.json({
    id: user.id,
    role: user.role,
    phone: user.phone,
    email: user.email,
    admin: user.admin,
    driver: user.driver,
  });
});

// One-time first-run setup: creates the association settings + first Admin account.
// Blocked once any Admin already exists.
const setupSchema = z.object({
  associationName: z.string().min(1),
  associationAddress: z.string().optional(),
  associationPhone: z.string().optional(),
  associationEmail: z.string().optional(),
  adminName: z.string().min(1),
  adminPhone: z.string().min(6),
  adminEmail: z.string().email().optional(),
  adminPassword: z.string().min(8),
});

router.post("/setup", async (req, res) => {
  const existingAdmin = await prisma.admin.findFirst();
  if (existingAdmin) return res.status(409).json({ error: "Setup already completed" });

  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const passwordHash = await bcrypt.hash(d.adminPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    await tx.appSettings.upsert({
      where: { id: "singleton" },
      update: {
        associationName: d.associationName,
        address: d.associationAddress,
        phone: d.associationPhone,
        email: d.associationEmail,
      },
      create: {
        id: "singleton",
        associationName: d.associationName,
        address: d.associationAddress,
        phone: d.associationPhone,
        email: d.associationEmail,
      },
    });

    const user = await tx.user.create({
      data: {
        phone: d.adminPhone,
        email: d.adminEmail,
        passwordHash,
        role: "ADMIN",
      },
    });
    const admin = await tx.admin.create({ data: { userId: user.id, name: d.adminName } });
    await writeAudit(tx, { userId: user.id, action: "ASSOCIATION_SETUP", entity: "AppSettings", entityId: "singleton" });
    return { user, admin };
  });

  res.status(201).json({ ok: true, adminId: result.admin.id });
});

// ---- Driver self-registration ----
// Public route: a driver creates their own account. They start INACTIVE / PENDING
// approval — they can log in and upload documents, but an Admin must review and
// approve them (see POST /api/drivers/:id/approve) before they're a working driver.
const registerDriverSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  password: z.string().min(8),
  address: z.string().optional(),
  licenceNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
});

router.post("/register-driver", async (req, res) => {
  const parsed = registerDriverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const passwordHash = await bcrypt.hash(d.password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone: d.phone, email: d.email, passwordHash, role: "DRIVER" },
      });

      // Auto-generate a temporary employee ID; Admin can change it on approval.
      const count = await tx.driver.count();
      const employeeId = `PENDING-${String(count + 1).padStart(4, "0")}`;

      const driver = await tx.driver.create({
        data: {
          userId: user.id,
          employeeId,
          fullName: d.fullName,
          phone: d.phone,
          email: d.email,
          address: d.address,
          joiningDate: new Date(),
          licenceNumber: d.licenceNumber,
          emergencyContact: d.emergencyContact,
          status: "INACTIVE",
          approvalStatus: "PENDING",
          selfRegistered: true,
        },
      });

      // Notify every admin that a new driver is awaiting approval
      const admins = await tx.user.findMany({ where: { role: "ADMIN" } });
      for (const admin of admins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            title: "New driver awaiting approval",
            message: `${d.fullName} signed up and needs document verification.`,
            type: "APPROVAL_NEEDED",
          },
        });
      }

      await writeAudit(tx, { userId: user.id, action: "DRIVER_SELF_REGISTERED", entity: "Driver", entityId: driver.id });
      return { user, driver };
    });

    const token = jwt.sign({ sub: result.user.id, role: "DRIVER" }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    res.status(201).json({
      token,
      user: { id: result.user.id, role: "DRIVER", name: result.driver.fullName, driverId: result.driver.id },
      approvalStatus: "PENDING",
    });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Phone or email already in use" });
    throw err;
  }
});

module.exports = router;
