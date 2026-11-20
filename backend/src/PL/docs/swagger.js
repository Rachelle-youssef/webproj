// Serves the API documentation:
//   /api/docs           interactive Swagger UI page
//   /api/openapi.json   the raw OpenAPI description
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Router } = require('express');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const spec = YAML.parse(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
const router = Router();
router.get('/openapi.json', (req, res) => res.json(spec));
// Swagger previews PNG responses using browser-generated blob image URLs.
router.use('/docs', (req, res, next) => {
  const policy = res.get('Content-Security-Policy');
  if (policy) {
    res.set(
      'Content-Security-Policy',
      policy.replace(/(^|;)img-src [^;]+/, (directive) => directive + ' blob:')
    );
  }
  next();
});
router.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(spec, {
    customSiteTitle: 'LifeLink API docs',
    swaggerOptions: {
      withCredentials: true
    } // "Try it out" sends the session cookie
  })
);
module.exports = {
  docsRouter: router,
  spec
};
