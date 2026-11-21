'use strict';
const locationsDAL = require('../DAL/locations.dal');
const requestsDAL = require('../DAL/bloodRequests.dal');

async function search(input) {
  const candidates = await locationsDAL.search(input);
  const results = [];
  for (const hospital of candidates) {
    const insideLebanon = await requestsDAL.isLebanonLocation(
      hospital.latitude,
      hospital.longitude
    );
    if (insideLebanon) results.push(hospital);
  }
  return results;
}

module.exports = { search };
