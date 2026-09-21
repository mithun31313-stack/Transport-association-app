const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function documentStatus(expiryDate) {
  if (!expiryDate) return "VALID";
  const days = (new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "VALID";
}

const vehicleSchema = z.object({
  registrationNumber: z.string(),
  vehicleType: z.string(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  ownerMemberId: z.string().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const { q, status } = req.query;
  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: status || undefined,
      OR: q ? [{ registrationNumber: { contains: q, mode: "insensitive" } }] : undefined,
    },
    include: { documents: true, assignments: { where: { isActive: true }, include: { driver: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(vehicles);
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const vehicle = await prisma.vehicle.create({ data: parsed.data });
  res.status(201).json(vehicle);
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const allowed = ["vehicleType", "manufacturer", "model", "year", "status", "ownerMemberId"];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const vehicle = await prisma.vehicle.update({ where: { id: req.params.id }, data });
  res.json(vehicle);
});

// ---- Vehicle documents ----
router.post("/:id/documents", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    type: z.enum(["RC", "INSURANCE", "FITNESS", "PERMIT", "POLLUTION", "TAX"]),
    docNumber: z.string().optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
    fileUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const doc = await prisma.vehicleDocument.create({
    data: {
      vehicleId: req.params.id,
      ...d,
      issueDate: d.issueDate ? new Date(d.issueDate) : undefined,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : undefined,
      status: documentStatus(d.expiryDate),
    },
  });
  res.status(201).json(doc);
});

router.get("/documents/expiring", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const docs = await prisma.vehicleDocument.findMany({
    where: { status: { in: ["EXPIRING_SOON", "EXPIRED"] } },
    include: { vehicle: { select: { registrationNumber: true } } },
  });
  res.json(docs);
});

module.exports = router;
