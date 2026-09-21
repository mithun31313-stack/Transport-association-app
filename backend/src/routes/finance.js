const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// ---- Income ----
const incomeSchema = z.object({
  category: z.string(),
  amount: z.number().positive(),
  memberId: z.string().optional(),
  vehicleId: z.string().optional(),
  date: z.string(),
  paymentMethod: z.string(),
  reference: z.string().optional(),
  description: z.string().optional(),
});

router.post("/income", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = incomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const income = await prisma.incomeTransaction.create({
    data: { ...parsed.data, date: new Date(parsed.data.date), status: "SUCCESS" },
  });
  res.status(201).json(income);
});

router.get("/income", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to, category } = req.query;
  const income = await prisma.incomeTransaction.findMany({
    where: {
      category: category || undefined,
      date: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
    },
    orderBy: { date: "desc" },
  });
  res.json(income);
});

router.put("/income/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const allowed = ["category", "amount", "date", "paymentMethod", "reference", "description", "status"];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = k === "date" ? new Date(req.body[k]) : req.body[k];
  const income = await prisma.incomeTransaction.update({ where: { id: req.params.id }, data });
  res.json(income);
});

// ---- Expenses ----
const expenseSchema = z.object({
  category: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  description: z.string().optional(),
  paymentMethod: z.string().default("BANK_TRANSFER"),
  reference: z.string().optional(),
});

router.post("/expenses", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const expense = await prisma.expenseTransaction.create({
    data: { ...parsed.data, date: new Date(parsed.data.date), createdById: req.user.admin.id, status: "COMPLETED" },
  });
  res.status(201).json(expense);
});

router.get("/expenses", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to, category } = req.query;
  const expenses = await prisma.expenseTransaction.findMany({
    where: {
      category: category || undefined,
      date: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
    },
    orderBy: { date: "desc" },
  });
  res.json(expenses);
});

router.put("/expenses/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const existing = await prisma.expenseTransaction.findUnique({ where: { id: req.params.id } });
  if (existing?.salaryPaymentId) {
    return res.status(409).json({ error: "Salary-payment-generated expenses cannot be edited manually." });
  }
  const allowed = ["category", "amount", "date", "description", "paymentMethod", "reference", "status"];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = k === "date" ? new Date(req.body[k]) : req.body[k];
  const expense = await prisma.expenseTransaction.update({ where: { id: req.params.id }, data });
  res.json(expense);
});

// ---- Member dues ----
router.get("/dues", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { status, memberId } = req.query;
  const dues = await prisma.memberDue.findMany({
    where: { status: status || undefined, memberId: memberId || undefined },
    include: { member: { select: { name: true, membershipNo: true } }, vehicle: { select: { registrationNumber: true } } },
    orderBy: { dueDate: "asc" },
  });
  res.json(dues);
});

router.post("/dues", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    memberId: z.string(),
    vehicleId: z.string().optional(),
    feeType: z.string(),
    amount: z.number().positive(),
    dueDate: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const due = await prisma.memberDue.create({
    data: { ...d, dueDate: new Date(d.dueDate), remainingAmount: d.amount, status: "PENDING" },
  });
  res.status(201).json(due);
});

// ---- Ledger balance (computed, never hard-coded — Section 6 / 25) ----
router.get("/balance", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.incomeTransaction.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    prisma.expenseTransaction.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  const totalIncome = Number(incomeAgg._sum.amount || 0);
  const totalExpense = Number(expenseAgg._sum.amount || 0);
  res.json({ totalIncome, totalExpense, currentBalance: totalIncome - totalExpense });
});

module.exports = router;
