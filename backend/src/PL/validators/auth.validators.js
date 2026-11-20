// PL: request validation rules for sign-up and sign-in.
'use strict';

const { body } = require('express-validator');
const { fields } = require('./users.validators');

// Admin accounts cannot be created through the public sign-up form.
const PUBLIC_ROLES = ['donor', 'recipient', 'hospital'];
const register = [
  fields.fullName(),
  fields.email(),
  fields.newPassword('password'),
  body('role').isIn(PUBLIC_ROLES).withMessage('must be donor, recipient or hospital'),
  fields.city(),
  fields.phone(),
  fields.latitude(),
  fields.longitude(),
  fields.coordinatesPair(),
  body('blood_type_id')
    .if(body('role').equals('donor'))
    .isInt({
      min: 1,
      max: 8
    })
    .withMessage('is required for donors (1 to 8)')
    .toInt()
];
const login = [
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('must be a valid email address'),
  body('password')
    .isString()
    .isLength({
      min: 1,
      max: 128
    })
    .withMessage('is required')
];
module.exports = {
  register,
  login,
  PUBLIC_ROLES
};
