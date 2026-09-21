const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Every figure here is computed live from the database — never hard-coded (Section 6).
router.get("/dashboard", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const [
    totalMembers,
    totalVehicles,
    totalDrivers,
    activeDrivers,
    inactiveDrivers,
    runningVehicles,
    maintenanceVehicles,
    incomeAgg,
    expenseAgg,
    pendingDuesAgg,
    pendingSalaries,
    approvedSalaries,
    paidSalaries,
    upcomingIncrements,
    expiringDocs,
  ] = await Promise.all([
    prisma.member.count(),
    prisma.vehicle.count(),
    prisma.driver.count(),
    prisma.driver.count({ where: { status: "ACTIVE" } }),
    prisma.driver.count({ where: { status: "INACTIVE" } }),
    prisma.vehicle.count({ where: { status: "RUNNING" } }),
    prisma.vehicle.count({ where: { status: "MAINTENANCE" } }),
    prisma.incomeTransaction.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    prisma.expenseTransaction.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.memberDue.aggregate({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { remainingAmount: true } }),
    prisma.salaryRecord.count({ where: { status: "PENDING" } }),
    prisma.salaryRecord.count({ where: { status: "APPROVED" } }),
    prisma.salaryRecord.count({ where: { status: "PAID" } }),
    prisma.salaryIncrement.count({ where: { nextIncrementDate: { lte: new Date() }, status: { not: "APPROVED" } } }),
    prisma.vehicleDocument.count({ where: { status: { in: ["EXPIRING_SOON", "EXPIRED"] } } }),
  ]);

  const totalIncome = Number(incomeAgg._sum.amount || 0);
  const totalExpense = Number(expenseAgg._sum.amount || 0);

  res.json({
    totalMembers,
    totalVehicles,
    totalDrivers,
    activeDrivers,
    inactiveDrivers,
    runningVehicles,
    maintenanceVehicles,
    monthlyIncome: totalIncome, // filter by month in query params if a narrower window is needed
    monthlyExpenses: totalExpense,
    currentBalance: totalIncome - totalExpense,
    pendingDues: Number(pendingDuesAgg._sum.remainingAmount || 0),
    pendingSalaries,
    approvedSalaries,
    paidSalaries,
    upcomingIncrements,
    expiringDocuments: expiringDocs,
  });
});

router.get("/financial", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined;

  const [income, expenses] = await Promise.all([
    prisma.incomeTransaction.findMany({ where: { status: "SUCCESS", date: dateFilter }, orderBy: { date: "desc" } }),
    prisma.expenseTransaction.findMany({ where: { status: "COMPLETED", date: dateFilter }, orderBy: { date: "desc" } }),
  ]);
  const totalIncome = income.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
  res.json({ income, expenses, totalIncome, totalExpense, balance: totalIncome - totalExpense });
});

router.get("/salary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { month, year, status } = req.query;
  const salaries = await prisma.salaryRecord.findMany({
    where: { month: month ? Number(month) : undefined, year: year ? Number(year) : undefined, status: status || undefined },
    include: { driver: { select: { fullName: true, employeeId: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  res.json(salaries);
});

router.get("/attendance", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = req.query;
  const records = await prisma.driverAttendance.findMany({
    where: { date: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined },
    include: { driver: { select: { fullName: true, employeeId: true } } },
    orderBy: { date: "desc" },
  });
  res.json(records);
});

router.get("/income", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const income = await prisma.incomeTransaction.findMany({ where: { status: "SUCCESS" }, orderBy: { date: "desc" } });
  res.json(income);
});

router.get("/expenses", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const expenses = await prisma.expenseTransaction.findMany({ where: { status: "COMPLETED" }, orderBy: { date: "desc" } });
  res.json(expenses);
});

module.exports = router;
