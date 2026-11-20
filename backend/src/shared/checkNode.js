// Stops with a clear message when Node.js is too old. Loaded first by the server and scripts.

'use strict';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 7)) {
  console.error(`LifeLink needs Node.js 24.7 or later (you have ${process.version}).`);
  console.error(
    'Install the LTS version from https://nodejs.org, then close and reopen the terminal.'
  );
  process.exit(1);
}
