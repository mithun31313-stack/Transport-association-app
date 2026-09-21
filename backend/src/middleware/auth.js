const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

// Verifies the JWT, loads the current user (+ admin/driver profile), rejects if inactive.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing authentication token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { admin: true, driver: true },
    });
    if (!user || !user.isActive) return res.status(401).json({ error: "Invalid or inactive account" });

    req.user = user; // { id, role, admin, driver, ... }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}

// A driver may only act on their own driverId; admins may act on any.
function requireSelfOrAdmin(getDriverId) {
  return (req, res, next) => {
    if (req.user.role === "ADMIN") return next();
    const targetDriverId = getDriverId(req);
    if (req.user.role === "DRIVER" && req.user.driver?.id === targetDriverId) return next();
    return res.status(403).json({ error: "Forbidden: cannot access another driver's data" });
  };
}

module.exports = { requireAuth, requireRole, requireSelfOrAdmin };
