// DAL: blood bank stock levels and the history of every change to them.
'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const { ConflictError } = require('../shared/errors');
const { StockLevelDTO, StockMovementDTO } = require('../DTO/blood.dto');

async function levels() {
  const rows =
    await db.query(`SELECT s.blood_type_id, bt.label AS blood_type, s.units_available, s.updated_at
     FROM blood_stock s JOIN blood_types bt ON bt.id = s.blood_type_id ORDER BY s.blood_type_id`);
  return rows.map((r) => new StockLevelDTO(r));
}

async function level(bloodTypeId) {
  const [row] = await db.query(
    `SELECT s.blood_type_id, bt.label AS blood_type, s.units_available, s.updated_at
     FROM blood_stock s JOIN blood_types bt ON bt.id = s.blood_type_id WHERE s.blood_type_id = ?`,
    [bloodTypeId]
  );
  return row ? new StockLevelDTO(row) : null;
}

async function recordMovement(
  {
    bloodTypeId,
    change,
    reason,
    donationId = null,
    requestId = null,
    createdBy = null,
    note = null
  },
  conn
) {
  await db.query(
    `INSERT INTO blood_stock_movements (blood_type_id, change_units, reason, donation_id, request_id, created_by, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [bloodTypeId, change, reason, donationId, requestId, createdBy, note],
    conn
  );
}

/** Adds units and records why. Used inside another DAL transaction (conn). */
async function addUnits({ bloodTypeId, units, ...movement }, conn) {
  await db.query(
    'UPDATE blood_stock SET units_available = units_available + ? WHERE blood_type_id = ?',
    [units, bloodTypeId],
    conn
  );
  await recordMovement(
    {
      bloodTypeId,
      change: units,
      ...movement
    },
    conn
  );
}

/**
 * Removes units and records why. The WHERE clause only matches when enough units are left,
 * so two admins taking the last units at the same moment cannot push the stock below zero.
 */
async function removeUnits({ bloodTypeId, units, ...movement }, conn) {
  const result = await db.query(
    'UPDATE blood_stock SET units_available = units_available - ? WHERE blood_type_id = ? AND units_available >= ?',
    [units, bloodTypeId, units],
    conn
  );
  if (result.affectedRows !== 1) {
    throw new ConflictError('There are not enough units of this blood type in stock.');
  }
  await recordMovement(
    {
      bloodTypeId,
      change: -units,
      ...movement
    },
    conn
  );
}

/** A manual correction by an admin (opening stock, discarded or expired units...). */
async function adjust({ bloodTypeId, changeUnits, note, createdBy, auditEntry }) {
  await db.transaction(async (conn) => {
    const movement = {
      bloodTypeId,
      reason: 'adjustment',
      createdBy,
      note
    };
    if (changeUnits > 0) {
      await addUnits(
        {
          ...movement,
          units: changeUnits
        },
        conn
      );
    } else {
      await removeUnits(
        {
          ...movement,
          units: -changeUnits
        },
        conn
      );
    }
    await audit.record(auditEntry, conn);
  });
  return level(bloodTypeId);
}
const MOVEMENT_SORT = {
  created_at: 'm.created_at'
};

async function listMovements(filter, page) {
  const where = [];
  const params = [];
  if (filter.bloodTypeId) {
    where.push('m.blood_type_id = ?');
    params.push(filter.bloodTypeId);
  }
  if (filter.reason) {
    where.push('m.reason = ?');
    params.push(filter.reason);
  }
  const { rows, total } = await db.paged({
    columns: `m.id, bt.label AS blood_type, m.change_units, m.reason, m.donation_id, m.request_id,
              cu.full_name AS created_by_name, m.note, m.created_at`,
    from: `FROM blood_stock_movements m
           JOIN blood_types bt ON bt.id = m.blood_type_id
           LEFT JOIN users cu ON cu.id = m.created_by`,
    where,
    params,
    order: db.orderBy(MOVEMENT_SORT, page, 'm.id DESC'),
    page
  });
  return {
    rows: rows.map((r) => new StockMovementDTO(r)),
    total
  };
}
module.exports = {
  levels,
  level,
  addUnits,
  removeUnits,
  adjust,
  listMovements
};
