'use strict';

// This expanded lifecycle suite exceeds 300 requests on one in-memory app.
// Keep production defaults unchanged; dedicated security tests cover rate limits.
process.env.RATE_LIMIT_MAX = '10000';
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const config = require('../src/config');
const { today, addDays } = require('../src/BLL/dates');
const {
  CSRF,
  cleanDatabase,
  createUser,
  signIn,
  daysAgo,
  setLastDonation,
  notificationsOf
} = require('./helpers');
const app = createApp();
afterAll(() => db.close());
const TYPE = {
  'A+': 1,
  'O+': 7,
  'O-': 8
};
let adminUser;
let admin;
let hospitalUser;
let hospital;
let request; // an open request for 2 units of O+
beforeEach(async () => {
  await cleanDatabase();
  adminUser = await createUser({
    role: 'admin'
  });
  admin = await signIn(app, adminUser);
  hospitalUser = await createUser({
    role: 'hospital',
    full_name: 'AUBMC'
  });
  hospital = await signIn(app, hospitalUser);
  const created = await hospital.post('/api/v1/blood-requests').set(CSRF).send({
    blood_type_id: TYPE['O+'],
    units_needed: 2,
    hospital_name: 'AUBMC'
  });
  request = (
    await admin
      .patch(`/api/v1/blood-requests/${created.body.data.id}/review`)
      .set(CSRF)
      .send({
        decision: 'approve'
      })
  ).body.data;
  await db.query('DELETE FROM notifications'); // start each test with no alerts
});

async function donor(bloodType = 'O+', options = {}) {
  const user = await createUser({
    role: 'donor',
    bloodTypeId: TYPE[bloodType],
    ...options
  });
  return {
    user,
    agent: await signIn(app, user)
  };
}
const offer = (agent, requestId) =>
  agent
    .post('/api/v1/blood-donations')
    .set(CSRF)
    .send(
      requestId === undefined
        ? {}
        : {
            request_id: requestId
          }
    );
const accept = (id) =>
  admin.patch(`/api/v1/blood-donations/${id}/accept`).set(CSRF).send({});
const completeOnly = (id) =>
  admin.patch(`/api/v1/blood-donations/${id}/confirm`).set(CSRF).send({});
const confirm = async (id) => {
  const [row] = await db.query('SELECT status FROM blood_donations WHERE id = ?', [id]);
  if (row?.status === 'pending') await accept(id);
  return completeOnly(id);
};
const requestNow = async () =>
  (await hospital.get(`/api/v1/blood-requests/${request.id}`)).body.data;
const stockOf = async (label) =>
  (await admin.get('/api/v1/blood-stock')).body.data.find((s) => s.blood_type === label)
    .units_available;
describe('eligibility (8 weeks between donations)', () => {
  test('someone who never gave blood can donate today', async () => {
    const { agent } = await donor();
    const res = await agent.get('/api/v1/blood-donations/eligibility');
    expect(res.body.data).toEqual({
      eligible: true,
      last_donation_date: null,
      next_eligible_date: today(config.timeZone),
      days_remaining: 0,
      interval_days: 56
    });
  });
  test('someone who gave blood 10 days ago must wait 46 more days', async () => {
    const { user, agent } = await donor();
    await setLastDonation(user.id, daysAgo(10));
    const res = await agent.get('/api/v1/blood-donations/eligibility');
    expect(res.body.data).toMatchObject({
      eligible: false,
      last_donation_date: daysAgo(10),
      next_eligible_date: addDays(daysAgo(10), 56),
      days_remaining: 46
    });
  });
});
describe('offering to donate', () => {
  test('a donor offers for an open request; the requester and admins are told', async () => {
    const { user, agent } = await donor();
    const res = await offer(agent, request.id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      donor: {
        id: user.id,
        blood_type: 'O+'
      },
      request: {
        id: request.id,
        hospital_name: 'AUBMC',
        blood_type: 'O+'
      }
    });
    expect(await notificationsOf(hospitalUser.id)).toEqual([
      expect.objectContaining({
        type: 'response'
      })
    ]);
    expect(await notificationsOf(adminUser.id)).toEqual([
      expect.objectContaining({
        type: 'donation',
        message: expect.stringMatching(/offered to donate for the request at AUBMC/)
      })
    ]);
  });
  test.each([
    [
      'answering the same request twice',
      async ({ agent }) => {
        await offer(agent, request.id);
        return offer(agent, request.id);
      },
      409
    ],
    [
      'a blood type that cannot be given (A+ for O+)',
      async () => offer((await donor('A+')).agent, request.id),
      409
    ],
    [
      'a request that is not open',
      async ({ agent }) => {
        const pending = await hospital.post('/api/v1/blood-requests').set(CSRF).send({
          blood_type_id: TYPE['O+'],
          units_needed: 1,
          hospital_name: 'AUBMC'
        });
        return offer(agent, pending.body.data.id);
      },
      404
    ]
  ])('is refused for %s', async (label, attempt, status) => {
    const res = await attempt(await donor());
    expect(res.status).toBe(status);
  });
  test('is refused within 8 weeks of the last donation, with the date it becomes possible', async () => {
    const { user, agent } = await donor();
    await setLastDonation(user.id, daysAgo(10));
    const res = await offer(agent, request.id);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain(addDays(daysAgo(10), 56));
  });
  test('a donor can offer to the blood bank, one pending offer at a time', async () => {
    const { agent } = await donor();
    const first = await offer(agent);
    expect(first.status).toBe(201);
    expect(first.body.data.request).toBeNull();
    const duplicate = await offer(agent);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe(
      'Your blood-bank offer #' + first.body.data.id + ' is pending admin review.'
    );
  });
  test('a donor can withdraw their own pending offer', async () => {
    const { agent } = await donor();
    const { body } = await offer(agent, request.id);
    const res = await agent
      .patch(`/api/v1/blood-donations/${body.data.id}/withdraw`)
      .set(CSRF)
      .send({});
    expect(res.body.data).toMatchObject({
      status: 'cancelled',
      admin_note: 'Withdrawn by the donor.'
    });
  });
});
describe('invitations', () => {
  test('an admin invites a matching donor, who is told', async () => {
    const { user } = await donor();
    const res = await admin
      .post(`/api/v1/blood-requests/${request.id}/invitations`)
      .set(CSRF)
      .send({
        donor_id: user.id
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('invited');
    expect(await notificationsOf(user.id)).toEqual([
      expect.objectContaining({
        type: 'invite',
        link: '#/donations'
      })
    ]);
  });
  test('cannot invite an incompatible donor, the same donor twice, or a non-donor', async () => {
    const incompatible = (await donor('A+')).user;
    const invite = (donorId) =>
      admin.post(`/api/v1/blood-requests/${request.id}/invitations`).set(CSRF).send({
        donor_id: donorId
      });
    expect((await invite(incompatible.id)).status).toBe(409);
    const ok = (await donor()).user;
    await invite(ok.id);
    expect((await invite(ok.id)).status).toBe(409);
    expect((await invite(hospitalUser.id)).status).toBe(404);
  });
  test('the donor accepts (pending) or declines; only once, and only their own', async () => {
    const accepting = await donor();
    const declining = await donor();
    const invite = async (d) =>
      (
        await admin
          .post(`/api/v1/blood-requests/${request.id}/invitations`)
          .set(CSRF)
          .send({
            donor_id: d.user.id
          })
      ).body.data;
    const a = await invite(accepting);
    const b = await invite(declining);
    expect(
      (
        await declining.agent
          .patch(`/api/v1/blood-donations/${a.id}/respond`)
          .set(CSRF)
          .send({
            accept: true
          })
      ).status
    ).toBe(404);
    expect(
      (
        await accepting.agent
          .patch(`/api/v1/blood-donations/${a.id}/respond`)
          .set(CSRF)
          .send({
            accept: true
          })
      ).body.data.status
    ).toBe('pending');
    expect(
      (
        await declining.agent
          .patch(`/api/v1/blood-donations/${b.id}/respond`)
          .set(CSRF)
          .send({
            accept: false
          })
      ).body.data.status
    ).toBe('declined');
    expect(
      (
        await accepting.agent
          .patch(`/api/v1/blood-donations/${a.id}/respond`)
          .set(CSRF)
          .send({
            accept: false
          })
      ).status
    ).toBe(409);
  });
});
describe('confirming a donation (admins)', () => {
  test("completes it, sets the donor's date, moves the request forward and thanks the donor", async () => {
    const { user, agent } = await donor();
    const { body } = await offer(agent, request.id);
    expect((await accept(body.data.id)).status).toBe(200);
    await db.query('DELETE FROM notifications');
    const res = await confirm(body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(
      (await agent.get('/api/v1/blood-donations/eligibility')).body.data
    ).toMatchObject({
      eligible: false,
      last_donation_date: today(config.timeZone),
      days_remaining: 56
    });
    expect(await requestNow()).toMatchObject({
      units_received: 1,
      status: 'open'
    });
    expect(await notificationsOf(hospitalUser.id)).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/\(1 of 2 units\)/)
      })
    ]);
    expect(await notificationsOf(user.id)).toEqual([
      expect.objectContaining({
        type: 'thanks',
        message: expect.stringContaining(addDays(today(config.timeZone), 56))
      })
    ]);
  });
  test('the second unit fulfils the request', async () => {
    for (const d of [await donor(), await donor()])
      await confirm((await offer(d.agent, request.id)).body.data.id);
    expect(await requestNow()).toMatchObject({
      units_received: 2,
      status: 'fulfilled'
    });
    expect((await notificationsOf(hospitalUser.id)).at(-1).message).toMatch(
      /is fulfilled/
    );
  });
  test('a donation to the blood bank adds one unit to stock, with its history', async () => {
    const { agent } = await donor('O-');
    const { body } = await offer(agent);
    await confirm(body.data.id);
    expect(await stockOf('O-')).toBe(1);
    const history = (await admin.get('/api/v1/blood-stock/movements')).body.data;
    expect(history[0]).toMatchObject({
      blood_type: 'O-',
      change_units: 1,
      reason: 'donation',
      donation_id: body.data.id,
      request_id: null
    });
  });
  test('if the request no longer needs blood, the unit goes to the blood bank instead', async () => {
    const late = await donor();
    const lateOffer = (await offer(late.agent, request.id)).body.data;
    expect((await accept(lateOffer.id)).status).toBe(200);
    for (const d of [await donor(), await donor()])
      await confirm((await offer(d.agent, request.id)).body.data.id);
    await confirm(lateOffer.id);
    expect(await requestNow()).toMatchObject({
      units_received: 2,
      status: 'fulfilled'
    });
    expect(await stockOf('O+')).toBe(1);
  });
  test('a donation cannot be confirmed twice, even by two admins at the same moment', async () => {
    const { agent } = await donor();
    const { body } = await offer(agent, request.id);
    const secondAdmin = await signIn(
      app,
      await createUser({
        role: 'admin'
      })
    );
    await accept(body.data.id);
    const results = await Promise.all([
      completeOnly(body.data.id),
      secondAdmin
        .patch(`/api/v1/blood-donations/${body.data.id}/confirm`)
        .set(CSRF)
        .send({})
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await requestNow()).units_received).toBe(1);
  });
  test('is refused if the donor gave blood elsewhere in the last 8 weeks', async () => {
    const { user, agent } = await donor();
    const { body } = await offer(agent, request.id);
    await setLastDonation(user.id, daysAgo(3));
    expect((await confirm(body.data.id)).status).toBe(409);
  });
  test('admins can cancel a donation with a reason the donor sees', async () => {
    const { user, agent } = await donor();
    const { body } = await offer(agent, request.id);
    expect(
      (
        await admin
          .patch(`/api/v1/blood-donations/${body.data.id}/cancel`)
          .set(CSRF)
          .send({})
      ).status
    ).toBe(400);
    const res = await admin
      .patch(`/api/v1/blood-donations/${body.data.id}/cancel`)
      .set(CSRF)
      .send({
        note: 'Did not come to the appointment'
      });
    expect(res.body.data).toMatchObject({
      status: 'cancelled',
      admin_note: 'Did not come to the appointment'
    });
    expect((await notificationsOf(user.id)).at(-1).message).toMatch(
      /Did not come to the appointment/
    );
  });
  test('donors cannot confirm donations', async () => {
    const { agent } = await donor();
    const { body } = await offer(agent, request.id);
    expect(
      (
        await agent
          .patch(`/api/v1/blood-donations/${body.data.id}/confirm`)
          .set(CSRF)
          .send({})
      ).status
    ).toBe(403);
  });
});
describe('listing donations', () => {
  test('donors see only their own; admins see all and can filter', async () => {
    const first = await donor();
    const second = await donor();
    await offer(first.agent, request.id);
    const done = (await offer(second.agent, request.id)).body.data;
    await confirm(done.id);
    const mine = await first.agent.get('/api/v1/blood-donations');
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].donor.id).toBe(first.user.id);
    expect((await admin.get('/api/v1/blood-donations')).body.meta.total).toBe(2);
    expect(
      (await admin.get('/api/v1/blood-donations?status=completed')).body.data.map(
        (d) => d.id
      )
    ).toEqual([done.id]);
    expect((await hospital.get('/api/v1/blood-donations')).status).toBe(403);
  });
});
describe('acceptance before physical collection', () => {
  test('pending cannot complete; acceptance changes no request units, stock, feed or eligibility', async () => {
    const { user, agent } = await donor();
    const id = (await offer(agent, request.id)).body.data.id;
    expect((await completeOnly(id)).status).toBe(409);
    const before = await agent.get('/api/v1/blood-donations/eligibility');
    const res = await accept(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'accepted',
      reviewed_at: null
    });
    expect(res.body.data.accepted_at).toBeTruthy();
    expect(await requestNow()).toMatchObject({
      units_received: 0,
      status: 'open'
    });
    expect(await stockOf('O+')).toBe(0);
    expect((await agent.get('/api/v1/blood-donations/eligibility')).body).toEqual(
      before.body
    );
    expect((await agent.get('/api/v1/feed')).body.meta.total).toBe(0);
    expect((await notificationsOf(user.id)).at(-1).message).toMatch(/offer was accepted/);
    expect(
      (await admin.get('/api/v1/blood-donations?status=accepted')).body.data.map(
        (d) => d.id
      )
    ).toEqual([id]);
    expect((await admin.get('/api/v1/admin/stats')).body.data).toMatchObject({
      pending_donations: 0,
      accepted_donations: 1,
      completed_donations: 0
    });
    const [audit] = await db.query(
      "SELECT user_id FROM audit_logs WHERE action = 'blood_donation.accepted' AND entity_id = ?",
      [id]
    );
    expect(audit.user_id).toBe(adminUser.id);
    expect((await accept(id)).status).toBe(409);
    expect((await completeOnly(id)).status).toBe(200);
    expect(
      (await agent.get('/api/v1/blood-donations/eligibility')).body.data.eligible
    ).toBe(false);
  });
  test('independent accepted offer blocks a duplicate, and only completion adds stock', async () => {
    const { agent } = await donor();
    const id = (await offer(agent)).body.data.id;
    expect((await accept(id)).status).toBe(200);
    const duplicate = await offer(agent);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe(
      'Your blood-bank offer #' + id + ' was accepted and is awaiting collection.'
    );
    expect(await stockOf('O+')).toBe(0);
    expect((await completeOnly(id)).status).toBe(200);
    expect(await stockOf('O+')).toBe(1);
  });
  test('donor can withdraw an accepted appointment', async () => {
    const { agent } = await donor();
    const id = (await offer(agent, request.id)).body.data.id;
    await accept(id);
    expect(
      (await agent.patch(`/api/v1/blood-donations/${id}/withdraw`).set(CSRF)).body.data
        .status
    ).toBe('cancelled');
    expect((await completeOnly(id)).status).toBe(409);
    expect(
      (await agent.get('/api/v1/blood-donations/eligibility')).body.data.eligible
    ).toBe(true);
  });
  test('admin can cancel an accepted appointment without blood units or cooldown', async () => {
    const { agent } = await donor();
    const id = (await offer(agent, request.id)).body.data.id;
    await accept(id);
    expect(
      (
        await admin.patch(`/api/v1/blood-donations/${id}/cancel`).set(CSRF).send({
          note: 'Did not attend'
        })
      ).body.data.status
    ).toBe('cancelled');
    expect((await completeOnly(id)).status).toBe(409);
    expect((await requestNow()).units_received).toBe(0);
    expect(
      (await agent.get('/api/v1/blood-donations/eligibility')).body.data.eligible
    ).toBe(true);
  });
  test('cancelling a request also cancels accepted appointments and alerts donor', async () => {
    const { user, agent } = await donor();
    const id = (await offer(agent, request.id)).body.data.id;
    await accept(id);
    await hospital.patch(`/api/v1/blood-requests/${request.id}/cancel`).set(CSRF).send({
      note: 'No longer needed'
    });
    expect((await agent.get('/api/v1/blood-donations')).body.data[0].status).toBe(
      'cancelled'
    );
    expect((await notificationsOf(user.id)).at(-1).message).toMatch(/cancelled/);
    expect((await completeOnly(id)).status).toBe(409);
  });
  test('cannot accept after request is fulfilled', async () => {
    const { agent } = await donor();
    const id = (await offer(agent, request.id)).body.data.id;
    await db.query(
      "UPDATE blood_requests SET status = 'fulfilled', units_received = units_needed WHERE id = ?",
      [request.id]
    );
    expect((await accept(id)).status).toBe(409);
  });
  test('cannot accept a donor who became unavailable or ineligible', async () => {
    const { user, agent } = await donor();
    const id = (await offer(agent, request.id)).body.data.id;
    await db.query('UPDATE donor_profiles SET is_available = FALSE WHERE user_id = ?', [
      user.id
    ]);
    expect((await accept(id)).status).toBe(409);
    await db.query('UPDATE donor_profiles SET is_available = TRUE WHERE user_id = ?', [
      user.id
    ]);
    await setLastDonation(user.id, daysAgo(1));
    expect((await accept(id)).status).toBe(409);
  });
  test('invitation must be answered before admin acceptance', async () => {
    const { user, agent } = await donor();
    const id = (
      await admin
        .post(`/api/v1/blood-requests/${request.id}/invitations`)
        .set(CSRF)
        .send({
          donor_id: user.id
        })
    ).body.data.id;
    expect((await accept(id)).status).toBe(409);
    await agent.patch(`/api/v1/blood-donations/${id}/respond`).set(CSRF).send({
      accept: true
    });
    expect((await completeOnly(id)).status).toBe(409);
    expect((await accept(id)).status).toBe(200);
  });
  test('only admins accept, with CSRF header; unknown ID is hidden', async () => {
    const { agent } = await donor();
    const id = (await offer(agent)).body.data.id;
    expect(
      (await agent.patch(`/api/v1/blood-donations/${id}/accept`).set(CSRF)).status
    ).toBe(403);
    expect(
      (await hospital.patch(`/api/v1/blood-donations/${id}/accept`).set(CSRF)).status
    ).toBe(403);
    expect((await admin.patch(`/api/v1/blood-donations/${id}/accept`)).status).toBe(403);
    expect((await accept(4294967295)).status).toBe(404);
  });
  test('two independent admin sessions accept once, while donor keeps its own session', async () => {
    const { user, agent } = await donor();
    const id = (await offer(agent)).body.data.id;
    const secondAdmin = await signIn(
      app,
      await createUser({
        role: 'admin'
      })
    );
    const results = await Promise.all([
      accept(id),
      secondAdmin.patch(`/api/v1/blood-donations/${id}/accept`).set(CSRF)
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await agent.get('/api/v1/auth/me')).body.data.id).toBe(user.id);
    expect((await admin.get('/api/v1/auth/me')).body.data.id).toBe(adminUser.id);
    expect((await agent.get('/api/v1/blood-donations')).body.data[0].status).toBe(
      'accepted'
    );
  });
  test('acceptance and its alerts roll back when audit write fails', async () => {
    const { user, agent } = await donor();
    const id = (await offer(agent)).body.data.id;
    const audit = require('../src/DAL/audit.dal');
    const spy = jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('test failure'));
    try {
      expect((await accept(id)).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const [row] = await db.query(
      'SELECT status, accepted_at FROM blood_donations WHERE id = ?',
      [id]
    );
    expect(row).toEqual({
      status: 'pending',
      accepted_at: null
    });
    expect(await notificationsOf(user.id)).toHaveLength(0);
  });
  test('concurrent completion of two accepted offers from one donor counts only one donation', async () => {
    const { agent } = await donor();
    const linked = (await offer(agent, request.id)).body.data.id;
    const bank = (await offer(agent)).body.data.id;
    expect((await accept(linked)).status).toBe(200);
    expect((await accept(bank)).status).toBe(200);
    const replies = await Promise.all([completeOnly(linked), completeOnly(bank)]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await requestNow()).units_received + (await stockOf('O+'))).toBe(1);
  });
  test('failed physical completion rolls back units and donor date, preserving acceptance', async () => {
    const { user, agent } = await donor();
    const id = (await offer(agent)).body.data.id;
    await accept(id);
    const audit = require('../src/DAL/audit.dal');
    const spy = jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('test completion failure'));
    try {
      expect((await completeOnly(id)).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const [row] = await db.query(
      'SELECT status, accepted_at FROM blood_donations WHERE id = ?',
      [id]
    );
    expect(row.status).toBe('accepted');
    expect(row.accepted_at).toBeTruthy();
    expect(await stockOf('O+')).toBe(0);
    expect(
      (await agent.get('/api/v1/blood-donations/eligibility')).body.data
    ).toMatchObject({
      eligible: true,
      last_donation_date: null
    });
    expect(
      (await notificationsOf(user.id)).filter((n) => n.type === 'thanks')
    ).toHaveLength(0);
  });
});
