'use strict';

const db = require('./db');
const { FeedItemDTO } = require('../DTO/community.dto');
const lebanonGeometry = JSON.stringify(require('../shared/lebanon.json').geometry);
// Deliberately anonymous: no donor identity, contact details, blood type or home location.
const EVENTS = `FROM (
  SELECT bd.id, 'blood' AS kind, 'Blood donation confirmed' AS title, 1 AS quantity,
    bd.reviewed_at AS at, NULL AS city
  FROM blood_donations bd WHERE bd.status = 'completed'
  UNION ALL
  SELECT m.id, 'medicine', m.name, m.quantity_donated, m.reviewed_at, NULL
  FROM medicines m WHERE m.status IN ('approved', 'dispensed')
) events`;

async function list(filter, page) {
  const result = await db.paged({
    columns: 'id, kind, title, quantity, at, city',
    from: EVENTS,
    where: filter.kind ? ['kind = ?'] : [],
    params: filter.kind ? [filter.kind] : [],
    order: db.orderBy(
      {
        at: 'at'
      },
      page,
      'kind ASC, id DESC'
    ),
    page
  });
  return {
    rows: result.rows.map((r) => new FeedItemDTO(r)),
    total: result.total
  };
}

async function stats() {
  const [counts] = await db.query(`SELECT
    (SELECT COUNT(*) FROM blood_donations WHERE status = 'completed') AS blood_donations,
    (SELECT COALESCE(SUM(quantity_donated), 0) FROM medicines WHERE status IN ('approved', 'dispensed')) AS medicines,
    (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'donor' AND u.is_active = TRUE) AS donors,
    (SELECT COUNT(*) FROM blood_requests WHERE status = 'fulfilled') AS fulfilled`);
  const stock = await db.query(
    'SELECT bt.label AS blood_type, bs.units_available FROM blood_stock bs JOIN blood_types bt ON bt.id = bs.blood_type_id ORDER BY bt.id'
  );
  return {
    ...counts,
    stock
  };
}

async function map(page, filter = {}) {
  // Only locations explicitly attached to an open request. Never fall back to a user's home coordinates.
  const where = [
    "r.status = 'open'",
    "(role.name IN ('hospital', 'admin') OR (role.name = 'recipient' AND r.has_hospital_pin = TRUE))",
    'r.latitude IS NOT NULL',
    'r.longitude IS NOT NULL'
  ];
  const params = [];
  if (filter.bloodTypeId) {
    where.push('r.blood_type_id = ?');
    params.push(filter.bloodTypeId);
  }
  if (filter.urgency) {
    where.push('r.urgency = ?');
    params.push(filter.urgency);
  }
  if (filter.city) {
    where.push("LOCATE(?, COALESCE(r.city, '')) > 0");
    params.push(filter.city);
  }
  where.push(
    'ST_Intersects(ST_GeomFromGeoJSON(?, 1, 0), POINT(r.longitude, r.latitude))'
  );
  params.push(lebanonGeometry);
  return db.paged({
    columns:
      'r.id, r.hospital_name, r.city, r.latitude, r.longitude, r.urgency, r.units_needed, r.units_received, bt.label AS blood_type',
    from: 'FROM blood_requests r JOIN blood_types bt ON bt.id = r.blood_type_id JOIN users u ON u.id = r.requester_id JOIN roles role ON role.id = u.role_id',
    where,
    params,
    order: db.orderBy(
      {
        created_at: 'r.created_at'
      },
      page,
      'r.id DESC'
    ),
    page
  });
}
module.exports = {
  list,
  stats,
  map
};
