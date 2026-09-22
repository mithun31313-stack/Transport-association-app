const express = require("express");
const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

async function sendWorkbook(res, filename, buildSheet) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Transport Association App";
  workbook.created = new Date();
  buildSheet(workbook);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

function styleHeader(sheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF2" } };
  sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columnCount } };
}

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

// ---- Excel exports ----
// Each of these accepts either an Authorization header OR ?token=... in the URL,
// so they work as plain tappable download links, not just from an API tool.

router.get("/export/income", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = req.query;
  const income = await prisma.incomeTransaction.findMany({
    where: {
      status: "SUCCESS",
      date: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
    },
    include: { member: { select: { name: true } }, vehicle: { select: { registrationNumber: true } } },
    orderBy: { date: "asc" },
  });

  await sendWorkbook(res, "income-report.xlsx", (workbook) => {
    const sheet = workbook.addWorksheet("Income");
    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Category", key: "category", width: 22 },
      { header: "Amount (₹)", key: "amount", width: 14 },
      { header: "Member", key: "member", width: 20 },
      { header: "Vehicle", key: "vehicle", width: 16 },
      { header: "Payment Method", key: "method", width: 16 },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Description", key: "description", width: 30 },
    ];
    income.forEach((i) => {
      sheet.addRow({
        date: i.date.toISOString().slice(0, 10),
        category: i.category,
        amount: Number(i.amount),
        member: i.member?.name || "",
        vehicle: i.vehicle?.registrationNumber || "",
        method: i.paymentMethod,
        reference: i.reference || "",
        description: i.description || "",
      });
    });
    sheet.addRow({});
    const totalRow = sheet.addRow({ category: "TOTAL", amount: income.reduce((s, i) => s + Number(i.amount), 0) });
    totalRow.font = { bold: true };
    styleHeader(sheet);
  });
});

router.get("/export/expenses", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = req.query;
  const expenses = await prisma.expenseTransaction.findMany({
    where: {
      status: "COMPLETED",
      date: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
    },
    include: { driver: { select: { fullName: true } } },
    orderBy: { date: "asc" },
  });

  await sendWorkbook(res, "expense-report.xlsx", (workbook) => {
    const sheet = workbook.addWorksheet("Expenses");
    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Category", key: "category", width: 22 },
      { header: "Amount (₹)", key: "amount", width: 14 },
      { header: "Driver (if salary)", key: "driver", width: 20 },
      { header: "Payment Method", key: "method", width: 16 },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Description", key: "description", width: 30 },
    ];
    expenses.forEach((e) => {
      sheet.addRow({
        date: e.date.toISOString().slice(0, 10),
        category: e.category,
        amount: Number(e.amount),
        driver: e.driver?.fullName || "",
        method: e.paymentMethod,
        reference: e.reference || "",
        description: e.description || "",
      });
    });
    sheet.addRow({});
    const totalRow = sheet.addRow({ category: "TOTAL", amount: expenses.reduce((s, e) => s + Number(e.amount), 0) });
    totalRow.font = { bold: true };
    styleHeader(sheet);
  });
});

router.get("/export/salary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { month, year, status } = req.query;
  const salaries = await prisma.salaryRecord.findMany({
    where: { month: month ? Number(month) : undefined, year: year ? Number(year) : undefined, status: status || undefined },
    include: { driver: { select: { fullName: true, employeeId: true } }, payments: { select: { utr: true, paymentDate: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  await sendWorkbook(res, "salary-report.xlsx", (workbook) => {
    const sheet = workbook.addWorksheet("Salary");
    sheet.columns = [
      { header: "Driver", key: "driver", width: 20 },
      { header: "Employee ID", key: "empId", width: 14 },
      { header: "Month", key: "month", width: 8 },
      { header: "Year", key: "year", width: 8 },
      { header: "Basic", key: "basic", width: 12 },
      { header: "Allowance", key: "allowance", width: 12 },
      { header: "Bonus", key: "bonus", width: 12 },
      { header: "Advance", key: "advance", width: 12 },
      { header: "Deduction", key: "deduction", width: 12 },
      { header: "Net Salary", key: "net", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "UTR", key: "utr", width: 20 },
      { header: "Paid Date", key: "paidDate", width: 14 },
    ];
    salaries.forEach((s) => {
      sheet.addRow({
        driver: s.driver.fullName,
        empId: s.driver.employeeId,
        month: s.month,
        year: s.year,
        basic: Number(s.basicSalary),
        allowance: Number(s.allowance),
        bonus: Number(s.bonus),
        advance: Number(s.advance),
        deduction: Number(s.deduction),
        net: Number(s.netSalary),
        status: s.status,
        utr: s.payments?.[0]?.utr || "",
        paidDate: s.payments?.[0]?.paymentDate ? s.payments[0].paymentDate.toISOString().slice(0, 10) : "",
      });
    });
    styleHeader(sheet);
  });
});

router.get("/export/financial-summary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined;

  const [income, expenses] = await Promise.all([
    prisma.incomeTransaction.findMany({ where: { status: "SUCCESS", date: dateFilter } }),
    prisma.expenseTransaction.findMany({ where: { status: "COMPLETED", date: dateFilter } }),
  ]);
  const totalIncome = income.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);

  await sendWorkbook(res, "financial-summary.xlsx", (workbook) => {
    const sheet = workbook.addWorksheet("Summary");
    sheet.columns = [
      { header: "Metric", key: "metric", width: 28 },
      { header: "Amount (₹)", key: "amount", width: 16 },
    ];
    sheet.addRow({ metric: "Total Income", amount: totalIncome });
    sheet.addRow({ metric: "Total Expenses", amount: totalExpense });
    const balanceRow = sheet.addRow({ metric: "Balance", amount: totalIncome - totalExpense });
    balanceRow.font = { bold: true };
    styleHeader(sheet);
  });
});

module.exports = router;
