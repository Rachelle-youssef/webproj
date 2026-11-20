// Enforces the rules of the 3-tier architecture from the course (slides 103-106):
//   client -> PL -> BLL -> DAL -> database, each layer in its own folder,
//   each layer talking only to its neighbour, data passed as DTOs.
// It reads every require() in src/ and fails if a file breaks a rule.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', 'src');

function jsFiles(dir) {
  return fs
    .readdirSync(dir, {
      withFileTypes: true
    })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return jsFiles(full);
      return entry.name.endsWith('.js') ? [full] : [];
    });
}

// Which part of src/ a path belongs to: PL, BLL, DAL, DTO, shared, config, or outside.
function partOf(absPath) {
  const first = path.relative(SRC, absPath).split(path.sep)[0];
  return ['PL', 'BLL', 'DAL', 'DTO', 'shared', 'config'].includes(first)
    ? first
    : 'outside';
}

function requiresIn(file) {
  const code = fs.readFileSync(file, 'utf8');
  return [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
}

// Which parts of src/ each layer may use.
const ALLOWED = {
  PL: ['PL', 'BLL', 'DTO', 'shared', 'config'],
  // never the DAL
  BLL: ['BLL', 'DAL', 'DTO', 'shared', 'config', 'outside'],
  // 'outside' = package.json (version number)
  DAL: ['DAL', 'DTO', 'shared', 'config'],
  // never the BLL or PL
  DTO: ['DTO'] // plain data, depends on nothing
};

test('each feature route delegates HTTP handling to its controller', () => {
  const routeFiles = jsFiles(path.join(SRC, 'PL', 'routes')).filter(
    (file) => path.basename(file) !== 'index.js'
  );
  for (const file of routeFiles) {
    const controller =
      '../controllers/' + path.basename(file).replace('.routes.js', '.controller');
    expect(requiresIn(file)).toContain(controller);
    expect(requiresIn(file).some((name) => name.includes('/BLL/'))).toBe(false);
  }
});

test('local JavaScript modules have no circular dependencies', () => {
  const visited = new Set();
  const active = new Set();
  function visit(file, chain) {
    if (active.has(file)) {
      throw new Error(
        'Circular dependency: ' +
          [...chain, file].map((name) => path.relative(SRC, name)).join(' -> ')
      );
    }
    if (visited.has(file)) return;
    active.add(file);
    for (const name of requiresIn(file).filter((value) => value.startsWith('.'))) {
      const target = require.resolve(path.resolve(path.dirname(file), name));
      if (target.endsWith('.js') && target.startsWith(SRC + path.sep)) {
        visit(target, [...chain, file]);
      }
    }
    active.delete(file);
    visited.add(file);
  }
  for (const file of jsFiles(SRC)) visit(file, []);
});
// Packages that mean "HTTP" or "MySQL": the BLL must not know about either.
const HTTP_PACKAGES = [
  'express',
  'express-session',
  'cookie-parser',
  'cors',
  'helmet',
  'express-rate-limit',
  'express-validator',
  'jsonwebtoken',
  'swagger-ui-express'
];

function violations(layer, check) {
  const found = [];
  for (const file of jsFiles(path.join(SRC, layer))) {
    for (const spec of requiresIn(file)) {
      const problem = check(file, spec);
      if (problem)
        found.push(`${path.relative(SRC, file)} requires "${spec}" (${problem})`);
    }
  }
  return found;
}
describe('3-tier architecture rules', () => {
  test('the code is divided into PL, BLL and DAL folders, plus DTO', () => {
    for (const folder of ['PL', 'BLL', 'DAL', 'DTO'])
      expect(fs.existsSync(path.join(SRC, folder))).toBe(true);
  });
  test('the sibling frontend has the Assets, Scripts, Styles and Views folders', () => {
    for (const folder of ['Assets', 'Scripts', 'Styles', 'Views'])
      expect(fs.existsSync(path.join(SRC, '..', '..', 'frontend', folder))).toBe(true);
  });
  test.each(Object.keys(ALLOWED))('%s only uses the layers it is allowed to', (layer) => {
    const found = violations(layer, (file, spec) => {
      if (!spec.startsWith('.')) return null; // packages are checked below
      const target = partOf(path.resolve(path.dirname(file), spec));
      return ALLOWED[layer].includes(target) ? null : `${layer} must not use ${target}`;
    });
    expect(found).toEqual([]);
  });
  test('the BLL knows nothing about HTTP or MySQL', () => {
    const found = violations('BLL', (file, spec) =>
      HTTP_PACKAGES.includes(spec) || spec.startsWith('mysql')
        ? 'HTTP/MySQL package in the BLL'
        : null
    );
    expect(found).toEqual([]);
  });
  test('only the DAL talks to MySQL', () => {
    const found = ['PL', 'BLL', 'DTO', 'shared'].flatMap((layer) =>
      violations(layer, (file, spec) =>
        spec.startsWith('mysql') ? 'MySQL driver outside the DAL' : null
      )
    );
    expect(found).toEqual([]);
  });
  test('only the DAL contains SQL', () => {
    const SQL =
      /\bSELECT\b[^;]{1,300}?\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/;
    const offenders = ['PL', 'BLL', 'DTO', 'shared']
      .flatMap((layer) => jsFiles(path.join(SRC, layer)))
      .filter((file) => SQL.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
  test('DTOs hold data only: no SQL, no HTTP, no other layers', () => {
    const found = violations('DTO', (file, spec) =>
      spec.startsWith('.') ? null : `package ${spec} in a DTO`
    );
    expect(found).toEqual([]);
  });
});
