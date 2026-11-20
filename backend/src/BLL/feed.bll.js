'use strict';

const feedDAL = require('../DAL/feed.dal');
const { PageDTO } = require('../DTO/common.dto');

async function list(filter, page) {
  const result = await feedDAL.list(filter, page);
  return new PageDTO(result.rows, page, result.total);
}

async function map(page, filter) {
  const result = await feedDAL.map(page, filter);
  return new PageDTO(result.rows, page, result.total);
}
module.exports = {
  list,
  map,
  stats: () => feedDAL.stats()
};
