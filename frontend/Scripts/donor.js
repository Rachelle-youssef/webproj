import { api } from './api.js';

export function mountDonor(root, user, escapeHtml, onSessionExpired) {
  const labels = {
    invited: 'Invited',
    pending: 'Awaiting admin acceptance',
    accepted: 'Accepted · awaiting collection',
    completed: 'Completed',
    declined: 'Declined',
    cancelled: 'Cancelled'
  };
  const badge = (status) =>
    `<span class="pill ${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;
  const button = (label, action, id = '', style = '') =>
    `<button type="button" class="btn sm ${style}" data-action="${action}" data-id="${id}">${label}</button>`;
  const pager = (section, meta) =>
    meta.pages > 1
      ? `<div class="acts donor-pages">
    ${meta.page > 1 ? button('Previous', section, meta.page - 1, 'ghost') : ''}
    <span>Page ${meta.page} of ${meta.pages}</span>
    ${meta.page < meta.pages ? button('Next', section, meta.page + 1, 'ghost') : ''}
  </div>`
      : '';
  // Decide which action belongs to this request before building its HTML.
  function requestAction(row, eligible) {
    if (row.can_offer_again && eligible) {
      return button('Offer again', 'offer', Number(row.id));
    }
    if (row.my_response) {
      return badge(row.my_response);
    }
    if (eligible) {
      return button('Offer to donate', 'offer', Number(row.id));
    }
    return '';
  }

  function donationActions(row, eligible) {
    let actions = '';
    if (row.status === 'invited') {
      if (eligible) {
        actions += button('Accept invitation', 'accept', Number(row.id));
      }
      actions += button('Decline invitation', 'decline', Number(row.id), 'ghost');
    }
    if (row.status === 'pending' || row.status === 'accepted') {
      actions += button('Withdraw offer', 'withdraw', Number(row.id), 'ghost');
    }
    return actions;
  }

  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Donor dashboard</div>
    <h1>Welcome, ${escapeHtml(user.full_name)}</h1><p class="mute">Blood type ${escapeHtml(user.donor?.blood_type)}</p></header>
    <p data-message role="status" hidden></p>
    <section data-panel class="card" aria-label="Donation eligibility"><p role="status">Loading eligibility…</p></section>
    <section><h2>Compatible blood requests</h2><div data-requests><p role="status">Loading requests…</p></div></section>
    <section><h2>My blood donations</h2><div data-donations><p role="status">Loading donations…</p></div></section>`;
  const panel = root.querySelector('[data-panel]');
  const requests = root.querySelector('[data-requests]');
  const donations = root.querySelector('[data-donations]');
  const message = root.querySelector('[data-message]');
  let requestsPage = 1;
  let donationsPage = 1;
  let busy = false;
  function showMessage(text, error = false) {
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('donor-error', error);
  }
  async function load() {
    const [eligibility, open, history] = await Promise.allSettled([
      api('/blood-donations/eligibility'),
      api('/blood-requests?page=' + requestsPage + '&limit=10&sort=-urgency', {
        includeMeta: true
      }),
      api('/blood-donations?page=' + donationsPage + '&limit=10&sort=-created_at', {
        includeMeta: true
      })
    ]);
    if (!root.isConnected) {
      return;
    }
    if (
      [eligibility, open, history].some(
        (result) => result.status === 'rejected' && result.reason.status === 401
      )
    ) {
      onSessionExpired();
      return;
    }
    const eligible = eligibility.status === 'fulfilled' && eligibility.value.eligible;
    const error = (result) =>
      `<p class="empty" role="alert">${escapeHtml(result.reason.message)}</p>`;
    if (eligibility.status === 'rejected') {
      panel.innerHTML = error(eligibility);
    } else {
      const value = eligibility.value;
      panel.innerHTML = `<h2>${eligible ? 'Eligible to offer blood' : 'Waiting period active'}</h2>
        <p class="mute">${eligible ? 'You can offer to help a compatible request or donate to the blood bank.' : `Next eligible date ${escapeHtml(value.next_eligible_date)} · ${Number(value.days_remaining)} day(s) remaining.`}</p>
        ${eligible ? button('Offer to the blood bank', 'independent') : ''}`;
    }
    if (open.status === 'rejected') {
      requests.innerHTML = error(open);
    } else {
      const { data, meta } = open.value;
      requests.innerHTML =
        (data
          .map(
            (row) => `<article class="item">
        <div><b>${escapeHtml(row.hospital_name)}</b>${row.city ? ` <small>${escapeHtml(row.city)}</small>` : ''}
          <p>${escapeHtml(row.blood_type)} · ${Number(row.units_received)} of ${Number(row.units_needed)} units received</p></div>
        <div class="acts">${badge(row.urgency)}
          ${requestAction(row, eligible)}</div>
      </article>`
          )
          .join('') || '<p class="empty">No compatible open requests on this page.</p>') +
        pager('requests-page', meta);
    }
    if (history.status === 'rejected') {
      donations.innerHTML = error(history);
    } else {
      const { data, meta } = history.value;
      donations.innerHTML =
        (data
          .map(
            (row) => `<article class="item">
        <div><b>${escapeHtml(row.request?.hospital_name || 'Blood bank')}</b>
          <p class="mute">Donation #${Number(row.id)} · ${escapeHtml(row.created_at?.slice(0, 10))}</p>
          ${row.admin_note ? `<p class="mute">${escapeHtml(row.admin_note)}</p>` : ''}</div>
        <div class="acts">${badge(row.status)}
          ${donationActions(row, eligible)}</div>
      </article>`
          )
          .join('') || '<p class="empty">No blood donations yet.</p>') +
        pager('donations-page', meta);
    }
  }
  root.addEventListener('click', async (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target || busy) {
      return;
    }
    const { action } = target.dataset;
    const id = Number(target.dataset.id);
    const paging = action === 'requests-page' || action === 'donations-page';
    busy = true;
    root.querySelectorAll('button').forEach((item) => {
      item.disabled = true;
    });
    try {
      if (action === 'requests-page') {
        requestsPage = id;
      } else if (action === 'donations-page') {
        donationsPage = id;
      } else if (action === 'offer' || action === 'independent') {
        let offer = {};
        if (action === 'offer') {
          offer = { request_id: id };
        }
        await api('/blood-donations', { method: 'POST', body: offer });
        donationsPage = 1;
        showMessage('Offer sent. An admin will review it.');
      } else if (action === 'withdraw') {
        await api('/blood-donations/' + id + '/withdraw', {
          method: 'PATCH'
        });
        showMessage('Offer withdrawn.');
      } else {
        const accept = action === 'accept';
        await api('/blood-donations/' + id + '/respond', {
          method: 'PATCH',
          body: {
            accept
          }
        });
        showMessage(
          accept
            ? 'Invitation accepted. An admin will review your offer.'
            : 'Invitation declined.'
        );
      }
      if (paging) {
        message.hidden = true;
      }
      await load();
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
      } else {
        showMessage(err.message, true);
      }
    } finally {
      busy = false;
      root.querySelectorAll('button').forEach((item) => {
        item.disabled = false;
      });
    }
  });
  load();
}
