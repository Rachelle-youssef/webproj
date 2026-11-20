// PL: request validation rules for /users. Anything not listed here never reaches the BLL.
'use strict';

const { body, param, query } = require('express-validator');
const { listRules } = require('./common.validators');
const PHONE = /^\+?[0-9 ()-]{6,20}$/;

// Shared field rules, reused by the sign-up form (auth.validators.js).
const fields = {
  fullName: () =>
    body('full_name')
      .trim()
      .isLength({
        min: 2,
        max: 100
      })
      .withMessage('must be 2 to 100 characters'),
  email: () =>
    body('email')
      .trim()
      .toLowerCase()
      .isEmail()
      .withMessage('must be a valid email address')
      .isLength({
        max: 254
      }),
  newPassword: (name = 'password') =>
    body(name)
      .isString()
      .isLength({
        min: 8,
        max: 128
      })
      .withMessage('must be 8 to 128 characters'),
  phone: () =>
    body('phone')
      .optional({
        values: 'falsy'
      })
      .trim()
      .matches(PHONE)
      .withMessage('must be a phone number such as +961 3 123 456'),
  city: () =>
    body('city')
      .trim()
      .isLength({
        min: 2,
        max: 60
      })
      .withMessage('must be 2 to 60 characters'),
  latitude: () =>
    body('latitude')
      .optional({
        values: 'null'
      })
      .isFloat({
        min: -90,
        max: 90
      })
      .withMessage('must be between -90 and 90')
      .toFloat(),
  longitude: () =>
    body('longitude')
      .optional({
        values: 'null'
      })
      .isFloat({
        min: -180,
        max: 180
      })
      .withMessage('must be between -180 and 180')
      .toFloat(),
  // Latitude and longitude come as a pair or not at all.
  coordinatesPair: () =>
    body('longitude').custom((lng, { req }) => {
      const hasLat = req.body.latitude !== undefined && req.body.latitude !== null;
      const hasLng = lng !== undefined && lng !== null;
      if (hasLat !== hasLng) {
        throw new Error('send latitude and longitude together');
      }
      return true;
    })
};
// Unlike sign-up, an edit can explicitly remove optional coordinates.
function profileCoordinate(name, minimum, maximum) {
  return body(name)
    .optional()
    .custom((value) => {
      if (value === null) {
        return true;
      }
      if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
        return false;
      }
      const number = Number(value);
      return Number.isFinite(number) && number >= minimum && number <= maximum;
    })
    .withMessage(`must be between ${minimum} and ${maximum}, or null to remove it`)
    .bail()
    .customSanitizer((value) => (value === null ? null : Number(value)));
}

const updateProfile = [
  body('full_name')
    .optional()
    .trim()
    .isLength({
      min: 2,
      max: 100
    })
    .withMessage('must be 2 to 100 characters'),
  // Profile updates can explicitly clear a phone. Sign-up keeps its existing rule.
  body('phone')
    .optional()
    .custom(
      (value) =>
        value === null ||
        (typeof value === 'string' && (value.trim() === '' || PHONE.test(value.trim())))
    )
    .withMessage('must be a phone number such as +961 3 123 456, or empty to remove it')
    .bail()
    .customSanitizer((value) =>
      value === null || value.trim() === '' ? null : value.trim()
    ),
  body('city')
    .optional()
    .trim()
    .isLength({
      min: 2,
      max: 60
    })
    .withMessage('must be 2 to 60 characters'),
  profileCoordinate('latitude', -90, 90),
  profileCoordinate('longitude', -180, 180),
  fields.coordinatesPair(),
  body('is_available')
    .optional()
    .isBoolean({
      strict: true
    })
    .withMessage('must be true or false')
];
const changePassword = [
  body('current_password')
    .isString()
    .isLength({
      min: 1,
      max: 128
    })
    .withMessage('is required'),
  fields.newPassword('new_password')
];
const USER_SORT_FIELDS = ['created_at', 'full_name', 'email'];
const listUsers = [
  query('role')
    .optional()
    .isIn(['donor', 'recipient', 'hospital', 'admin'])
    .withMessage('must be donor, recipient, hospital or admin'),
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('must be true or false'),
  query('q').optional().trim().isLength({
    max: 100
  }),
  ...listRules(USER_SORT_FIELDS)
];
const userId = [
  param('id')
    .isInt({
      min: 1
    })
    .withMessage('must be a positive whole number')
    .toInt()
];
const setStatus = [
  ...userId,
  body('is_active')
    .isBoolean({
      strict: true
    })
    .withMessage('must be true or false')
];
module.exports = {
  fields,
  updateProfile,
  changePassword,
  listUsers,
  userId,
  setStatus
};
