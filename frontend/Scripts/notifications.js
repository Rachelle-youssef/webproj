import { api } from './api.js';
import {
  communityIcon,
  communityTime,
  communityPager,
  communitySummary,
  notificationTarget
} from './communityView.js';

const labels = {
  sos: 'SOS alert',
  request: 'Blood request',
  invite: 'Invitation',
  response: 'Response',
  donation: 'Blood donation',
  medicine: 'Medicine',
  thanks: 'Thank you',
  account: 'Account update'
};

export function mountNotifications(
  root,
  user,
  escapeHtml,
  onSessionExpired,
  onUnreadCount
) {
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Your LifeLink inbox</div>
    <h1>Notifications</h1><p class="mute">Your requests, offers and next steps. All in one place.</p></header>
    <section class="notification-summary" aria-label="Inbox overview">
      <div class="notification-total"><span class="community-symbol">${communityIcon('bell')}</span><div><b data-unread-total>…</b><span>Unread across all your notifications</span></div></div>
      <div class="notification-read-all"><button class="btn" type="button" data-notice-action="all" disabled>Mark all as read</button><p>Includes notifications outside the current filter and page.</p></div>
    </section>
    <form class="community-filters" data-notification-filters>
      <label>Read status<select name="is_read"><option value="">All notifications</option><option value="false">Unread</option><option value="true">Read</option></select></label>
      <label>Category<select name="type"><option value="">All categories</option>${Object.entries(
        labels
      )
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join('')}</select></label>
      <label>Order<select name="sort"><option value="-created_at">Newest first</option><option value="created_at">Oldest first</option></select></label>
      <button class="btn ghost" type="submit">Apply filters</button>
    </form>
    <p class="community-feedback" data-notice-feedback role="status" hidden></p>
    <div class="community-list-heading"><h2>Your inbox</h2><p data-notice-status role="status"></p></div>
    <ol class="notification-list" data-notice-list aria-label="Your notifications"></ol>
    <div data-notice-pager></div>
    <p class="community-footnote">Dates are shown in Lebanon time. Use the refresh icon above to check for new messages.</p>`;

  const form = root.querySelector('[data-notification-filters]');
  const list = root.querySelector('[data-notice-list]');
  const pager = root.querySelector('[data-notice-pager]');
  const status = root.querySelector('[data-notice-status]');
  const total = root.querySelector('[data-unread-total]');
  const feedback = root.querySelector('[data-notice-feedback]');
  const markAll = root.querySelector('[data-notice-action="all"]');
  let page = 1;
  let filters = { is_read: '', type: '', sort: '-created_at' };
  let meta = { page: 1, pages: 1, total: 0, limit: 10 };
  let unread = null;
  let busy = false;
  let disposed = false;
  let generation = 0;

  function setBusy(value) {
    busy = value;
    list.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, select').forEach((control) => {
      control.disabled = value;
    });
    markAll.disabled = value || unread === null || unread === 0;
    pager.querySelectorAll('[data-community-page]').forEach((button) => {
      const target = Number(button.dataset.communityPage);
      button.disabled = value || target < 1 || target > meta.pages;
    });
  }

  function showFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.classList.toggle('donor-error', error);
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }

  function syncUnreadCount(event) {
    unread = event.detail;
    total.textContent = unread === null ? 'Unavailable' : unread.toLocaleString();
    markAll.disabled = busy || unread === null || unread === 0;
  }

  function renderRows(rows) {
    if (!rows.length) {
      list.innerHTML = `<li class="community-empty"><span class="community-symbol">${communityIcon('bell')}</span><h3>No notifications in this view.</h3><p>Try another filter, or check back after your next donation or request.</p></li>`;
      return;
    }
    list.innerHTML = rows
      .map((row) => {
        const id = Number(row.id);
        const read = row.is_read === true || row.is_read === 1;
        const target = notificationTarget(row, user.role);
        const kind = row.type === 'medicine' ? 'medicine' : 'bell';
        return `<li class="notification-item ${read ? 'is-read' : 'is-unread'} ${row.type === 'sos' ? 'is-sos' : ''}" data-notice-id="${id}">
        <span class="community-symbol ${kind}">${communityIcon(kind)}</span>
        <div class="notification-body"><div class="notification-meta"><span class="notification-kind">${escapeHtml(labels[row.type] || 'Notification')}</span><span class="notification-read-state">${read ? 'Read' : '<i aria-hidden="true"></i>Unread'}</span>${communityTime(row.created_at, escapeHtml)}</div>
          <p class="notification-message">${escapeHtml(row.message)}</p>
          <div class="notification-actions">${target ? `<a class="community-related-link" href="#/${target.path}">${target.label}<span aria-hidden="true"> ↗</span></a>` : ''}
          ${read ? '' : `<button class="btn ghost sm" type="button" data-notice-action="one" data-notice-key="${id}">Mark as read</button>`}</div>
        </div></li>`;
      })
      .join('');
  }

  async function load() {
    const request = ++generation;
    setBusy(true);
    status.textContent = 'Loading notifications…';
    list.innerHTML =
      '<li class="community-loading" role="status">Loading your inbox…</li>';
    pager.innerHTML = '';
    const query = new URLSearchParams({ page, limit: 10, sort: filters.sort });
    if (filters.is_read) {
      query.set('is_read', filters.is_read);
    }
    if (filters.type) {
      query.set('type', filters.type);
    }
    const [messages, count] = await Promise.allSettled([
      api('/notifications?' + query, { includeMeta: true }),
      api('/notifications/unread-count')
    ]);
    if (disposed || request !== generation) {
      return;
    }
    if (
      [messages, count].some(
        (result) => result.status === 'rejected' && result.reason.status === 401
      )
    ) {
      onSessionExpired();
      return;
    }
    if (count.status === 'fulfilled') {
      unread = Number(count.value.count);
      total.textContent = unread.toLocaleString();
      onUnreadCount(unread);
    } else {
      unread = null;
      total.textContent = 'Unavailable';
      onUnreadCount(null);
    }
    if (messages.status === 'fulfilled') {
      meta = messages.value.meta;
      if (page > meta.pages) {
        page = meta.pages;
        await load();
        return;
      }
      renderRows(messages.value.data);
      status.textContent = communitySummary(meta, 'notifications');
      pager.innerHTML = communityPager(meta);
    } else {
      status.textContent = 'Inbox could not be loaded';
      list.innerHTML = `<li class="community-empty" role="alert"><h3>We couldn’t load your notifications.</h3><p>${escapeHtml(messages.reason.message)}</p><p>Use the refresh icon above to try again.</p></li>`;
    }
    setBusy(false);
  }

  async function markRead(button) {
    if (busy) {
      return;
    }
    const all = button.dataset.noticeAction === 'all';
    const id = Number(button.dataset.noticeKey);
    if (!all && (!Number.isInteger(id) || id <= 0)) {
      return;
    }
    setBusy(true);
    try {
      const result = await api(
        all ? '/notifications/read-all' : '/notifications/' + id + '/read',
        { method: 'PATCH' }
      );
      if (disposed) {
        return;
      }
      const updated = all ? Number(result.updated) : 1;
      showFeedback(
        all
          ? `Marked ${updated} notification${updated === 1 ? '' : 's'} as read.`
          : 'Notification marked as read.'
      );
      // Invalidate earlier count requests before fetching the committed result.
      onUnreadCount(null);
      await load();
    } catch (error) {
      if (disposed) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
      } else {
        showFeedback(error.message, true);
      }
    } finally {
      if (!disposed) {
        setBusy(false);
      }
    }
  }

  function submit(event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    filters = Object.fromEntries(new FormData(form));
    page = 1;
    feedback.hidden = true;
    load();
  }

  function click(event) {
    const action = event.target.closest('[data-notice-action]');
    if (action) {
      markRead(action);
      return;
    }
    const button = event.target.closest('[data-community-page]');
    if (button && !busy) {
      page = Number(button.dataset.communityPage);
      feedback.hidden = true;
      load();
    }
  }

  form.addEventListener('submit', submit);
  root.addEventListener('click', click);
  window.addEventListener('lifelink:unread-count', syncUnreadCount);
  load();
  return () => {
    disposed = true;
    generation++;
    form.removeEventListener('submit', submit);
    root.removeEventListener('click', click);
    window.removeEventListener('lifelink:unread-count', syncUnreadCount);
  };
}
