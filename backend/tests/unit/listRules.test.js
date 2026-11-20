// The PL validates ?page=, ?limit= and ?sort= and turns them into a PageRequestDTO.
'use strict';

const express = require('express');
const request = require('supertest');
const { listRules, toPageRequest } = require('../../src/PL/validators/common.validators');
const { validate } = require('../../src/PL/middleware/validate');
const { errorHandler } = require('../../src/PL/middleware/errorHandler');
const { PageRequestDTO, PageDTO } = require('../../src/DTO/common.dto');
const app = express();
app.get('/list', validate(listRules(['created_at', 'urgency'])), (req, res) =>
  res.json(toPageRequest(req.valid, '-created_at'))
);
app.use(errorHandler);
describe('list options', () => {
  test('default to page 1, 20 rows, newest first', async () => {
    const res = await request(app).get('/list');
    expect(res.body).toEqual({
      page: 1,
      limit: 20,
      sortField: 'created_at',
      sortDirection: 'DESC'
    });
  });
  test('read page, limit and an ascending sort', async () => {
    const res = await request(app).get('/list?page=3&limit=10&sort=urgency');
    expect(res.body).toEqual({
      page: 3,
      limit: 10,
      sortField: 'urgency',
      sortDirection: 'ASC'
    });
  });
  test.each([
    ['page=0', 'page'],
    ['page=abc', 'page'],
    ['page=1.5', 'page'],
    ['limit=101', 'limit'],
    ['limit=-5', 'limit'],
    ['sort=id;DROP TABLE users', 'sort'],
    ['sort=toString', 'sort']
  ])('refuse %s', async (qs, field) => {
    const res = await request(app).get(`/list?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe(field);
  });
  test('toPageRequest builds a PageRequestDTO', () => {
    expect(toPageRequest({}, '-created_at')).toBeInstanceOf(PageRequestDTO);
  });
});
describe('PageDTO', () => {
  test('counts pages, with at least one page', () => {
    expect(
      new PageDTO(
        [],
        {
          page: 2,
          limit: 20
        },
        57
      ).meta
    ).toEqual({
      page: 2,
      limit: 20,
      total: 57,
      pages: 3
    });
    expect(
      new PageDTO(
        [],
        {
          page: 1,
          limit: 20
        },
        0
      ).meta
    ).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      pages: 1
    });
  });
});
