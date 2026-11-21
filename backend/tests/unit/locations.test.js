'use strict';
const locations = require('../../src/DAL/locations.dal');
const { ServiceUnavailableError } = require('../../src/shared/errors');
const place = {
  name: 'QA Hospital',
  display_name: 'QA Hospital, Beirut, Lebanon',
  type: 'hospital',
  lat: '33.89',
  lon: '35.51',
  address: { country_code: 'lb' }
};
let fetchMock;
beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => jest.restoreAllMocks());
function reply(data, status = 200) {
  fetchMock.mockResolvedValue({ ok: status === 200, json: async () => data });
}

test('uses Lebanon-only parameters, an identifying user agent, and returns coordinates as numbers', async () => {
  reply([place]);
  const results = await locations.search({ name: 'QA Hospital', city: 'Beirut' });
  expect(results[0]).toMatchObject({
    name: place.name,
    latitude: 33.89,
    longitude: 35.51
  });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url.searchParams.get('countrycodes')).toBe('lb');
  expect(url.searchParams.get('q')).toBe('QA Hospital, Beirut, Lebanon');
  expect(options.headers['User-Agent']).toContain('LifeLink');
  expect(options.signal).toBeDefined();
});

test('cached searches ignore letter case and do not call the provider again', async () => {
  reply([place]);
  await locations.search({ name: 'qa hospital', city: 'BEIRUT' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('filters city centres, foreign results, invalid coordinates and duplicate pins', async () => {
  reply([
    { ...place, type: 'city' },
    { ...place, address: { country_code: 'fr' } },
    { ...place, lat: 'invalid' },
    place,
    place
  ]);
  const results = await locations.search({ name: 'Filter Hospital', city: 'Beirut' });
  expect(results).toHaveLength(1);
});

test('identical concurrent searches share one provider request', async () => {
  reply([place]);
  const query = { name: 'Concurrent Hospital', city: 'Beirut' };
  await Promise.all([locations.search(query), locations.search(query)]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('provider rate limits, bad payloads and network failures return a safe unavailable error', async () => {
  reply([], 429);
  await expect(
    locations.search({ name: 'Busy Hospital', city: 'Beirut' })
  ).rejects.toBeInstanceOf(ServiceUnavailableError);
  reply({ error: 'bad data' });
  await expect(
    locations.search({ name: 'Bad Hospital', city: 'Beirut' })
  ).rejects.toBeInstanceOf(ServiceUnavailableError);
  fetchMock.mockRejectedValue(new Error('private provider failure'));
  await expect(
    locations.search({ name: 'Offline Hospital', city: 'Beirut' })
  ).rejects.toThrow('Hospital search is unavailable');
}, 10000);

test('different searches are serialised with at least one second between start times', async () => {
  const starts = [];
  fetchMock.mockImplementation(async () => {
    starts.push(Date.now());
    return { ok: true, json: async () => [place] };
  });
  await Promise.all([
    locations.search({ name: 'Queue One', city: 'Beirut' }),
    locations.search({ name: 'Queue Two', city: 'Beirut' })
  ]);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
});
