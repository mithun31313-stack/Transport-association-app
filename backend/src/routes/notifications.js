const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// ---- Announcements ----
const announcementSchema = z.object({
  title: z.string(),
  message: z.string(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  targetDriverIds: z.array(z.string()).optional(), // omit/empty = all drivers
});

router.post("/announcements", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const targetAll = !d.targetDriverIds || d.targetDriverIds.length === 0;

  const result = await prisma.$transaction(async (tx) => {
    const ann = await tx.announcement.create({ data: { title: d.title, message: d.message, priority: d.priority, targetAll } });

    const driverIds = targetAll
      ? (await tx.driver.findMany({ where: { status: "ACTIVE" }, select: { id: true, userId: true } }))
      : await tx.driver.findMany({ where: { id: { in: d.targetDriverIds } }, select: { id: true, userId: true } });

    for (const driver of driverIds) {
      await tx.announcementTarget.create({ data: { announcementId: ann.id, driverId: driver.id } });
      await tx.notification.create({
        data: { userId: driver.userId, title: d.title, message: d.message, type: "ANNOUNCEMENT" },
      });
    }
    return ann;
  });

  res.status(201).json(result);
});

router.get("/announcements", requireAuth, async (req, res) => {
  if (req.user.role === "ADMIN") {
    const list = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
    return res.json(list);
  }
  const list = await prisma.announcementTarget.findMany({
    where: { driverId: req.user.driver.id },
    include: { announcement: true },
    orderBy: { announcement: { createdAt: "desc" } },
  });
  res.json(list.map((t) => t.announcement));
});

// ---- Notifications (per logged-in user) ----
router.get("/notifications", requireAuth, async (req, res) => {
  const list = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json(list);
});

router.put("/notifications/:id/read", requireAuth, async (req, res) => {
  const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notif || notif.userId !== req.user.id) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json(updated);
});

module.exports = router;
