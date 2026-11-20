// PL: rules shared by every list endpoint, and the step that turns the
// validated query into a PageRequestDTO for the BLL.
//   ?page=2&limit=20&sort=-created_at   -> page 2, 20 rows, newest first
'use strict';

const { query } = require('express-validator');
const { PageRequestDTO } = require('../../DTO/common.dto');
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** @param {string[]} sortFields  public names the list may be sorted by */
function listRules(sortFields) {
  const allowed = [];
  for (const field of sortFields) {
    allowed.push(field); // ascending, e.g. created_at
    allowed.push('-' + field); // descending, e.g. -created_at
  }
  return [
    query('page')
      .optional()
      .isInt({
        min: 1,
        max: 100000
      })
      .withMessage('must be a whole number from 1 to 100000')
      .toInt(),
    query('limit')
      .optional()
      .isInt({
        min: 1,
        max: MAX_LIMIT
      })
      .withMessage(`must be a whole number from 1 to ${MAX_LIMIT}`)
      .toInt(),
    query('sort')
      .optional()
      .isIn(allowed)
      .withMessage(`must be one of: ${allowed.join(', ')}`)
  ];
}

function toPageRequest(valid, defaultSort) {
  const sort = valid.sort ?? defaultSort;
  const descending = sort.startsWith('-');
  return new PageRequestDTO({
    page: valid.page ?? 1,
    limit: valid.limit ?? DEFAULT_LIMIT,
    sortField: descending ? sort.slice(1) : sort,
    sortDirection: descending ? 'DESC' : 'ASC'
  });
}
module.exports = {
  listRules,
  toPageRequest,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
