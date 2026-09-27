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

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const existing = await prisma.driverAttendance.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.driverAttendance.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
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
// Starting work also marks today's attendance as PRESENT automatically, and notifies
// admins — so attendance doesn't require a separate manual step for a normal work day.
router.post("/work/start", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driverId = req.user.driver.id;
  const openSession = await prisma.workSession.findFirst({ where: { driverId, endTime: null } });
  if (openSession) return res.status(409).json({ error: "A work session is already in progress" });

  const now = new Date();
  const today = new Date(now.toDateString());

  const session = await prisma.$transaction(async (tx) => {
    const rec = await tx.workSession.create({ data: { driverId, date: today, startTime: now } });
    await tx.driverAttendance.upsert({
      where: { driverId_date: { driverId, date: today } },
      update: { status: "PRESENT", checkIn: now },
      create: { driverId, date: today, status: "PRESENT", checkIn: now },
    });
    const admins = await tx.user.findMany({ where: { role: "ADMIN" } });
    for (const admin of admins) {
      await tx.notification.create({
        data: { userId: admin.id, title: "Driver started work", message: `${req.user.driver.fullName} started work today.`, type: "WORK_STATUS" },
      });
    }
    return rec;
  });
  res.status(201).json(session);
});

// Driver marks a day off in advance (no work session, no "present") — notifies admins
// so it shows up as a real record rather than just silence.
router.post("/work/off", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driverId = req.user.driver.id;
  const { date, reason } = req.body;
  const targetDate = new Date(date ? new Date(date).toDateString() : new Date().toDateString());

  const record = await prisma.$transaction(async (tx) => {
    const rec = await tx.driverAttendance.upsert({
      where: { driverId_date: { driverId, date: targetDate } },
      update: { status: "LEAVE", remarks: reason || "Marked off by driver" },
      create: { driverId, date: targetDate, status: "LEAVE", remarks: reason || "Marked off by driver" },
    });
    const admins = await tx.user.findMany({ where: { role: "ADMIN" } });
    for (const admin of admins) {
      await tx.notification.create({
        data: {
          userId: admin.id,
          title: "Driver marked off",
          message: `${req.user.driver.fullName} marked ${targetDate.toDateString()} as off${reason ? `: ${reason}` : ""}.`,
          type: "WORK_STATUS",
        },
      });
    }
    return rec;
  });
  res.status(201).json(record);
});

router.post("/work/end", requireAuth, requireRole("DRIVER"), async (req, res) => {
  const driverId = req.user.driver.id;
  const openSession = await prisma.workSession.findFirst({ where: { driverId, endTime: null }, orderBy: { startTime: "desc" } });
  if (!openSession) return res.status(409).json({ error: "No active work session" });

  const endTime = new Date();
  const durationMinutes = Math.round((endTime - openSession.startTime) / 60000);
  const session = await prisma.$transaction(async (tx) => {
    const rec = await tx.workSession.update({ where: { id: openSession.id }, data: { endTime, durationMinutes } });
    await tx.driverAttendance.updateMany({
      where: { driverId, date: openSession.date },
      data: { checkOut: endTime },
    });
    return rec;
  });
  res.json(session);
});

router.get("/work/:driverId", requireAuth, requireSelfOrAdmin((req) => req.params.driverId), async (req, res) => {
  const sessions = await prisma.workSession.findMany({ where: { driverId: req.params.driverId }, orderBy: { startTime: "desc" }, take: 30 });
  res.json(sessions);
});

module.exports = router;
