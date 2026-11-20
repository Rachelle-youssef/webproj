// DAL: all SQL about blood requests, donor matching and blood compatibility.
'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const notifications = require('./notifications.dal');
const stock = require('./bloodStock.dal');
const { ConflictError, NotFoundError } = require('../shared/errors');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { BloodRequestDTO, OpenBloodRequestDTO, MatchDTO } = require('../DTO/blood.dto');
const lebanonGeometry = JSON.stringify(require('../shared/lebanon.json').geometry);

async function isLebanonLocation(latitude, longitude) {
  const [row] = await db.query(
    'SELECT ST_Intersects(ST_GeomFromGeoJSON(?, 1, 0), POINT(?, ?)) AS inside',
    [lebanonGeometry, longitude, latitude]
  );
  return Boolean(row.inside);
}

async function updateLocation({
  requestId,
  userId,
  isAdmin,
  latitude,
  longitude,
  auditEntry
}) {
  await db.transaction(async (conn) => {
    const [current] = await db.query(
      'SELECT requester_id, status FROM blood_requests WHERE id = ? FOR UPDATE',
      [requestId],
      conn
    );
    if (!current || (!isAdmin && current.requester_id !== userId)) {
      throw new NotFoundError('Blood request not found.');
    }
    if (!['pending', 'open'].includes(current.status)) {
      throw new ConflictError(
        'Only pending or open requests can have their location updated.'
      );
    }
    await db.query(
      'UPDATE blood_requests SET latitude = ?, longitude = ?, has_hospital_pin = TRUE WHERE id = ?',
      [latitude, longitude, requestId],
      conn
    );
    await audit.record(auditEntry, conn);
  });
  return findById(requestId);
}
const COLUMNS = `
  r.id, r.has_hospital_pin, r.requester_id, q.full_name AS requester_name, r.blood_type_id, bt.label AS blood_type,
  r.units_needed, r.units_received, r.urgency, r.hospital_name, r.city, r.latitude, r.longitude,
  r.status, r.admin_note, r.created_at, r.reviewed_at`;
const FROM = `
  FROM blood_requests r
  JOIN blood_types bt ON bt.id = r.blood_type_id
  JOIN users q ON q.id = r.requester_id`;

// urgency is an ENUM ordered normal < urgent < sos, so "-urgency" lists SOS first.
const SORT = {
  created_at: 'r.created_at',
  urgency: 'r.urgency',
  units_needed: 'r.units_needed'
};
const TIE_BREAK = 'r.created_at DESC, r.id DESC';

function filterSql(filter) {
  const where = [];
  const params = [];
  if (filter.status) {
    where.push('r.status = ?');
    params.push(filter.status);
  }
  if (filter.urgency) {
    where.push('r.urgency = ?');
    params.push(filter.urgency);
  }
  if (filter.bloodTypeId) {
    where.push('r.blood_type_id = ?');
    params.push(filter.bloodTypeId);
  }
  if (filter.city) {
    where.push('r.city = ?');
    params.push(filter.city);
  }
  return {
    where,
    params
  };
}

async function findById(id) {
  const [row] = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE r.id = ?`, [id]);
  return row ? new BloodRequestDTO(row) : null;
}

async function countActive(requesterId) {
  const [{ total }] = await db.query(
    "SELECT COUNT(*) AS total FROM blood_requests WHERE requester_id = ? AND status IN ('pending', 'open')",
    [requesterId]
  );
  return total;
}

async function isCompatible(donorBloodTypeId, recipientBloodTypeId) {
  const [row] = await db.query(
    'SELECT 1 AS ok FROM blood_compatibility WHERE donor_blood_type_id = ? AND recipient_blood_type_id = ?',
    [donorBloodTypeId, recipientBloodTypeId]
  );
  return Boolean(row);
}

/** Admins: every request. */
async function listAll(filter, page) {
  const { where, params } = filterSql(filter);
  const { rows, total } = await db.paged({
    columns: COLUMNS,
    from: FROM,
    where,
    params,
    order: db.orderBy(SORT, page, TIE_BREAK),
    page
  });
  return {
    rows: rows.map((r) => new BloodRequestDTO(r)),
    total
  };
}

/** Recipients and hospitals: only their own requests. */
async function listByRequester(requesterId, filter, page) {
  const { where, params } = filterSql(filter);
  const { rows, total } = await db.paged({
    columns: COLUMNS,
    from: FROM,
    where: ['r.requester_id = ?', ...where],
    params: [requesterId, ...params],
    order: db.orderBy(SORT, page, TIE_BREAK),
    page
  });
  return {
    rows: rows.map((r) => new BloodRequestDTO(r)),
    total
  };
}

/** Donors: open requests their blood type can be given to, with their own answer if any. */
async function listOpenForDonor({ donorId, bloodTypeId }, filter, page) {
  const { where, params } = filterSql({
    ...filter,
    status: null
  });
  const from = `${FROM}
    JOIN blood_compatibility c ON c.recipient_blood_type_id = r.blood_type_id AND c.donor_blood_type_id = ?
    LEFT JOIN blood_donations mine ON mine.request_id = r.id AND mine.donor_id = ?`;
  const { rows, total } = await db.paged({
    columns: `${COLUMNS}, mine.status AS my_response, mine.admin_note AS my_response_note, mine.reviewed_by AS my_response_reviewer`,
    from,
    where: ["r.status = 'open'", ...where],
    params: [bloodTypeId, donorId, ...params],
    order: db.orderBy(SORT, page, TIE_BREAK),
    page
  });
  return {
    rows: rows.map((r) => new OpenBloodRequestDTO(r)),
    total
  };
}

async function create(request, requesterId, { adminNotice, auditEntry }) {
  const id = await db.transaction(async (conn) => {
    const { insertId } = await db.query(
      `INSERT INTO blood_requests (requester_id, blood_type_id, units_needed, urgency, hospital_name, city, latitude, longitude, has_hospital_pin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requesterId,
        request.blood_type_id,
        request.units_needed,
        request.urgency,
        request.hospital_name,
        request.city,
        request.latitude,
        request.longitude,
        request.has_hospital_pin
      ],
      conn
    );
    await notifications.createForRole('admin', adminNotice, conn);
    await audit.record(
      new AuditEntryDTO({
        ...auditEntry,
        entityId: insertId
      }),
      conn
    );
    return insertId;
  });
  return findById(id);
}

/** pending -> open (approved) or cancelled (denied). Fails if someone reviewed it first. */
async function review({ requestId, status, note, reviewedBy, notices, auditEntry }) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      `UPDATE blood_requests SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status = 'pending'`,
      [status, note, reviewedBy, requestId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError('This request has already been reviewed.');
    }
    await notifications.create(notices, conn);
    await audit.record(auditEntry, conn);
  });
  return findById(requestId);
}

/** Cancels the request and every donation still waiting on it. */
async function cancel({ requestId, note, notices, auditEntry }) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      "UPDATE blood_requests SET status = 'cancelled', admin_note = COALESCE(?, admin_note) WHERE id = ? AND status IN ('pending', 'open')",
      [note, requestId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError('Only pending or open requests can be cancelled.');
    }
    await db.query(
      "UPDATE blood_donations SET status = 'cancelled', admin_note = 'The request was cancelled.' WHERE request_id = ? AND status IN ('invited', 'pending', 'accepted')",
      [requestId],
      conn
    );
    await notifications.create(notices, conn);
    await audit.record(auditEntry, conn);
  });
  return findById(requestId);
}

/**
 * Records units received, as the BLL calculated them. The WHERE clause checks that nobody
 * changed the request since the BLL read it (optimistic locking); otherwise nothing is saved.
 */
async function applyProgress(
  { requestId, expectedReceived, newReceived, newStatus },
  conn
) {
  const result = await db.query(
    "UPDATE blood_requests SET units_received = ?, status = ? WHERE id = ? AND status = 'open' AND units_received = ?",
    [newReceived, newStatus, requestId, expectedReceived],
    conn
  );
  if (result.affectedRows !== 1) {
    throw new ConflictError(
      'This request changed while you were working on it. Reload it and try again.'
    );
  }
}

/** Gives units from the blood bank to a request: stock down, request progress up, all or nothing. */
async function dispense({
  bloodTypeId,
  units,
  note,
  createdBy,
  progress,
  notices,
  auditEntry
}) {
  await db.transaction(async (conn) => {
    await stock.removeUnits(
      {
        bloodTypeId,
        units,
        reason: 'dispensed',
        requestId: progress.requestId,
        createdBy,
        note
      },
      conn
    );
    await applyProgress(progress, conn);
    await notifications.create(notices, conn);
    await audit.record(auditEntry, conn);
  });
  return findById(progress.requestId);
}

/**
 * Donors who can give blood for a request: compatible blood type, active, available,
 * last donation on or before cutoffDate, and not already linked to this request.
 * Nearest first when both sides have coordinates; donors without a location come last.
 */
async function findMatches({
  requestId,
  recipientBloodTypeId,
  latitude,
  longitude,
  cutoffDate,
  limit
}) {
  const hasLocation = latitude !== null && longitude !== null;
  const distance = hasLocation
    ? 'ROUND(ST_Distance_Sphere(POINT(u.longitude, u.latitude), POINT(?, ?)) / 1000, 1)'
    : 'NULL';
  const rows = await db.query(
    `SELECT u.id AS donor_id, u.full_name, bt.label AS blood_type, u.city, dp.last_donation_date, ${distance} AS distance_km
     FROM donor_profiles dp
     JOIN users u ON u.id = dp.user_id
     JOIN blood_types bt ON bt.id = dp.blood_type_id
     JOIN blood_compatibility c ON c.donor_blood_type_id = dp.blood_type_id AND c.recipient_blood_type_id = ?
     WHERE u.is_active = TRUE AND dp.is_available = TRUE
       AND (dp.last_donation_date IS NULL OR dp.last_donation_date <= ?)
       AND NOT EXISTS (SELECT 1 FROM blood_donations d WHERE d.request_id = ? AND d.donor_id = u.id)
     ORDER BY distance_km IS NULL, distance_km, u.full_name
     LIMIT ?`,
    [
      ...(hasLocation ? [longitude, latitude] : []),
      recipientBloodTypeId,
      cutoffDate,
      requestId,
      limit
    ]
  );
  return rows.map((r) => new MatchDTO(r));
}
module.exports = {
  findById,
  countActive,
  isCompatible,
  listAll,
  listByRequester,
  listOpenForDonor,
  create,
  review,
  cancel,
  applyProgress,
  dispense,
  findMatches,
  isLebanonLocation,
  updateLocation
};
