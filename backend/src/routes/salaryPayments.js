const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole, requireSelfOrAdmin } = require("../middleware/auth");
const { writeAudit } = require("../lib/audit");
const { maskAccountNumber } = require("../lib/bank");
const { generateSalaryReceiptPdf } = require("../lib/receipt");

const router = express.Router();

// ---- Admin payment history ----
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { driverId, status, month, year } = req.query;
  const payments = await prisma.salaryPayment.findMany({
    where: {
      driverId: driverId || undefined,
      status: status || undefined,
      salary: month || year ? { month: month ? Number(month) : undefined, year: year ? Number(year) : undefined } : undefined,
    },
    include: { driver: { select: { fullName: true, employeeId: true } }, salary: true, receipt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(payments);
});

router.get("/:id", requireAuth, async (req, res) => {
  const payment = await prisma.salaryPayment.findUnique({
    where: { id: req.params.id },
    include: { driver: true, salary: true, receipt: true },
  });
  if (!payment) return res.status(404).json({ error: "Not found" });
  if (req.user.role === "DRIVER" && payment.driverId !== req.user.driver.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(payment);
});

// ---- STEP 1: "Pay Salary" — returns verified bank details for the payment-instruction screen.
// This does NOT move money and does NOT change salary status (Rule 4).
router.get("/prepare/:salaryId", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const salary = await prisma.salaryRecord.findUnique({
    where: { id: req.params.salaryId },
    include: { driver: { include: { bankAccount: true } } },
  });
  if (!salary) return res.status(404).json({ error: "Salary not found" });
  if (salary.status !== "APPROVED") {
    return res.status(409).json({ error: `Salary must be APPROVED before payment (current: ${salary.status})` });
  }
  const bank = salary.driver.bankAccount;
  if (!bank || bank.verificationStatus !== "VERIFIED") {
    return res.status(409).json({ error: "Driver bank account is not verified" });
  }
  const existingPaid = await prisma.salaryPayment.findUnique({ where: { salaryId: salary.id } });
  if (existingPaid) {
    return res.status(409).json({ error: "This salary has already been paid." });
  }

  res.json({
    driver: { name: salary.driver.fullName, employeeId: salary.driver.employeeId },
    salary: { id: salary.id, month: salary.month, year: salary.year, netSalary: salary.netSalary, status: salary.status },
    bank: {
      bankName: bank.bankName,
      maskedAccountNumber: maskAccountNumber(bank.accountNumber),
      ifsc: bank.ifsc,
      accountHolderName: bank.accountHolderName,
      verificationStatus: bank.verificationStatus,
    },
    instructions:
      "Transfer the salary from the association bank account to the verified driver bank account using your bank's mobile banking or net banking application.",
  });
});

// ---- STEP 2: "Transfer Completed" — records the REAL transfer the admin already performed
// manually in their own banking app. This is the only step that marks a salary PAID.
// Implements Section 22 / 24 / 49 exactly: full validation + atomic transaction + no double payment.
const confirmSchema = z.object({
  salaryId: z.string(),
  utr: z.string().min(4, "UTR / transaction reference is required"),
  paymentDate: z.string(),
  remarks: z.string().optional(),
});

router.post("/manual", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { salaryId, utr, paymentDate, remarks } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-check everything inside the transaction (avoid races between prepare and confirm)
      const salary = await tx.salaryRecord.findUnique({
        where: { id: salaryId },
        include: { driver: { include: { bankAccount: true } } },
      });
      if (!salary) throw httpError(404, "Salary not found");
      if (salary.status !== "APPROVED") throw httpError(409, `Salary must be APPROVED (current: ${salary.status})`);

      const bank = salary.driver.bankAccount;
      if (!bank || bank.verificationStatus !== "VERIFIED") throw httpError(409, "Driver bank account is not verified");
      if (Number(salary.netSalary) <= 0) throw httpError(409, "Net salary must be greater than zero");

      // Duplicate-payment protection: a salary can have only one successful payment,
      // enforced both here and by the DB unique constraint on SalaryPayment.salaryId
      // (a race between two simultaneous requests still fails safely on that constraint).
      const alreadyPaid = await tx.salaryPayment.findUnique({ where: { salaryId } });
      if (alreadyPaid) throw httpError(409, "This salary has already been paid.");

      // 2. Create the payment record
      const payment = await tx.salaryPayment.create({
        data: {
          salaryId: salary.id,
          driverId: salary.driverId,
          amount: salary.netSalary,
          paymentMethod: "MANUAL_BANK_TRANSFER",
          paymentDate: new Date(paymentDate),
          utr,
          bankName: bank.bankName,
          maskedAccountNumber: maskAccountNumber(bank.accountNumber),
          ifsc: bank.ifsc,
          remarks,
          status: "PAID",
          createdById: req.user.admin.id,
        },
      });

      // 3. Mark salary PAID
      const updatedSalary = await tx.salaryRecord.update({
        where: { id: salary.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      // 4. Auto-create exactly one salary expense (Rule 9)
      const expense = await tx.expenseTransaction.create({
        data: {
          category: "DRIVER_SALARY",
          amount: salary.netSalary,
          date: new Date(paymentDate),
          description: `Salary payment — ${salary.driver.fullName} (${salary.month}/${salary.year})`,
          paymentMethod: "BANK_TRANSFER",
          reference: utr,
          createdById: req.user.admin.id,
          driverId: salary.driverId,
          salaryPaymentId: payment.id,
          status: "COMPLETED",
        },
      });

      // 5. Generate receipt number + PDF
      const settings = await tx.appSettings.findUnique({ where: { id: "singleton" } });
      const paidCount = await tx.receipt.count();
      const receiptNumber = `${settings?.receiptPrefix || "SAL"}-${new Date(paymentDate).getFullYear()}-${String(paidCount + 1).padStart(4, "0")}`;

      // PDF generation happens outside the DB transaction's atomicity concerns but we
      // record the Receipt row now and write the file right after commit (see below).
      const receipt = await tx.receipt.create({
        data: { receiptNumber, salaryPaymentId: payment.id, pdfUrl: "" }, // filled in after commit
      });

      // 6. Notify driver
      await tx.notification.create({
        data: {
          userId: salary.driver.userId,
          title: "Salary Paid",
          message: `Your ${salary.month}/${salary.year} salary of Rs. ${salary.netSalary} has been marked as paid.`,
          type: "SALARY_PAID",
        },
      });

      // 7. Audit log
      await writeAudit(tx, { userId: req.user.id, action: "SALARY_MARKED_PAID", entity: "SalaryPayment", entityId: payment.id, newValue: payment });
      await writeAudit(tx, { userId: req.user.id, action: "UTR_ENTERED", entity: "SalaryPayment", entityId: payment.id, newValue: { utr } });
      await writeAudit(tx, { userId: req.user.id, action: "SALARY_EXPENSE_CREATED", entity: "ExpenseTransaction", entityId: expense.id });
      await writeAudit(tx, { userId: req.user.id, action: "RECEIPT_GENERATED", entity: "Receipt", entityId: receipt.id });

      return { payment, updatedSalary, expense, receipt, driver: salary.driver, salary, settings };
    });

    // Generate the actual PDF file after the DB transaction commits successfully.
    const { filePath, publicPath } = await generateSalaryReceiptPdf({
      settings: result.settings,
      salary: result.salary,
      driver: result.driver,
      payment: result.payment,
      receiptNumber: result.receipt.receiptNumber,
    });
    await prisma.receipt.update({ where: { id: result.receipt.id }, data: { pdfUrl: publicPath } });

    res.status(201).json({
      ok: true,
      payment: result.payment,
      salary: result.updatedSalary,
      expense: result.expense,
      receipt: { ...result.receipt, pdfUrl: publicPath },
    });
  } catch (err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    if (err.code === "P2002") return res.status(409).json({ error: "This salary has already been paid." });
    throw err;
  }
});

function httpError(status, message) {
  const e = new Error(message);
  e.httpStatus = status;
  return e;
}

module.exports = router;
