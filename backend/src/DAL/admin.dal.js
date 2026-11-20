'use strict';

const db = require('./db');
const { AuditViewDTO } = require('../DTO/community.dto');

async function stats() {
  const [counts] = await db.query(`SELECT
    (SELECT COUNT(*) FROM blood_requests WHERE status = 'open') AS open_requests,
    (SELECT COUNT(*) FROM blood_requests WHERE status = 'pending') AS pending_requests,
    (SELECT COUNT(*) FROM blood_donations WHERE status = 'pending') AS pending_donations,
    (SELECT COUNT(*) FROM blood_donations WHERE status = 'accepted') AS accepted_donations,
    (SELECT COUNT(*) FROM blood_donations WHERE status = 'completed') AS completed_donations,
    (SELECT COUNT(*) FROM medicines WHERE status = 'pending') AS pending_medicines,
    (SELECT COUNT(*) FROM medicine_requests WHERE status = 'pending') AS pending_medicine_requests,
    (SELECT COUNT(*) FROM medicine_calls WHERE status = 'open') AS open_medicine_calls,
    (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'donor' AND u.is_active = TRUE) AS donors`);
  const daily = await db.query(`SELECT d, SUM(n) AS n FROM (
    SELECT DATE(created_at) AS d, COUNT(*) AS n FROM medicines
    WHERE created_at >= UTC_DATE() - INTERVAL 13 DAY GROUP BY DATE(created_at)
    UNION ALL SELECT DATE(created_at), COUNT(*) FROM blood_donations
    WHERE status IN ('pending', 'accepted', 'completed') AND created_at >= UTC_DATE() - INTERVAL 13 DAY GROUP BY DATE(created_at)
  ) events GROUP BY d ORDER BY d`);
  const urgency = await db.query(
    "SELECT urgency, COUNT(*) AS n FROM blood_requests WHERE status = 'open' GROUP BY urgency"
  );
  const stock = await db.query(
    'SELECT bt.label AS blood_type, bs.units_available FROM blood_stock bs JOIN blood_types bt ON bt.id = bs.blood_type_id ORDER BY bt.id'
  );
  return {
    ...counts,
    daily,
    urgency,
    stock
  };
}

async function auditLogs(filter, page) {
  const where = [],
    params = [];
  for (const field of ['action', 'entity', 'user_id']) {
    if (filter[field] !== undefined) {
      where.push(`${field} = ?`);
      params.push(filter[field]);
    }
  }
  const result = await db.paged({
    columns: 'id, user_id, action, entity, entity_id, ip_address, created_at',
    from: 'FROM audit_logs',
    where,
    params,
    order: db.orderBy(
      {
        created_at: 'created_at'
      },
      page,
      'id DESC'
    ),
    page
  });
  return {
    rows: result.rows.map((r) => new AuditViewDTO(r)),
    total: result.total
  };
}
module.exports = {
  stats,
  auditLogs
};
