'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const audit = require('../src/DAL/audit.dal');
const {
  cleanDatabase,
  createUser,
  signIn,
  CSRF,
  setLastDonation,
  daysAgo
} = require('./helpers');
const app = createApp();
let admin, donor, other, patient, adminSession, donorSession, otherSession;
beforeEach(async () => {
  await cleanDatabase();
  admin = await createUser({
    role: 'admin'
  });
  donor = await createUser({
    bloodTypeId: 8
  });
  other = await createUser({
    bloodTypeId: 1
  });
  patient = await createUser({
    role: 'recipient'
  });
  adminSession = await signIn(app, admin);
  donorSession = await signIn(app, donor);
  otherSession = await signIn(app, other);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());
const callInput = {
  medicine_name: 'Paracetamol',
  quantity: 20,
  note: 'Sealed boxes only'
};
const bloodInput = {
  blood_type_id: 8,
  units_needed: 2,
  urgency: 'sos',
  hospital_name: 'LifeLink Hospital',
  city: 'Beirut',
  latitude: 33.89,
  longitude: 35.5
};

async function medicineCall() {
  const res = await adminSession.post('/api/v1/calls/medicine').set(CSRF).send(callInput);
  expect(res.status).toBe(201);
  return res.body.data.call.id;
}
describe('calls', () => {
  test('medicine call alerts active donors only and records its audit event', async () => {
    await createUser({
      isActive: false
    });
    const res = await adminSession
      .post('/api/v1/calls/medicine')
      .set(CSRF)
      .send({
        ...callInput,
        status: 'closed',
        created_by: donor.id
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      notified: 2,
      call: {
        status: 'open',
        ...callInput
      }
    });
    const notices = await db.query(
      "SELECT user_id FROM notifications WHERE type = 'medicine'"
    );
    expect(notices.map((n) => n.user_id).sort()).toEqual([donor.id, other.id].sort());
    const [entry] = await db.query(
      "SELECT user_id, entity_id FROM audit_logs WHERE action = 'call.medicine_created'"
    );
    expect(entry).toMatchObject({
      user_id: admin.id,
      entity_id: res.body.data.call.id
    });
  });
  test.each([
    {
      medicine_name: '',
      quantity: 1
    },
    {
      medicine_name: 'x',
      quantity: 1
    },
    {
      medicine_name: 'Test',
      quantity: 0
    },
    {
      medicine_name: 'Test',
      quantity: 100001
    },
    {
      medicine_name: 'Test',
      quantity: 1.2
    },
    {
      ...callInput,
      note: 'x'.repeat(301)
    }
  ])('rejects invalid medicine appeal %#', async (input) => {
    const res = await adminSession.post('/api/v1/calls/medicine').set(CSRF).send(input);
    expect(res.status).toBe(400);
    expect(await db.query('SELECT id FROM medicine_calls')).toHaveLength(0);
  });
  test('closing timestamps the call, hides it from donors, retains it for admin, and rejects repeat or unknown close', async () => {
    const id = await medicineCall();
    expect((await donorSession.get('/api/v1/calls')).body.meta.total).toBe(1);
    const res = await adminSession.patch(`/api/v1/calls/${id}/close`).set(CSRF);
    expect(res.status).toBe(200);
    expect(res.body.data.closed_at).toBeTruthy();
    expect((await donorSession.get('/api/v1/calls?status=closed')).body.meta.total).toBe(
      0
    );
    expect((await donorSession.get(`/api/v1/calls/${id}`)).status).toBe(404);
    expect((await adminSession.get('/api/v1/calls?status=closed')).body.meta.total).toBe(
      1
    );
    expect((await adminSession.patch(`/api/v1/calls/${id}/close`).set(CSRF)).status).toBe(
      409
    );
    expect(
      (await adminSession.patch('/api/v1/calls/4294967295/close').set(CSRF)).status
    ).toBe(404);
  });
  test('simultaneous close succeeds once', async () => {
    const id = await medicineCall();
    const replies = await Promise.all(
      [1, 2].map(() => adminSession.patch(`/api/v1/calls/${id}/close`).set(CSRF))
    );
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  test('medicine appeal and notices roll back when audit persistence fails', async () => {
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('test write failure'));
    expect(
      (await adminSession.post('/api/v1/calls/medicine').set(CSRF).send(callInput)).status
    ).toBe(500);
    expect(await db.query('SELECT id FROM medicine_calls')).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM notifications WHERE type = 'medicine'")
    ).toHaveLength(0);
  });
  test('blood call opens immediately and alerts only compatible, active, available, eligible donors', async () => {
    const recent = await createUser();
    await setLastDonation(recent.id, daysAgo(55));
    const eligible = await createUser();
    await setLastDonation(eligible.id, daysAgo(56));
    await createUser({
      isAvailable: false
    });
    await createUser({
      isActive: false
    });
    const res = await adminSession.post('/api/v1/calls/blood').set(CSRF).send(bloodInput);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'open',
      notified: 2
    });
    const alerts = await db.query(
      "SELECT user_id, link FROM notifications WHERE type = 'sos'"
    );
    expect(alerts.map((a) => a.user_id).sort()).toEqual([donor.id, eligible.id].sort());
    expect(alerts[0].link).toBe(`#/blood-requests/${res.body.data.id}`);
    const [row] = await db.query(
      'SELECT reviewed_by, reviewed_at FROM blood_requests WHERE id = ?',
      [res.body.data.id]
    );
    expect(row.reviewed_by).toBe(admin.id);
    expect(row.reviewed_at).toBeTruthy();
  });
  test('blood appeal rolls back request and alerts on failure', async () => {
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('test write failure'));
    expect(
      (await adminSession.post('/api/v1/calls/blood').set(CSRF).send(bloodInput)).status
    ).toBe(500);
    expect(await db.query('SELECT id FROM blood_requests')).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM notifications WHERE type = 'sos'")
    ).toHaveLength(0);
  });
  test('call pagination, filtering and sorting', async () => {
    await medicineCall();
    await adminSession.post('/api/v1/calls/medicine').set(CSRF).send({
      medicine_name: 'Insulin',
      quantity: 5
    });
    const res = await donorSession.get('/api/v1/calls?limit=1&sort=quantity');
    expect(res.body.meta).toMatchObject({
      total: 2,
      pages: 2
    });
    expect(res.body.data[0].quantity).toBe(5);
    expect(
      (await donorSession.get('/api/v1/calls?medicine_name=para')).body.meta.total
    ).toBe(1);
  });
});
describe('notification ownership', () => {
  test('list, filter, count, mark one and mark all affect only the signed-in user', async () => {
    await medicineCall();
    await medicineCall();
    const mine = await donorSession.get(
      '/api/v1/notifications?limit=1&type=medicine&is_read=false'
    );
    expect(mine.body.meta).toMatchObject({
      total: 2,
      pages: 2
    });
    expect(mine.body.data[0]).not.toHaveProperty('user_id');
    const id = mine.body.data[0].id;
    expect(
      (await otherSession.patch(`/api/v1/notifications/${id}/read`).set(CSRF)).status
    ).toBe(404);
    expect(
      (await donorSession.get('/api/v1/notifications/unread-count')).body.data.count
    ).toBe(2);
    expect(
      (await donorSession.patch(`/api/v1/notifications/${id}/read`).set(CSRF)).status
    ).toBe(204);
    expect(
      (await donorSession.patch(`/api/v1/notifications/${id}/read`).set(CSRF)).status
    ).toBe(204);
    expect(
      (await donorSession.get('/api/v1/notifications?is_read=true')).body.meta.total
    ).toBe(1);
    expect(
      (await donorSession.patch('/api/v1/notifications/read-all').set(CSRF)).body.data
        .updated
    ).toBe(1);
    expect(
      (await donorSession.patch('/api/v1/notifications/read-all').set(CSRF)).body.data
        .updated
    ).toBe(0);
    expect(
      (await otherSession.get('/api/v1/notifications/unread-count')).body.data.count
    ).toBe(2);
    expect(
      (await donorSession.patch('/api/v1/notifications/4294967295/read').set(CSRF)).status
    ).toBe(404);
  });
  test('ignores supplied user_id', async () => {
    await medicineCall();
    const res = await donorSession.get(`/api/v1/notifications?user_id=${other.id}`);
    const [mine] = await db.query('SELECT id FROM notifications WHERE user_id = ?', [
      donor.id
    ]);
    expect(res.body.data[0].id).toBe(mine.id);
  });
});

async function seedFeed() {
  for (const status of ['pending', 'completed', 'cancelled']) {
    await db.query(
      'INSERT INTO blood_donations (donor_id, status, reviewed_at) VALUES (?, ?, UTC_TIMESTAMP())',
      [donor.id, status]
    );
  }
  for (const status of ['pending', 'approved', 'dispensed', 'rejected', 'expired']) {
    await db.query(
      `INSERT INTO medicines (donor_id, category_id, name, quantity_donated, quantity_available, expiry_date, status, reviewed_at)
      VALUES (?, 1, 'Test medicine', 10, 0, '2030-01-01', ?, UTC_TIMESTAMP())`,
      [donor.id, status]
    );
  }
}
describe('feed and dashboard', () => {
  test('feed includes only confirmed/approved events, with pagination and no donor identity', async () => {
    await seedFeed();
    const res = await donorSession.get('/api/v1/feed?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      total: 3,
      pages: 2
    });
    expect(JSON.stringify(res.body)).not.toContain(donor.email);
    for (const item of res.body.data)
      expect(Object.keys(item).sort()).toEqual(
        ['id', 'kind', 'title', 'quantity', 'at', 'city'].sort()
      );
    expect((await donorSession.get('/api/v1/feed?kind=blood')).body.meta.total).toBe(1);
    expect((await donorSession.get('/api/v1/feed?kind=medicine')).body.meta.total).toBe(
      2
    );
  });
  test('public statistics are aggregates of confirmed data', async () => {
    await seedFeed();
    const res = await request(app).get('/api/v1/feed/stats');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      blood_donations: 1,
      medicines: 20,
      donors: 2,
      fulfilled: 0
    });
    expect(res.body.data.stock).toHaveLength(8);
  });
  test('map only includes open requests with coordinates and excludes account identity', async () => {
    await adminSession.post('/api/v1/calls/blood').set(CSRF).send(bloodInput);
    await adminSession
      .post('/api/v1/calls/blood')
      .set(CSRF)
      .send({
        ...bloodInput,
        latitude: undefined,
        longitude: undefined
      });
    await db.query(
      `INSERT INTO blood_requests (requester_id, blood_type_id, units_needed, hospital_name, status, latitude, longitude)
      VALUES (?, 8, 1, 'Private pending', 'pending', 33, 35)`,
      [patient.id]
    );
    await db.query(
      `INSERT INTO blood_requests (requester_id, blood_type_id, units_needed, hospital_name, status, latitude, longitude)
      VALUES (?, 8, 1, 'Recipient home', 'open', 33, 35)`,
      [patient.id]
    );
    const res = await donorSession.get('/api/v1/feed/map');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      hospital_name: bloodInput.hospital_name,
      latitude: 33.89
    });
    expect(res.body.data[0]).not.toHaveProperty('requester_id');
  });
  test('map filters apply before pagination and preserve the hospital-location boundary', async () => {
    await adminSession.post('/api/v1/calls/blood').set(CSRF).send(bloodInput);
    await adminSession
      .post('/api/v1/calls/blood')
      .set(CSRF)
      .send({
        ...bloodInput,
        hospital_name: 'Tripoli Hospital',
        city: 'Tripoli',
        blood_type_id: 1,
        urgency: 'normal'
      });
    await adminSession
      .post('/api/v1/calls/blood')
      .set(CSRF)
      .send({
        ...bloodInput,
        hospital_name: 'Beirut Follow-up',
        urgency: 'urgent'
      });
    const response = await donorSession.get(
      '/api/v1/feed/map?blood_type_id=8&urgency=sos&city=beir&limit=1'
    );
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      total: 1,
      pages: 1
    });
    expect(response.body.data[0]).toMatchObject({
      hospital_name: bloodInput.hospital_name,
      blood_type: 'O-',
      urgency: 'sos'
    });
    expect(
      (await donorSession.get('/api/v1/feed/map?city=Tripoli')).body.meta.total
    ).toBe(1);
    expect(
      (await donorSession.get('/api/v1/feed/map?city=Unknown')).body.meta.total
    ).toBe(0);
    expect(
      (await donorSession.get('/api/v1/feed/map?city=%27%20OR%201%3D1--')).body.meta.total
    ).toBe(0);
  });
  test.each([
    'blood_type_id=0',
    'blood_type_id=9',
    'blood_type_id=bad',
    'urgency=critical',
    'city=' + 'x'.repeat(61)
  ])('map rejects invalid filter %s', async (query) => {
    const response = await donorSession.get('/api/v1/feed/map?' + query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  test('admin dashboard, urgency, stock, daily history and audit filters', async () => {
    await seedFeed();
    await medicineCall();
    await adminSession.post('/api/v1/calls/blood').set(CSRF).send(bloodInput);
    const res = await adminSession.get('/api/v1/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      open_requests: 1,
      completed_donations: 1,
      pending_donations: 1,
      pending_medicines: 1,
      open_medicine_calls: 1
    });
    expect(res.body.data.stock).toHaveLength(8);
    expect(res.body.data.daily).toHaveLength(1);
    expect(res.body.data.urgency).toEqual([
      {
        urgency: 'sos',
        n: 1
      }
    ]);
    const logs = await adminSession.get(
      `/api/v1/admin/audit-logs?action=call.medicine_created&entity=medicine_call&user_id=${admin.id}&limit=1`
    );
    expect(logs.body.meta.total).toBe(1);
    expect(logs.body.data[0].action).toBe('call.medicine_created');
  });
});
describe('security and validation', () => {
  test.each([
    '/calls',
    '/notifications',
    '/notifications/unread-count',
    '/feed',
    '/feed/map',
    '/admin/stats',
    '/admin/audit-logs'
  ])('anonymous cannot access %s', async (path) => {
    expect((await request(app).get('/api/v1' + path)).status).toBe(401);
  });
  test.each(['/admin/stats', '/admin/audit-logs'])(
    'donors cannot access %s',
    async (path) => {
      expect((await donorSession.get('/api/v1' + path)).status).toBe(403);
    }
  );
  test.each(['/calls/medicine', '/calls/blood'])(
    'donors cannot create %s',
    async (path) => {
      expect(
        (
          await donorSession
            .post('/api/v1' + path)
            .set(CSRF)
            .send(callInput)
        ).status
      ).toBe(403);
    }
  );
  test('donors cannot close calls and mutations require CSRF header', async () => {
    const id = await medicineCall();
    expect((await donorSession.patch(`/api/v1/calls/${id}/close`).set(CSRF)).status).toBe(
      403
    );
    expect(
      (await adminSession.post('/api/v1/calls/medicine').send(callInput)).status
    ).toBe(403);
    expect((await donorSession.patch('/api/v1/notifications/read-all')).status).toBe(403);
  });
  test.each([
    '/calls?sort=DROP',
    '/calls?limit=101',
    '/calls?status=bad',
    '/notifications?is_read=2',
    '/notifications?type=bad',
    '/feed?kind=bad',
    '/feed/map?page=0',
    '/admin/audit-logs?user_id=-1'
  ])('invalid list %s gets 400', async (path) => {
    expect((await adminSession.get('/api/v1' + path)).status).toBe(400);
  });
  test('SQL-like search text is treated as a literal', async () => {
    await medicineCall();
    const res = await donorSession.get('/api/v1/calls').query({
      medicine_name: "' OR 1=1 --"
    });
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });
});
