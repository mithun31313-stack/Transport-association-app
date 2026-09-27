const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const memberSchema = z.object({
  membershipNo: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  joiningDate: z.string(),
  notes: z.string().optional(),
});

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { q, status } = req.query;
  const members = await prisma.member.findMany({
    where: {
      status: status || undefined,
      OR: q ? [{ name: { contains: q, mode: "insensitive" } }, { membershipNo: { contains: q, mode: "insensitive" } }] : undefined,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(members);
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const member = await prisma.member.create({ data: { ...parsed.data, joiningDate: new Date(parsed.data.joiningDate) } });
  res.status(201).json(member);
});

router.get("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { id: req.params.id },
    include: { vehicles: true, dues: true, incomes: { orderBy: { date: "desc" } } },
  });
  if (!member) return res.status(404).json({ error: "Not found" });
  res.json(member);
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const allowed = ["name", "phone", "email", "address", "notes", "status"];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const member = await prisma.member.update({ where: { id: req.params.id }, data });
  res.json(member);
});

module.exports = router;
