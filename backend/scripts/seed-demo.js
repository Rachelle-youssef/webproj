// Adds demo accounts so the app is not empty during development and the presentation.
// All demo accounts use the password  Demo12345  and emails ending in @lifelink.test
// (.test is a reserved domain, so these addresses can never belong to a real person).
//   npm run db:seed
// Everything is created through the BLL, so it follows exactly the same rules as the app.
// Blood demo data (stock, requests, donations) is added once, if an admin exists.
// Later steps add demo medicines here.
'use strict';

require('../src/shared/checkNode');
require('dotenv').config({
  quiet: true
});
const config = require('../src/config');
const authBLL = require('../src/BLL/auth.bll');
const usersBLL = require('../src/BLL/users.bll');
const requestsBLL = require('../src/BLL/bloodRequests.bll');
const donationsBLL = require('../src/BLL/bloodDonations.bll');
const stockBLL = require('../src/BLL/bloodStock.bll');
const db = require('../src/DAL/db');
const { RegisterDTO, UserFilterDTO } = require('../src/DTO/user.dto');
const { PageRequestDTO } = require('../src/DTO/common.dto');
const {
  BloodRequestInputDTO,
  BloodRequestFilterDTO,
  ReviewDTO,
  DonationOfferDTO,
  StockAdjustmentDTO
} = require('../src/DTO/blood.dto');
const { ConflictError } = require('../src/shared/errors');
const DEMO_PASSWORD = 'Demo12345';
// [role, name, email, city, latitude, longitude, blood type id (1 A+, 2 A-, 3 B+, 4 B-, 5 AB+, 6 AB-, 7 O+, 8 O-)]
const PEOPLE = [
  ['donor', 'Maya Nasr', 'maya@lifelink.test', 'Beirut', 33.893791, 35.501778, 7],
  ['donor', 'Karim Saad', 'karim@lifelink.test', 'Tripoli', 34.436667, 35.849722, 1],
  ['donor', 'Sara Mansour', 'sara@lifelink.test', 'Saida', 33.557069, 35.372948, 8],
  ['donor', 'Rami Haddad', 'rami@lifelink.test', 'Zahle', 33.846667, 35.902222, 4],
  [
    'hospital',
    'Rafik Hariri University Hospital',
    'hospital@lifelink.test',
    'Beirut',
    33.865,
    35.488,
    null
  ],
  [
    'recipient',
    'Nour Khoury',
    'nour@lifelink.test',
    'Jounieh',
    33.980833,
    35.617778,
    null
  ]
];
const firstPage = (limit, sortDirection = 'ASC') =>
  new PageRequestDTO({
    page: 1,
    limit,
    sortField: 'created_at',
    sortDirection
  });
// Opening stock per blood type id: A+, A-, B+, B-, AB+, AB-, O+, O-
const OPENING_STOCK = [6, 2, 4, 1, 2, 1, 8, 3];

async function seedBlood() {
  const admins = await usersBLL.listUsers(
    new UserFilterDTO({
      role: 'admin'
    }),
    firstPage(1)
  );
  if (!admins.items.length) {
    console.log(
      'No admin account yet: run "npm run admin:create", then "npm run db:seed" again to add demo blood data.'
    );
    return;
  }
  const admin = admins.items[0];
  if (
    (await requestsBLL.list(admin, new BloodRequestFilterDTO({}), firstPage(1))).meta
      .total > 0
  ) {
    console.log('Blood data already exists. No demo blood data was added.');
    return;
  }
  const demo = await usersBLL.listUsers(
    new UserFilterDTO({
      q: '@lifelink.test'
    }),
    firstPage(50)
  );
  const who = Object.fromEntries(demo.items.map((u) => [u.email.split('@')[0], u]));
  for (const [index, units] of OPENING_STOCK.entries()) {
    await stockBLL.adjust(
      admin,
      new StockAdjustmentDTO({
        blood_type_id: index + 1,
        change_units: units,
        note: 'Opening stock (demo)'
      }),
      null
    );
  }
  const ask = (requester, input) =>
    requestsBLL.create(requester, new BloodRequestInputDTO(input), null);
  const approve = (request) =>
    requestsBLL.review(
      admin,
      request.id,
      new ReviewDTO({
        decision: 'approve'
      }),
      null
    );
  const sos = await approve(
    await ask(who.hospital, {
      blood_type_id: 8,
      units_needed: 3,
      urgency: 'sos',
      hospital_name: 'Rafik Hariri University Hospital'
    })
  );
  const urgent = await approve(
    await ask(who.hospital, {
      blood_type_id: 1,
      units_needed: 2,
      urgency: 'urgent',
      hospital_name: 'Rafik Hariri University Hospital'
    })
  );
  await ask(who.hospital, {
    blood_type_id: 4,
    units_needed: 1,
    hospital_name: 'Rafik Hariri University Hospital'
  }); // left for the admin to review
  await approve(
    await ask(who.nour, {
      blood_type_id: 5,
      units_needed: 1,
      hospital_name: 'Hôtel-Dieu de France',
      city: 'Beirut'
    })
  );
  await donationsBLL.offer(
    who.sara,
    new DonationOfferDTO({
      request_id: sos.id
    })
  ); // waiting for the admin to confirm
  const karim = await donationsBLL.offer(
    who.karim,
    new DonationOfferDTO({
      request_id: urgent.id
    })
  );
  await donationsBLL.accept(admin, karim.id, null);
  await donationsBLL.confirm(admin, karim.id, null); // already done: 1 of 2 units
  await donationsBLL.offer(who.maya, new DonationOfferDTO({})); // an offer to the blood bank

  console.log(
    'Added demo blood data: opening stock, 4 requests (1 waiting for review) and 3 donations.'
  );
}

async function main() {
  if (config.isProduction) {
    throw new Error('Demo data is never added in production.');
  }
  let added = 0;
  for (const [
    role,
    full_name,
    email,
    city,
    latitude,
    longitude,
    blood_type_id
  ] of PEOPLE) {
    try {
      await authBLL.register(
        new RegisterDTO({
          role,
          full_name,
          email,
          password: DEMO_PASSWORD,
          city,
          latitude,
          longitude,
          blood_type_id
        }),
        null
      );
      added += 1;
    } catch (err) {
      if (!(err instanceof ConflictError)) {
        throw err;
      } // already there: skip it
    }
  }
  console.log(
    added
      ? `Added ${added} demo account(s).`
      : 'Demo accounts already exist. Nothing was changed.'
  );
  console.log(
    `Demo sign-ins (password ${DEMO_PASSWORD}): ${PEOPLE.map((p) => p[2]).join(', ')}`
  );
  await seedBlood();
}
main()
  .catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
