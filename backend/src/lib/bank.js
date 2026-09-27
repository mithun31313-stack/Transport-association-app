// Mask an account number for display: keep last 4 digits only.
// e.g. "1234567890123456" -> "XXXX XXXX XXXX 3456"
function maskAccountNumber(accountNumber) {
  if (!accountNumber) return "";
  const last4 = accountNumber.slice(-4);
  const groups = Math.max(1, Math.ceil((accountNumber.length - 4) / 4));
  return `${"XXXX ".repeat(groups).trim()} ${last4}`;
}

module.exports = { maskAccountNumber };
