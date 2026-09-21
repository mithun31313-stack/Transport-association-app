const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole, requireSelfOrAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { driverId, from, to } = req.query;
  const where = {
    date: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
  };
  if (req.user.role === "DRIVER") where.driverId = req.user.driver.id;
  else if (driverId) where.driverId = driverId;

  const records = await prisma.driverAttendance.findMany({ where, orderBy: { date: "desc" } });
  res.json(records);
});

const markSchema = z.object({
  driverId: z.string(),
  date: z.string(),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"]),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  remarks: z.string().optional(),
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const record = await prisma.driverAttendance.upsert({
    where: { driverId_date: { driverId: d.driverId, date: new Date(d.date) } },
    update: { status: d.status, checkIn: d.checkIn ? new Date(d.checkIn) : undefined, checkOut: d.checkOut ? new Date(d.checkOut) : undefined, remarks: d.remarks },
    create: { ...d, date: new Date(d.date), checkIn: d.checkIn ? new Date(d.checkIn) : undefined, checkOut: d.checkOut ? new Date(d.checkOut) : undefined },
  });
  res.status(201).json(record);
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const allowed = ["status", "checkIn", "checkOut", "remarks"];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = k.startsWith("check") ? new Date(req.body[k]) : req.body[k];
  const record = await prisma.driverAttendance.update({ where: { id: req.params.id }, data });
  res.json(record);
});

router.get("/summary/:driverId", requireAuth, requireSelfOrAdmin((req) => req.params.driverId), async (req, res) => {
  const { month, year } = req.query;
  const from = new Date(Number(year), Number(month) - 1, 1);
  const to = new Date(Number(year), Number(month), 0);
  const records = await prisma.driverAttendance.findMany({ where: { driverId: req.params.driverId, date: { gte: from, lte: to } } });
  const summary = { present: 0, absent: 0, halfDay: 0, leave: 0 };
  for (const r of records) {
    if (r.status === "PRESENT") summary.present++;
    if (r.status === "ABSENT") summary.absent++;
    if (r.status === "HALF_DAY") summary.halfDay++;
    if (r.status === "LEAVE") summary.leave++;
  }
  res.json(summary);
});

// ---- Work sessions (start/end work) ----
router.post("/work/start", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driverId = req.user.driver.id;
  const openSession = await prisma.workSession.findFirst({ where: { driverId, endTime: null } });
  if (openSession) return res.status(409).json({ error: "A work session is already in progress" });

  const now = new Date();
  const session = await prisma.workSession.create({
    data: { driverId, date: new Date(now.toDateString()), startTime: now },
  });
  res.status(201).json(session);
});

router.post("/work/end", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driverId = req.user.driver.id;
  const openSession = await prisma.workSession.findFirst({ where: { driverId, endTime: null }, orderBy: { startTime: "desc" } });
  if (!openSession) return res.status(409).json({ error: "No active work session" });

  const endTime = new Date();
  const durationMinutes = Math.round((endTime - openSession.startTime) / 60000);
  const session = await prisma.workSession.update({ where: { id: openSession.id }, data: { endTime, durationMinutes } });
  res.json(session);
});

router.get("/work/:driverId", requireAuth, requireSelfOrAdmin((req) => req.params.driverId), async (req, res) => {
  const sessions = await prisma.workSession.findMany({ where: { driverId: req.params.driverId }, orderBy: { startTime: "desc" }, take: 30 });
  res.json(sessions);
});

module.exports = router;
