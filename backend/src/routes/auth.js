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

module.exports = router;
