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
    preferredLanguage: user.preferredLanguage,
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

// ---- Account settings: change password / email (works for Admin or Driver, own account only) ----
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.put("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { currentPassword, newPassword } = parsed.data;

  const valid = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
  await writeAudit(prisma, { userId: req.user.id, action: "PASSWORD_CHANGED", entity: "User", entityId: req.user.id });

  res.json({ ok: true });
});

const changeEmailSchema = z.object({ email: z.string().email() });

router.put("/change-email", requireAuth, async (req, res) => {
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.user.id }, data: { email: parsed.data.email } });
      if (req.user.role === "ADMIN" && req.user.admin) {
        // no email field on Admin itself — nothing further needed
      }
      if (req.user.role === "DRIVER" && req.user.driver) {
        await tx.driver.update({ where: { id: req.user.driver.id }, data: { email: parsed.data.email } });
      }
      await writeAudit(tx, { userId: req.user.id, action: "EMAIL_CHANGED", entity: "User", entityId: req.user.id, newValue: { email: parsed.data.email } });
    });
    res.json({ ok: true, email: parsed.data.email });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "That email is already in use" });
    throw err;
  }
});

router.put("/change-language", requireAuth, async (req, res) => {
  const { language } = req.body;
  if (!["en", "ta"].includes(language)) return res.status(400).json({ error: "language must be 'en' or 'ta'" });
  await prisma.user.update({ where: { id: req.user.id }, data: { preferredLanguage: language } });
  res.json({ ok: true, language });
});

// ---- Forgot password (OTP-based) ----
// IMPORTANT — no SMS/email provider is connected yet, so there is no real way to
// deliver the OTP to the person's phone or inbox right now. To keep this usable in
// the meantime, the OTP is returned directly in this response (clearly marked).
// Before relying on this for real users, wire this up to an SMS gateway (e.g.
// MSG91, Twilio, Fast2SMS) or an email service, and remove `demoOtp` from the
// response once delivery is real — otherwise anyone who can reach this endpoint
// can reset any account's password.
router.post("/forgot-password", async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: "Phone or email is required" });

  const user = await prisma.user.findFirst({ where: { OR: [{ phone: identifier }, { email: identifier }] } });
  // Same response whether or not the account exists, to avoid leaking which accounts are real —
  // except in this demo version, where we still need to hand back the OTP somehow.
  if (!user) return res.status(200).json({ ok: true, message: "If that account exists, an OTP has been sent." });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await bcrypt.hash(otp, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { otpHash, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  res.json({
    ok: true,
    message: "OTP generated (demo mode — no SMS/email provider connected yet).",
    demoOtp: otp,
  });
});

router.post("/reset-password", async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Phone/email, OTP, and a new password (min 8 characters) are required" });
  }

  const user = await prisma.user.findFirst({ where: { OR: [{ phone: identifier }, { email: identifier }] } });
  if (!user || !user.otpHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    return res.status(400).json({ error: "OTP is invalid or has expired. Request a new one." });
  }

  const validOtp = await bcrypt.compare(otp, user.otpHash);
  if (!validOtp) return res.status(400).json({ error: "Incorrect OTP" });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, otpHash: null, otpExpiresAt: null } });
  await writeAudit(prisma, { userId: user.id, action: "PASSWORD_RESET_VIA_OTP", entity: "User", entityId: user.id });

  res.json({ ok: true });
});

module.exports = router;
