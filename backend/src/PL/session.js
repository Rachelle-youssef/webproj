// PL: express-session handles the browser's signed session-ID cookie.
// MySQL holds the login data. The cookie contains no user details or JWT.
'use strict';
const session = require('express-session');
const sessionsBLL = require('../BLL/sessions.bll');
const config = require('../config');
const { ServiceUnavailableError } = require('../shared/errors');
const COOKIE_NAME = 'll_session';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.isProduction,
  path: '/api'
};

// The adapter translates Express callbacks into our BLL -> DAL promise calls.
class MySqlSessionStore extends session.Store {
  get(id, callback) {
    sessionsBLL.find(id).then(
      (data) => callback(null, data),
      () => callback(new ServiceUnavailableError())
    );
  }
  set(id, data, callback) {
    sessionsBLL.save(id, data).then(
      () => callback(null),
      (error) =>
        callback(error.code === 'UNAUTHENTICATED' ? error : new ServiceUnavailableError())
    );
  }
  destroy(id, callback) {
    sessionsBLL.remove(id).then(
      () => callback(null),
      () => callback(new ServiceUnavailableError())
    );
  }
  // Sessions expire SESSION_HOURS after sign-in, even if the user remains active.
  // Read-only requests must not extend their lifetime or recreate deleted rows.
  touch(id, data, callback) {
    callback(null);
  }
}

function sessionMiddleware() {
  return session({
    name: COOKIE_NAME,
    secret: config.session.secret,
    store: new MySqlSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: { ...cookieOptions, maxAge: config.session.hours * 3600000 }
  });
}

async function startSession(req, user, sessionVersion) {
  try {
    // Destroy the previous ID, preventing session fixation and account mixing.
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve()))
    );
    req.session.userId = user.id;
    req.session.sessionVersion = sessionVersion;
    req.session.expiresAt = Date.now() + config.session.hours * 3600000;
    // Finish the database write before sending a successful login response.
    await new Promise((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve()))
    );
  } catch (error) {
    req.session = null; // Do not retry a failed save when Express sends the error response.
    throw error;
  }
}

async function endSession(req, res) {
  if (req.session) {
    await new Promise((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve()))
    );
  }
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

function readSession(req) {
  const data = req.session;
  return data &&
    Number.isInteger(data.userId) &&
    Number.isInteger(data.sessionVersion) &&
    data.expiresAt > Date.now()
    ? data
    : null;
}
module.exports = {
  sessionMiddleware,
  MySqlSessionStore,
  startSession,
  endSession,
  readSession,
  COOKIE_NAME
};
