const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { entity, entityId, action } = req.query;
  const logs = await prisma.auditLog.findMany({
    where: { entity: entity || undefined, entityId: entityId || undefined, action: action || undefined },
    include: { user: { select: { phone: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

module.exports = router;
