// PL: request validation (the Presentation layer's job in the 3-tier rules).
// Runs a list of express-validator rules and stops the request with VALIDATION_ERROR
// if any rule fails, listing every problem field by field.
//   router.post('/x', validate([body('email').isEmail()]), controller.create)
'use strict';

const { validationResult, matchedData } = require('express-validator');
const { ValidationError } = require('../../shared/errors');

function validate(rules) {
  return async (req, res, next) => {
    for (const rule of rules) {
      await rule.run(req);
    }
    const result = validationResult(req);
    if (!result.isEmpty()) {
      const details = result
        .array({
          onlyFirstError: true
        })
        .map((e) => ({
          field: e.path,
          message: e.msg
        }));
      return next(new ValidationError('Some fields are not valid.', details));
    }
    // Only the fields that have rules reach the controller; anything extra is dropped,
    // and so are fields that were not sent (a rule can run on a missing field).
    const matched = matchedData(req, {
      includeOptionals: false
    });
    req.valid = Object.fromEntries(
      Object.entries(matched).filter(([, value]) => value !== undefined)
    );
    return next();
  };
}
module.exports = {
  validate
};
