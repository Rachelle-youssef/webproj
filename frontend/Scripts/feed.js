import { api } from './api.js';
import {
  communityIcon,
  communityTime,
  communityPager,
  communitySummary
} from './communityView.js';

export function mountFeed(root, escapeHtml, onSessionExpired) {
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Care, carried forward</div><h1>Community feed</h1><p class="mute">Completed blood donations and approved medicine batches. Small actions, shared impact.</p></header>
    <section class="community-feed-intro"><div><h2>Good travels further.</h2><p>Every entry is a recorded donation. Donor names and home locations stay private.</p></div><span class="community-symbol">${communityIcon('blood')}</span></section>
    <form class="community-filters" data-feed-filters><label>Activity<select name="kind"><option value="">All activity</option><option value="blood">Blood donations</option><option value="medicine">Medicine donations</option></select></label><label>Order<select name="sort"><option value="-at">Newest first</option><option value="at">Oldest first</option></select></label><button class="btn ghost" type="submit">Apply filters</button></form>
    <div class="community-list-heading"><h2>From our community</h2><p data-feed-status role="status"></p></div>
    <ol class="community-timeline" data-feed-list aria-label="Community donation activity"></ol><div data-feed-pager></div>
    <aside class="community-feed-note"><h3>Different people. One community.</h3><p>Blood entries appear after collection is confirmed. Medicine entries represent reviewed donations, including batches that have since been dispensed.</p><a class="community-related-link" href="#/overview">Open my workspace <span aria-hidden="true">↗</span></a></aside>
    <p class="community-footnote">Dates are shown in Lebanon time. Open or refresh this page to see the latest recorded activity.</p>`;
  const form = root.querySelector('[data-feed-filters]');
  const list = root.querySelector('[data-feed-list]');
  const pager = root.querySelector('[data-feed-pager]');
  const status = root.querySelector('[data-feed-status]');
  let filters = { kind: '', sort: '-at' };
  let page = 1;
  let busy = false;
  let disposed = false;
  let generation = 0;

  function setBusy(value) {
    busy = value;
    list.setAttribute('aria-busy', String(value));
    form.querySelectorAll('select, button').forEach((control) => {
      control.disabled = value;
    });
  }

  async function load() {
    const request = ++generation;
    setBusy(true);
    list.innerHTML =
      '<li class="community-loading" role="status">Loading community activity…</li>';
    pager.innerHTML = '';
    status.textContent = 'Loading activity…';
    const query = new URLSearchParams({ page, limit: 10, sort: filters.sort });
    if (filters.kind) {
      query.set('kind', filters.kind);
    }
    try {
      const result = await api('/feed?' + query, { includeMeta: true });
      if (disposed || request !== generation) {
        return;
      }
      if (page > result.meta.pages) {
        page = result.meta.pages;
        await load();
        return;
      }
      status.textContent = communitySummary(result.meta, 'activities');
      list.innerHTML = result.data.length
        ? result.data
            .map((item) => {
              const medicine = item.kind === 'medicine';
              const kind = medicine ? 'medicine' : 'blood';
              const title = medicine ? item.title : 'Blood donation completed';
              const quantity = Number(item.quantity);
              return `<li class="community-activity ${kind}"><span class="community-symbol ${kind}">${communityIcon(kind)}</span><div class="community-activity-body"><div class="notification-meta"><span class="notification-kind">${medicine ? 'Medicine donation' : 'Blood donation'}</span>${communityTime(item.at, escapeHtml)}</div><h3>${escapeHtml(title)}</h3><p>${medicine ? `${quantity.toLocaleString()} medicine unit(s) donated and reviewed.` : 'A completed donation, recorded after blood collection.'}</p></div><span class="community-quantity"><b>${quantity.toLocaleString()}</b><span>${medicine ? 'units donated' : 'donation'}</span></span></li>`;
            })
            .join('')
        : '<li class="community-empty"><h3>No activity in this view yet.</h3><p>Try another filter. Completed blood donations and reviewed medicine batches will appear here.</p></li>';
      pager.innerHTML = communityPager(result.meta);
    } catch (error) {
      if (disposed || request !== generation) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
        return;
      }
      status.textContent = 'Activity could not be loaded';
      list.innerHTML = `<li class="community-empty" role="alert"><h3>We couldn’t load the community feed.</h3><p>${escapeHtml(error.message)}</p><p>Use the refresh icon above to try again.</p></li>`;
    } finally {
      if (!disposed && request === generation) {
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
    load();
  }

  function click(event) {
    const button = event.target.closest('[data-community-page]');
    if (button && !busy) {
      page = Number(button.dataset.communityPage);
      load();
    }
  }
  form.addEventListener('submit', submit);
  root.addEventListener('click', click);
  load();
  return () => {
    disposed = true;
    generation++;
    form.removeEventListener('submit', submit);
    root.removeEventListener('click', click);
  };
}
