// Small display helpers shared by the inbox and the community feed.
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Beirut'
});

export function communityIcon(kind) {
  let path = '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>';
  if (kind === 'blood') {
    path = '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>';
  } else if (kind === 'medicine') {
    path =
      '<path d="m9 4-5 5a6.4 6.4 0 0 0 9 9l5-5a6.4 6.4 0 0 0-9-9Z"/><path d="m7 7 10 10"/>';
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function communityTime(value, escapeHtml) {
  if (!value) {
    return '<span>Date unavailable</span>';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '<span>Date unavailable</span>';
  }
  return `<time datetime="${date.toISOString()}">${escapeHtml(dateFormat.format(date))}</time>`;
}

export function communityPager(meta) {
  return `<div class="community-pagination" aria-label="Pagination">
    <button class="btn ghost sm" type="button" data-community-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${meta.page} of ${meta.pages}</span>
    <button class="btn ghost sm" type="button" data-community-page="${meta.page + 1}" ${meta.page >= meta.pages ? 'disabled' : ''}>Next</button>
  </div>`;
}

export function communitySummary(meta, noun) {
  if (!meta.total) {
    return `0 ${noun} in this view`;
  }
  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);
  return `Showing ${start}–${end} of ${meta.total} ${noun}`;
}

export function notificationTarget(notification, role) {
  // Legacy notification links name API entities. Never use stored links as raw URLs.
  if (notification.type === 'account') {
    return { path: 'account', label: 'Open my account' };
  }
  if (notification.type === 'medicine') {
    if (role === 'admin') {
      return { path: 'admin-medicines', label: 'Open medicine review' };
    }
    if (role === 'donor') {
      return { path: 'donor-medicines', label: 'Open medicine donations' };
    }
    return { path: 'medicines', label: 'Open medicines' };
  }
  if (
    ['sos', 'request', 'invite', 'response', 'donation', 'thanks'].includes(
      notification.type
    )
  ) {
    if (role === 'admin') {
      return { path: 'admin', label: 'Open blood coordination' };
    }
    if (role === 'donor') {
      return { path: 'donor', label: 'Open blood donations' };
    }
    return { path: 'requests', label: 'Open blood requests' };
  }
  return null;
}
