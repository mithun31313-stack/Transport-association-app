const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const RECEIPT_DIR = path.join(__dirname, "..", "..", "receipts");
if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true });

/**
 * Generates a salary payment receipt PDF and returns { filePath, publicPath }.
 * publicPath is served statically at /receipts/<file> — see index.js.
 */
function generateSalaryReceiptPdf({ settings, salary, driver, payment, receiptNumber }) {
  return new Promise((resolve, reject) => {
    const fileName = `${receiptNumber}.pdf`;
    const filePath = path.join(RECEIPT_DIR, fileName);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text(settings?.associationName || "Transport Association", { align: "center" });
    doc.fontSize(12).fillColor("#555").text("SALARY PAYMENT RECEIPT", { align: "center" });
    doc.moveDown(1.5);
    doc.fillColor("#000");

    doc.fontSize(10).text(`Receipt Number: ${receiptNumber}`);
    doc.text(`Payment Date: ${new Date(payment.paymentDate).toLocaleDateString("en-IN")}`);
    doc.moveDown();

    doc.fontSize(12).text("Driver Details", { underline: true });
    doc.fontSize(10)
      .text(`Name: ${driver.fullName}`)
      .text(`Employee ID: ${driver.employeeId}`);
    doc.moveDown();

    doc.fontSize(12).text("Salary Details", { underline: true });
    doc.fontSize(10)
      .text(`Month: ${salary.month}/${salary.year}`)
      .text(`Basic Salary: Rs. ${salary.basicSalary}`)
      .text(`Allowance: Rs. ${salary.allowance}`)
      .text(`Bonus: Rs. ${salary.bonus}`)
      .text(`Other Payment: Rs. ${salary.otherPayment}`)
      .text(`Advance: Rs. ${salary.advance}`)
      .text(`Deduction: Rs. ${salary.deduction}`)
      .fontSize(12)
      .text(`NET SALARY: Rs. ${salary.netSalary}`, { underline: true });
    doc.moveDown();

    doc.fontSize(12).text("Payment Details", { underline: true });
    doc.fontSize(10)
      .text(`Payment Method: Manual Bank Transfer`)
      .text(`Bank: ${payment.bankName}`)
      .text(`Account: ${payment.maskedAccountNumber}`)
      .text(`IFSC: ${payment.ifsc}`)
      .text(`UTR / Transaction Reference: ${payment.utr}`)
      .text(`Status: PAID`);

    doc.moveDown(2);
    doc.fontSize(8).fillColor("#888").text("Computer generated receipt.", { align: "center" });

    doc.end();
    stream.on("finish", () => resolve({ filePath, publicPath: `/receipts/${fileName}` }));
    stream.on("error", reject);
  });
}

module.exports = { generateSalaryReceiptPdf };
