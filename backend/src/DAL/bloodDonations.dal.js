// DAL: all SQL about blood donations (offers, invitations, confirmations).
'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const notifications = require('./notifications.dal');
const stock = require('./bloodStock.dal');
const requests = require('./bloodRequests.dal');
const { ConflictError } = require('../shared/errors');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { DonationDTO } = require('../DTO/blood.dto');
const COLUMNS = `
  d.id, d.status, d.admin_note, d.reviewed_by, d.created_at, d.accepted_at, d.reviewed_at,
  d.donor_id, du.full_name AS donor_name, dbt.label AS donor_blood_type,
  d.request_id, r.hospital_name AS request_hospital, r.city AS request_city,
  rbt.label AS request_blood_type, r.urgency AS request_urgency, r.status AS request_status`;
const FROM = `
  FROM blood_donations d
  JOIN users du ON du.id = d.donor_id
  JOIN donor_profiles dp ON dp.user_id = d.donor_id
  JOIN blood_types dbt ON dbt.id = dp.blood_type_id
  LEFT JOIN blood_requests r ON r.id = d.request_id
  LEFT JOIN blood_types rbt ON rbt.id = r.blood_type_id`;
const SORT = {
  created_at: 'd.created_at'
};

async function findById(id) {
  const [row] = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE d.id = ?`, [id]);
  return row ? new DonationDTO(row) : null;
}

async function findByRequestAndDonor(requestId, donorId) {
  const [row] = await db.query(
    `SELECT ${COLUMNS} ${FROM} WHERE d.request_id = ? AND d.donor_id = ?`,
    [requestId, donorId]
  );
  return row ? new DonationDTO(row) : null;
}

async function findActiveIndependent(donorId) {
  const [row] = await db.query(
    "SELECT id, status FROM blood_donations WHERE donor_id = ? AND request_id IS NULL AND status IN ('pending', 'accepted') ORDER BY id DESC LIMIT 1",
    [donorId]
  );
  return row ?? null;
}

/** Donations still waiting on a request (invited, pending or accepted). */
async function listOpenForRequest(requestId) {
  const rows = await db.query(
    `SELECT ${COLUMNS} ${FROM} WHERE d.request_id = ? AND d.status IN ('invited', 'pending', 'accepted')`,
    [requestId]
  );
  return rows.map((r) => new DonationDTO(r));
}

/** @param {{ donorId?: number }} scope  a donor only sees their own donations */
async function list(filter, page, { donorId = null } = {}) {
  const where = [];
  const params = [];
  if (donorId) {
    where.push('d.donor_id = ?');
    params.push(donorId);
  }
  if (filter.status) {
    where.push('d.status = ?');
    params.push(filter.status);
  }
  if (filter.requestId) {
    where.push('d.request_id = ?');
    params.push(filter.requestId);
  }
  const { rows, total } = await db.paged({
    columns: COLUMNS,
    from: FROM,
    where,
    params,
    order: db.orderBy(SORT, page, 'd.id DESC'),
    page
  });
  return {
    rows: rows.map((r) => new DonationDTO(r)),
    total
  };
}

/** An offer by a donor (pending) or an invitation by an admin (invited). */
async function create({
  donorId,
  requestId,
  status,
  notices = [],
  adminNotice = null,
  auditEntry = null
}) {
  const id = await db.transaction(async (conn) => {
    const { insertId } = await db.query(
      'INSERT INTO blood_donations (donor_id, request_id, status) VALUES (?, ?, ?)',
      [donorId, requestId, status],
      conn
    );
    await notifications.create(notices, conn);
    if (adminNotice) {
      await notifications.createForRole('admin', adminNotice, conn);
    }
    if (auditEntry) {
      await audit.record(
        new AuditEntryDTO({
          ...auditEntry,
          entityId: insertId
        }),
        conn
      );
    }
    return insertId;
  });
  return findById(id);
}

/** The donor's answer to an invitation: invited -> pending (donor agreed) or declined; admin acceptance is separate. */
async function respond({ donationId, donorId, status, notices, adminNotice }) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      "UPDATE blood_donations SET status = ? WHERE id = ? AND donor_id = ? AND status = 'invited'",
      [status, donationId, donorId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError('This invitation was already answered or withdrawn.');
    }
    await notifications.create(notices, conn);
    await notifications.createForRole('admin', adminNotice, conn);
  });
  return findById(donationId);
}

/** The donor takes back their own pending or accepted offer. */
async function withdraw({ donationId, donorId, adminNotice }) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      "UPDATE blood_donations SET status = 'cancelled', admin_note = 'Withdrawn by the donor.' WHERE id = ? AND donor_id = ? AND status IN ('pending', 'accepted')",
      [donationId, donorId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError('Only a pending or accepted offer can be withdrawn.');
    }
    await notifications.createForRole('admin', adminNotice, conn);
  });
  return findById(donationId);
}

/** An admin cancels a donation that has not happened (no-show, failed screening...). */
async function cancel({ donationId, note, reviewedBy, notices, auditEntry }) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      `UPDATE blood_donations SET status = 'cancelled', admin_note = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status IN ('invited', 'pending', 'accepted')`,
      [note, reviewedBy, donationId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError(
        'Only an invited, pending or accepted donation can be cancelled.'
      );
    }
    await notifications.create(notices, conn);
    await audit.record(auditEntry, conn);
  });
  return findById(donationId);
}

/**
 * An admin confirms the donation happened. In one transaction:
 * the donation is completed, the donor's last donation date is set, and the unit goes
 * either to the request (progress) or to the blood bank (stockIn), as the BLL decided.
 */
async function complete({
  donationId,
  reviewedBy,
  donorId,
  donationDate,
  cutoffDate,
  progress,
  stockIn,
  notices,
  auditEntry
}) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      `UPDATE blood_donations SET status = 'completed', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status = 'accepted'`,
      [reviewedBy, donationId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError(
        'Only an accepted donation can be confirmed as physically received.'
      );
    }
    const updated = await db.query(
      'UPDATE donor_profiles SET last_donation_date = ? WHERE user_id = ? AND (last_donation_date IS NULL OR last_donation_date <= ?)',
      [donationDate, donorId, cutoffDate],
      conn
    );
    if (updated.affectedRows !== 1) {
      throw new ConflictError('This donor is no longer eligible to donate.');
    }
    if (progress) {
      await requests.applyProgress(progress, conn);
    }
    if (stockIn) {
      await stock.addUnits(
        {
          ...stockIn,
          donationId
        },
        conn
      );
    }
    await notifications.create(notices, conn);
    await audit.record(auditEntry, conn);
  });
  return findById(donationId);
}

async function accept({ donationId, notices, auditEntry }) {
  await db.transaction(async (conn) => {
    const result = await db.query(
      `UPDATE blood_donations d LEFT JOIN blood_requests r ON r.id = d.request_id
      SET d.status = 'accepted', d.accepted_at = UTC_TIMESTAMP()
      WHERE d.id = ? AND d.status = 'pending' AND (d.request_id IS NULL OR r.status = 'open')`,
      [donationId],
      conn
    );
    if (result.affectedRows !== 1) {
      throw new ConflictError('This offer changed or its request is no longer open.');
    }
    await notifications.create(notices, conn);
    await audit.record(auditEntry, conn);
  });
  return findById(donationId);
}
// Reuse the unique donor/request record and require a fresh admin decision.
async function reopenWithdrawn(id, { donorId, requestId, notices, adminNotice }) {
  return db.transaction(async (conn) => {
    const result = await db.query(
      `UPDATE blood_donations d JOIN blood_requests r ON r.id = d.request_id
       JOIN users u ON u.id = d.donor_id
       SET d.status = 'pending', d.admin_note = NULL, d.accepted_at = NULL, d.reviewed_at = NULL
       WHERE d.id = ? AND d.donor_id = ? AND d.request_id = ? AND d.status = 'cancelled'
       AND d.admin_note = 'Withdrawn by the donor.' AND d.reviewed_by IS NULL
       AND r.status = 'open' AND u.is_active = TRUE`,
      [id, donorId, requestId],
      conn
    );
    if (result.affectedRows !== 1)
      throw new ConflictError('This offer can no longer be submitted again.');
    await notifications.create(notices, conn);
    await notifications.createForRole('admin', adminNotice, conn);
    await audit.record(
      new AuditEntryDTO({
        userId: donorId,
        action: 'blood_donation.offered_again',
        entity: 'blood_donation',
        entityId: id
      }),
      conn
    );
    const [row] = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE d.id = ?`, [id], conn);
    return new DonationDTO(row);
  });
}
module.exports = {
  reopenWithdrawn,
  findById,
  findByRequestAndDonor,
  findActiveIndependent,
  listOpenForRequest,
  list,
  create,
  respond,
  withdraw,
  cancel,
  accept,
  complete
};
