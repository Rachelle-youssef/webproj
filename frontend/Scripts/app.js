// Frontend entry point. It reads the session, chooses a page and connects the forms.
import { api } from './api.js';
import { installFeedback } from './feedback.js';
import { mountLocationPicker } from './locationPicker.js';
import { landing } from './landing.js';
import { mountHeroScene } from './heroScene.js';
import { mountDonor } from './donor.js';
import { mountRequester } from './requester.js';
import { mountAdmin } from './admin.js';
import { mountMedicineDonations } from './medicineDonations.js';
import { mountOverview } from './overview.js';
import { mountAdminManagement } from './adminManagement.js';
import { mountRequestMap } from './requestMap.js';
import { mountNotifications } from './notifications.js';
import { mountFeed } from './feed.js';
import { mountProfile } from './profile.js';
import { mountMedicineScanner } from './medicineScanner.js';
import { passwordField, handlePasswordToggle } from './passwordFields.js';
installFeedback();

function getElement(selector) {
  return document.querySelector(selector);
}
const roles = {
  donor: 'Donor',
  recipient: 'Patient',
  hospital: 'Hospital',
  admin: 'Admin'
};
// Escape user/database text before inserting it into HTML.
const htmlCharacters = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};
function escapeHtml(value) {
  const text = String(value ?? '');
  return text.replace(/[&<>"']/g, function (character) {
    return htmlCharacters[character];
  });
}
const field = (label, name, attrs) =>
  `<label>${label}<input name="${name}" ${attrs}></label>`;
const routes = [
  'home',
  'login',
  'register',
  'account',
  'overview',
  'map',
  'notifications',
  'feed',
  'donor',
  'donor-medicines',
  'requests',
  'medicines',
  'admin',
  'admin-medicines',
  'admin-scanner'
];
const adminSections = {
  'admin-users': 'users',
  'admin-stock': 'stock',
  'admin-calls': 'calls',
  'admin-inventory': 'inventory',
  'admin-audit': 'audit'
};
routes.push(...Object.keys(adminSections));
let user = null;
let stats;
let types = [];
let submitting = false;
let startupError;
let cleanupPage = () => {};
let unreadCount = null;
let unreadUserId = null;
let unreadRequest = 0;
let passwordUpdatePending = false;

function setPasswordUpdatePending(value) {
  // The password endpoint renews the session cookie. Avoid stale count checks during renewal.
  passwordUpdatePending = value;
  unreadRequest++;
  const logout = getElement('[data-act="logout"]');
  if (logout) {
    logout.disabled = value;
  }
  const refresh = getElement('[data-act="refresh"]');
  if (refresh) {
    refresh.disabled = value;
  }
  if (!value) {
    refreshUnreadCount();
  }
}

function paintUnreadCount() {
  const link = getElement('[data-unread-link]');
  if (!link) {
    return;
  }
  const badge = link.querySelector('[data-unread-badge]');
  badge.hidden = unreadCount === null || unreadCount === 0;
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount ?? '');
  link.setAttribute(
    'aria-label',
    unreadCount === null
      ? 'Notifications, unread count unavailable'
      : `Notifications, ${unreadCount} unread`
  );
  // Keep an open inbox's total in sync with the header's background checks.
  window.dispatchEvent(new CustomEvent('lifelink:unread-count', { detail: unreadCount }));
}

function updateUnreadCount(count) {
  // A committed read action invalidates count requests started before it.
  unreadRequest++;
  unreadCount = count;
  unreadUserId = user?.id ?? null;
  paintUnreadCount();
}

async function refreshUnreadCount() {
  if (!user || document.hidden || passwordUpdatePending) {
    return;
  }
  const owner = user.id;
  const request = ++unreadRequest;
  try {
    const result = await api('/notifications/unread-count');
    if (user?.id !== owner || request !== unreadRequest) {
      return;
    }
    unreadCount = Number(result.count);
    unreadUserId = owner;
    paintUnreadCount();
  } catch (error) {
    if (user?.id !== owner || request !== unreadRequest) {
      return;
    }
    if (error.status === 401) {
      user = null;
      unreadCount = null;
      startupError = 'Your session ended. Log in again to continue.';
      go('login');
    } else {
      unreadCount = null;
      paintUnreadCount();
    }
  }
}

function route() {
  const path = location.hash.slice(2).split('?')[0];
  return routes.includes(path) ? path : 'home';
}

function go(path) {
  const hash = '#/' + path;
  if (location.hash === hash) {
    render();
  } else {
    location.hash = hash;
  }
}

function loginForm() {
  return `<p class="eyebrow auth-kicker">Welcome back</p><h2>Log in</h2><p class="auth-intro">A little care starts with a connection.</p><form class="card" data-form="login">
      ${field('Email', 'email', 'type="email" autocomplete="username" required')}
      ${passwordField('Password', 'password', 'autocomplete="current-password" required maxlength="128"')}
      <button class="btn">Log in</button><a class="btn ghost" href="#/register">Create an account</a>
      <p data-error role="alert" hidden></p>
    </form>`;
}

let registrationPicker;
function configureRegistrationLocation(form) {
  registrationPicker?.dispose();
  registrationPicker = undefined;
  const container = form.querySelector('[data-register-location]');
  container.replaceChildren();
  container.hidden = form.elements.role.value !== 'hospital';
  form.elements.full_name.closest('label').firstChild.textContent = container.hidden
    ? 'Full name'
    : 'Hospital or clinic name';
  if (!container.hidden)
    registrationPicker = mountLocationPicker(container, form, {
      title: 'Pin your hospital',
      description:
        'Save your hospital location once. New blood requests will use this pin.',
      showCoordinates: false
    });
}
function registerForm() {
  const options = types
    .map(
      (type) => `<option value="${Number(type.id)}">${escapeHtml(type.label)}</option>`
    )
    .join('');
  return `<p class="eyebrow auth-kicker">A place for everyone</p><h2>Create an account</h2><p class="auth-intro">Join as a donor, patient or hospital. Find your place in LifeLink.</p><form class="card" data-form="register">
      ${field('Full name', 'full_name', 'autocomplete="name" required minlength="2" maxlength="100"')}
      ${field('Email', 'email', 'type="email" autocomplete="email" required')}
      ${passwordField('Password (8+ characters)', 'password', 'autocomplete="new-password" required minlength="8" maxlength="128"')}
      ${passwordField('Confirm password', 'confirm_password', 'autocomplete="new-password" required minlength="8" maxlength="128"')}
      ${field('City', 'city', 'autocomplete="address-level2" required')}
      ${field('Phone (optional)', 'phone', 'type="tel" autocomplete="tel" maxlength="20"')}
      <label>I am a<select name="role"><option value="donor">Donor</option><option value="recipient">Patient or recipient</option><option value="hospital">Hospital or clinic</option></select></label>
      <label id="bt">Blood type<select name="blood_type_id" required><option value="">${options ? 'Choose your blood type' : 'Blood types unavailable'}</option>${options}</select></label>
      <div data-register-location hidden></div>
      <button class="btn">Sign up</button><a class="btn ghost" href="#/login">I already have an account</a>
      <p data-error role="alert" hidden></p>
    </form>`;
}
const canRequest = () => ['recipient', 'hospital'].includes(user?.role);

function paintNav(current) {
  if (unreadUserId !== user?.id) {
    unreadCount = null;
    unreadRequest++;
  }
  document.body.dataset.screen = current;
  const link = (label, path, mark = '') =>
    `<a class="${current === path ? 'on' : ''}" href="#/${path}"${current === path ? ' aria-current="page"' : ''}>${mark ? `<span class="nav-mark" aria-hidden="true">${mark}</span>` : ''}${label}</a>`;
  const menus = {
    donor: [
      ['Blood donations', 'donor', '01'],
      ['Medicine donations', 'donor-medicines', '02']
    ],
    recipient: [
      ['Blood requests', 'requests', '01'],
      ['Medicines', 'medicines', '02']
    ],
    hospital: [
      ['Blood requests', 'requests', '01'],
      ['Medicines', 'medicines', '02']
    ],
    admin: [
      ['Blood coordination', 'admin', '01'],
      ['Medicine review', 'admin-medicines', '02'],
      ['Blood stock', 'admin-stock', '03'],
      ['Medicine inventory', 'admin-inventory', '04'],
      ['Scan medicine QR', 'admin-scanner', '⌗'],
      ['Medicine appeals', 'admin-calls', '05'],
      ['Accounts', 'admin-users', '06'],
      ['Audit history', 'admin-audit', '07']
    ]
  };
  document.body.dataset.workspace = user ? 'signed-in' : 'public';
  getElement('#workspace-nav').hidden = !user;
  getElement('#workspace-role').textContent = user ? roles[user.role] + ' workspace' : '';
  getElement('#public-nav').innerHTML =
    link('Community home', 'home') +
    (current === 'home'
      ? '<button class="home-nav-link" type="button" data-home-target="home-how">How it works</button><button class="home-nav-link" type="button" data-home-target="home-stock">Blood stock</button>'
      : '') +
    (user ? '' : link('Log in', 'login') + link('Sign up', 'register'));
  getElement('#nav').innerHTML = user
    ? link('Overview', 'overview', '◇') +
      (menus[user.role] || []).map((item) => link(...item)).join('') +
      link('Request map', 'map', '⌖') +
      link('Notifications', 'notifications', '◌') +
      link('Community feed', 'feed', '↗') +
      link('My account', 'account', '○')
    : '';
  getElement('#who').innerHTML = user
    ? `<div class="avatar" aria-hidden="true">${escapeHtml(user.full_name.charAt(0).toUpperCase())}</div>
         <span class="nm">${escapeHtml(user.full_name.split(' ')[0])} <small class="mute">(${escapeHtml(roles[user.role])})</small></span>
         <a class="notification-bell" href="#/notifications" data-unread-link aria-label="Notifications">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
           <span data-unread-badge aria-hidden="true" hidden></span>
         </a>
         <button class="refresh-control" type="button" data-act="refresh" aria-label="Refresh page" title="Refresh">
           <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
             <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7"/>
           </svg>
         </button>
         <button class="btn ghost sm" type="button" data-act="logout">Log out</button>`
    : '';
  paintUnreadCount();
  const logout = getElement('[data-act="logout"]');
  if (logout) {
    logout.disabled = passwordUpdatePending;
  }
  const refresh = getElement('[data-act="refresh"]');
  if (refresh) {
    refresh.disabled = passwordUpdatePending;
  }
}

function render() {
  document.dispatchEvent(new Event('lifelink:navigation'));
  let current = route();
  if (['donor', 'donor-medicines'].includes(current) && user?.role !== 'donor') {
    current = user ? 'account' : 'login';
  }
  if (['requests', 'medicines'].includes(current) && !canRequest()) {
    current = user ? 'overview' : 'login';
  }
  if (
    (['admin', 'admin-medicines', 'admin-scanner'].includes(current) ||
      Object.hasOwn(adminSections, current)) &&
    user?.role !== 'admin'
  ) {
    current = user ? 'overview' : 'login';
  }
  if (
    ['account', 'overview', 'map', 'notifications', 'feed'].includes(current) &&
    !user
  ) {
    current = 'login';
  }
  if (user && ['login', 'register'].includes(current)) {
    current = 'overview';
  }
  cleanupPage();
  registrationPicker?.dispose();
  registrationPicker = undefined;
  cleanupPage = () => {};
  paintNav(current);
  const error = startupError
    ? `<p role="alert" class="empty">${escapeHtml(startupError)}</p>`
    : '';
  if (
    [
      'account',
      'overview',
      'map',
      'notifications',
      'feed',
      'donor',
      'donor-medicines',
      'requests',
      'medicines',
      'admin',
      'admin-medicines',
      'admin-scanner'
    ].includes(current) ||
    Object.hasOwn(adminSections, current)
  ) {
    const dashboard = document.createElement('div');
    dashboard.className = 'donor-dashboard';
    getElement('#view').replaceChildren(dashboard);
    const onSessionExpired = () => {
      if (!dashboard.isConnected) {
        return;
      }
      user = null;
      startupError = 'Your session ended. Log in again to continue.';
      go('login');
    };
    if (current === 'account') {
      cleanupPage = mountProfile(
        dashboard,
        escapeHtml,
        onSessionExpired,
        (updated) => {
          if (!user || user.id !== updated.id) {
            return;
          }
          user = updated;
          paintNav(current);
        },
        setPasswordUpdatePending
      );
    } else if (current === 'overview') {
      mountOverview(dashboard, user, escapeHtml, onSessionExpired);
    } else if (current === 'notifications') {
      dashboard.classList.add('community-page');
      cleanupPage = mountNotifications(
        dashboard,
        user,
        escapeHtml,
        onSessionExpired,
        updateUnreadCount
      );
    } else if (current === 'feed') {
      dashboard.classList.add('community-page');
      cleanupPage = mountFeed(dashboard, escapeHtml, onSessionExpired);
    } else if (current === 'map') {
      cleanupPage = mountRequestMap(dashboard, user, types, escapeHtml, onSessionExpired);
    } else if (current === 'admin-scanner') {
      cleanupPage = mountMedicineScanner(dashboard, escapeHtml, onSessionExpired);
    } else if (Object.hasOwn(adminSections, current)) {
      mountAdminManagement(
        dashboard,
        user,
        types,
        escapeHtml,
        onSessionExpired,
        adminSections[current]
      );
    } else if (current === 'donor') {
      mountDonor(dashboard, user, escapeHtml, onSessionExpired);
    } else if (current === 'donor-medicines') {
      mountMedicineDonations(dashboard, escapeHtml, onSessionExpired);
    } else if (current === 'requests' || current === 'medicines') {
      cleanupPage = mountRequester(
        dashboard,
        user,
        types,
        escapeHtml,
        onSessionExpired,
        current === 'requests' ? 'blood' : 'medicine'
      );
    } else {
      cleanupPage = mountAdmin(
        dashboard,
        types,
        escapeHtml,
        onSessionExpired,
        current === 'admin' ? 'blood' : 'medicine',
        new URLSearchParams(location.hash.split('?')[1] || '').get('queue')
      );
    }
  } else if (current === 'login' || current === 'register') {
    getElement('#view').innerHTML =
      error +
      `<div id="auth" class="auth">${current === 'register' ? registerForm() : loginForm()}</div>`;
  } else {
    getElement('#view').innerHTML = error + landing(stats, user);
    cleanupPage = mountHeroScene(getElement('.home-network'));
  }
  if (current === 'register')
    configureRegistrationLocation(getElement('[data-form="register"]'));
  if (['login', 'register'].includes(current)) {
    getElement('#auth')?.scrollIntoView({
      block: 'start'
    });
  } else {
    window.scrollTo(0, 0);
  }
  refreshUnreadCount();
}
document.addEventListener('change', (event) => {
  if (!event.target.matches('[name="role"]')) {
    return;
  }
  const isDonor = event.target.value === 'donor';
  configureRegistrationLocation(event.target.form);
  getElement('#bt').classList.toggle('hidden', !isDonor);
  getElement('#bt select').disabled = !isDonor;
  getElement('#bt select').required = isDonor;
});
document.addEventListener('input', (event) => {
  const form = event.target.closest('form[data-form="register"]');
  if (form && ['password', 'confirm_password'].includes(event.target.name)) {
    form.elements.confirm_password.setCustomValidity('');
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) {
    return;
  }
  event.preventDefault();
  if (submitting) {
    return;
  }
  const confirmation = form.elements.confirm_password;
  if (confirmation && form.elements.password.value !== confirmation.value) {
    confirmation.setCustomValidity('Passwords do not match.');
    confirmation.reportValidity();
    return;
  }
  const button = form.querySelector('button[type="submit"], button:not([type])');
  const error = form.querySelector('[data-error]');
  const body = Object.fromEntries(
    [...new FormData(form)].filter(([, value]) => value !== '')
  );
  // Confirmation prevents typing mistakes in this form; the API receives one password.
  delete body.confirm_password;
  if (body.blood_type_id !== undefined) {
    body.blood_type_id = Number(body.blood_type_id);
  }
  if (body.latitude !== undefined) {
    body.latitude = Number(body.latitude);
  }
  if (body.longitude !== undefined) {
    body.longitude = Number(body.longitude);
  }
  submitting = true;
  button.disabled = true;
  error.hidden = true;
  try {
    user = await api('/auth/' + form.dataset.form, {
      method: 'POST',
      body
    });
    startupError = undefined;
    go('overview');
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    submitting = false;
    button.disabled = false;
  }
});
document.addEventListener('click', async (event) => {
  if (handlePasswordToggle(event)) {
    return;
  }
  const sectionLink = event.target.closest('[data-home-target]');
  if (sectionLink) {
    const section = document.getElementById(sectionLink.dataset.homeTarget);
    section?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start'
    });
    return;
  }
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    getElement('#view').focus();
    return;
  }
  const refresh = event.target.closest('[data-act="refresh"]');
  if (refresh) {
    refresh.disabled = true;
    refresh.setAttribute('aria-label', 'Refreshing page');
    refresh.setAttribute('aria-busy', 'true');
    location.reload();
    return;
  }
  const button = event.target.closest('[data-act="logout"]');
  if (!button) {
    return;
  }
  button.disabled = true;
  try {
    await api('/auth/logout', {
      method: 'POST'
    });
    user = null;
    go('home');
  } catch (err) {
    getElement('#toast').textContent = err.message;
    getElement('#toast').className = 'show bad';
    setTimeout(() => {
      getElement('#toast').className = '';
    }, 4000);
    button.disabled = false;
  }
});
const theme = document.documentElement;
const savedTheme = localStorage.getItem('ll_theme');
if (savedTheme === 'dark' || savedTheme === 'light') {
  theme.dataset.theme = savedTheme;
}
getElement('#theme').addEventListener('click', () => {
  const current =
    theme.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  theme.dataset.theme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('ll_theme', theme.dataset.theme);
});

async function start() {
  getElement('#view').innerHTML = '<p class="empty" role="status">Loading LifeLink…</p>';
  const [session, publicStats, bloodTypes] = await Promise.allSettled([
    api('/auth/me'),
    api('/feed/stats'),
    api('/blood-types')
  ]);
  if (session.status === 'fulfilled') {
    user = session.value;
  } else if (session.reason.status !== 401) {
    startupError = session.reason.message;
  }
  if (publicStats.status === 'fulfilled') {
    stats = publicStats.value;
  }
  if (bloodTypes.status === 'fulfilled') {
    types = bloodTypes.value;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('focus', refreshUnreadCount);
  document.addEventListener('visibilitychange', refreshUnreadCount);
  setInterval(refreshUnreadCount, 60000);
  if (!location.hash && user) {
    go('overview');
  } else {
    render();
  }
}
start();
