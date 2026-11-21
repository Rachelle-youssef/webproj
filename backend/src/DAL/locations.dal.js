// External place data. Only button-triggered hospital searches go to Nominatim.
'use strict';
const config = require('../config');
const { HospitalLocationDTO } = require('../DTO/location.dto');
const { ServiceUnavailableError } = require('../shared/errors');
const cache = new Map();
const pending = new Map();
let queue = Promise.resolve();
let nextRequestAt = 0;

async function fetchHospitals({ name, city }) {
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  nextRequestAt = Date.now() + 1100; // One shared request per second, not per user.
  try {
    const url = new URL(config.geocodingUrl);
    url.searchParams.set('q', `${name}, ${city}, Lebanon`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('countrycodes', 'lb');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LifeLink/3.0 (https://github.com/Rachelle-youssef/webproj)',
        Accept: 'application/json',
        'Accept-Language': 'en,ar'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Search provider unavailable');
    const places = await response.json();
    if (!Array.isArray(places)) throw new Error('Invalid search response');
    const hospitals = [];
    const seen = new Set();
    for (const place of places.slice(0, 5)) {
      // Never replace a hospital pin with a city centre or an unrelated business.
      if (place.address?.country_code !== 'lb') continue;
      if (!['hospital', 'clinic', 'doctors', 'medical_centre'].includes(place.type))
        continue;
      const result = new HospitalLocationDTO(place);
      if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude))
        continue;
      const key = `${result.latitude},${result.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hospitals.push(result);
    }
    return hospitals;
  } catch {
    throw new ServiceUnavailableError(
      'Hospital search is unavailable. Try again later or select the hospital on the map.'
    );
  }
}

async function search(input) {
  const key = `${input.name.trim().toLowerCase()}|${input.city.trim().toLowerCase()}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.results;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 3) {
    throw new ServiceUnavailableError(
      'Hospital search is busy. Please try again shortly.'
    );
  }
  const task = queue.then(() => fetchHospitals(input));
  queue = task.catch(() => {}); // A failed search must not stop later searches.
  const result = task
    .then((results) => {
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { results, expires: Date.now() + 24 * 60 * 60 * 1000 });
      return results;
    })
    .finally(() => pending.delete(key));
  pending.set(key, result);
  return result;
}

module.exports = { search };
