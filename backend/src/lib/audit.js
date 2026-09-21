// Writes an audit log entry. Accepts an optional Prisma transaction client (tx)
// so audit entries can be committed atomically with the operation they describe.
async function writeAudit(db, { userId, action, entity, entityId, oldValue = null, newValue = null }) {
  return db.auditLog.create({
    data: { userId, action, entity, entityId, oldValue, newValue },
  });
}

module.exports = { writeAudit };
