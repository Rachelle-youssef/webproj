// DTOs shared by every list endpoint.
'use strict';

/** PL -> BLL -> DAL: which page of a list to fetch, and in which order. */
class PageRequestDTO {
  constructor({ page, limit, sortField, sortDirection }) {
    this.page = page;
    this.limit = limit;
    this.sortField = sortField; // public field name, e.g. created_at
    this.sortDirection = sortDirection; // 'ASC' or 'DESC'
  }
}

/** BLL -> PL: one page of results plus the numbers the interface needs for paging. */
class PageDTO {
  constructor(items, { page, limit }, total) {
    this.items = items;
    this.meta = {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    };
  }
}

/** BLL -> PL: result of the health check. */
class HealthDTO {
  constructor({ status, database, version, uptime_seconds, time }) {
    this.status = status;
    this.database = database;
    this.version = version;
    this.uptime_seconds = uptime_seconds;
    this.time = time;
  }
}

module.exports = {
  PageRequestDTO,
  PageDTO,
  HealthDTO
};
