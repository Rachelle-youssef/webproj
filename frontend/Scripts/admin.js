import { api } from './api.js';
import { mountLocationPicker, openLocationEditor } from './locationPicker.js';

export function mountAdmin(
  root,
  types,
  escapeHtml,
  onSessionExpired,
  domain = 'all',
  initialQueue = null
) {
  const allQueues = {
    reviewBlood: ['Blood requests to review', '/blood-requests?status=pending'],
    openBlood: ['Open blood requests', '/blood-requests?status=open'],
    offers: ['Blood offers', '/blood-donations?status=pending'],
    collections: ['Awaiting blood collection', '/blood-donations?status=accepted'],
    batches: ['Medicine batches to review', '/medicines?status=pending'],
    medicine: ['Medicine requests to dispense', '/medicine-requests?status=pending'],
    fulfilledBlood: ['Fulfilled blood requests', '/blood-requests?status=fulfilled'],
    cancelledBlood: ['Cancelled blood requests', '/blood-requests?status=cancelled'],
    invitations: ['Unanswered blood invitations', '/blood-donations?status=invited'],
    completed: ['Completed blood donations', '/blood-donations?status=completed'],
    declinedDonations: ['Declined blood invitations', '/blood-donations?status=declined'],
    cancelledDonations: [
      'Cancelled blood donations',
      '/blood-donations?status=cancelled'
    ],
    dispensedMedicine: [
      'Dispensed medicine requests',
      '/medicine-requests?status=approved'
    ]
  };
  const medicineQueues = ['batches', 'medicine', 'dispensedMedicine'];
  const queues = {};
  for (const [key, details] of Object.entries(allQueues)) {
    const isMedicineQueue = medicineQueues.includes(key);
    if (domain === 'all') {
      queues[key] = details;
    } else if (domain === 'medicine' && isMedicineQueue) {
      queues[key] = details;
    } else if (domain !== 'medicine' && !isMedicineQueue) {
      queues[key] = details;
    }
  }
  const stockTypes = types
    .map(
      (type) => `<option value="${Number(type.id)}">${escapeHtml(type.label)}</option>`
    )
    .join('');
  const button = (label, action, id, style = '') =>
    `<button type="button" class="btn sm ${style}" data-action="${action}" data-id="${id}">${label}</button>`;
  const note = (label) =>
    `<label>${label}<input name="note" minlength="3" maxlength="255" required></label>`;
  let queue = Object.hasOwn(queues, initialQueue) ? initialQueue : Object.keys(queues)[0];
  let page = 1;
  let busy = false;
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Administration</div>
    <h1>${domain === 'medicine' ? 'Medicine review' : 'Blood coordination'}</h1>
    <p class="mute">${domain === 'medicine' ? 'Review donated batches and record medicine handed out.' : 'Review requests, arrange donations and record blood received or handed out.'}</p></header>
    ${
      domain !== 'medicine'
        ? `<section><details class="admin-create"><summary>Create a blood appeal</summary>
      <p class="mute">Publish an open request on behalf of a hospital and notify eligible compatible donors.</p>
      <form data-action="create-blood" class="card">
        <label>Blood type<select name="blood_type_id" required><option value="">Choose blood type</option>${stockTypes}</select></label>
        <label>Units needed<input name="units_needed" type="number" min="1" max="50" step="1" required></label>
        <label>Hospital name<input name="hospital_name" minlength="2" maxlength="120" required></label>
        <label>City (optional)<input name="city" minlength="2" maxlength="60"></label>
        <label>Urgency<select name="urgency"><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="sos">SOS</option></select></label>
        <div data-hospital-picker></div>
        <button class="btn" type="submit">Publish blood appeal</button>
      </form></details></section>`
        : ''
    }
    <div data-summary role="status">Loading totals…</div>
    <section class="review-workspace"><h2>Work queues</h2>
      <div class="review-queue-tabs" aria-label="Common work queues">${Object.entries(
        queues
      )
        .filter(([key]) =>
          [
            'reviewBlood',
            'openBlood',
            'offers',
            'collections',
            'batches',
            'medicine'
          ].includes(key)
        )
        .map(
          ([key, [name]]) =>
            `<button class="review-queue-tab" type="button" data-admin-queue="${key}" aria-pressed="${key === queue}">${name}</button>`
        )
        .join('')}</div>
      <label>Queue<select data-queue>${Object.entries(queues)
        .map(
          ([key, [name]]) =>
            `<option value="${key}"${key === queue ? ' selected' : ''}>${name}</option>`
        )
        .join('')}</select></label>
      <p data-feedback role="status" hidden></p><div data-rows></div>
    </section>`;
  const rows = root.querySelector('[data-rows]');
  const feedback = root.querySelector('[data-feedback]');
  const select = root.querySelector('[data-queue]');
  const pickerContainer = root.querySelector('[data-hospital-picker]');
  const picker = pickerContainer
    ? mountLocationPicker(
        pickerContainer,
        root.querySelector('[data-action="create-blood"]')
      )
    : null;
  let disposeEditor = () => {};
  let queueRows = [];
  function message(text, error = false) {
    if (!root.isConnected) {
      return;
    }
    feedback.textContent = text;
    feedback.classList.toggle('donor-error', error);
    feedback.hidden = false;
  }
  function handleError(error) {
    if (!root.isConnected) {
      return;
    }
    if (error.status === 401) {
      onSessionExpired();
    } else {
      message(error.message, true);
    }
  }
  async function loadSummary() {
    const summary = root.querySelector('[data-summary]');
    try {
      const data = await api('/admin/stats');
      if (!root.isConnected) {
        return;
      }
      const bloodCounts = [
        ['Pending blood requests', data.pending_requests],
        ['Pending blood offers', data.pending_donations],
        ['Awaiting collection', data.accepted_donations]
      ];
      const medicineCounts = [
        ['Pending medicine batches', data.pending_medicines],
        ['Pending medicine requests', data.pending_medicine_requests]
      ];
      let counts;
      if (domain === 'all') {
        counts = [...bloodCounts, ...medicineCounts];
      } else if (domain === 'medicine') {
        counts = medicineCounts;
      } else {
        counts = bloodCounts;
      }
      summary.innerHTML = `<div class="stats">${counts.map(([label, value]) => `<div class="stat"><b>${Number(value)}</b><span>${label}</span></div>`).join('')}</div>
        ${domain !== 'medicine' ? `<h2>Blood bank stock</h2><div class="bloodgrid">${data.stock.map((item) => `<div class="bt"><strong>${escapeHtml(item.blood_type)}</strong><small>${Number(item.units_available)} units</small></div>`).join('')}</div>` : ''}`;
    } catch (error) {
      summary.textContent = 'Could not load dashboard totals.';
      handleError(error);
    }
  }
  function renderRow(row) {
    const id = Number(row.id);
    const chip = (label, kind = '') =>
      `<span class="pill ${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
    const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    const header = (kind, title, badge) =>
      `<header class="review-record-heading"><div><span class="review-record-number">${kind} #${id}</span><h3>${escapeHtml(title)}</h3></div>${badge}</header>`;
    const disclosure = (label, body) =>
      `<details class="review-secondary"><summary>${label}</summary>${body}</details>`;
    if (
      ['reviewBlood', 'openBlood', 'fulfilledBlood', 'cancelledBlood'].includes(queue)
    ) {
      const active = ['pending', 'open'].includes(row.status);
      const pin = active
        ? button(
            row.latitude == null ? 'Add hospital pin' : 'Edit hospital pin',
            'location',
            id,
            'ghost'
          )
        : '';
      let actions = '';
      if (queue === 'reviewBlood')
        actions =
          button('Approve blood request', 'approve-blood', id) +
          disclosure(
            'Deny request',
            `<form data-action="deny-blood" data-id="${id}">${note('Reason for denial')}<button class="btn ghost sm">Deny request</button></form>`
          );
      if (queue === 'openBlood')
        actions =
          `<button type="button" class="btn sm ghost" data-action="matches" data-id="${id}" aria-expanded="false" aria-controls="donor-matches-${id}">Find matching donors</button>` +
          disclosure(
            'Record blood handed out from stock',
            `<form data-action="dispense-blood" data-id="${id}"><label>Stock blood type<select name="blood_type_id" required><option value="">Choose stock type</option>${stockTypes}</select></label><label>Units handed out<input name="units" type="number" min="1" max="${Math.min(50, Number(row.units_needed) - Number(row.units_received))}" required></label><button class="btn sm">Record blood handoff</button></form>`
          );
      return `<article class="card review-card">${header('Request', row.hospital_name, chip(row.blood_type, 'blood-type'))}
        <dl class="review-facts">${fact('Progress', `<b>${Number(row.units_received)} / ${Number(row.units_needed)}</b> units received`)}${fact('Urgency', chip(row.urgency === 'sos' ? 'SOS' : row.urgency, row.urgency))}${fact('Requested by', escapeHtml(row.requester?.full_name || 'Account'))}${fact('Hospital city', escapeHtml(row.city || 'Not provided'))}</dl>
        ${!active ? chip(row.status, row.status) : ''}<div class="review-record-actions">${pin}${actions}</div><div id="donor-matches-${id}" data-matches hidden></div></article>`;
    }
    if (
      [
        'offers',
        'collections',
        'invitations',
        'completed',
        'declinedDonations',
        'cancelledDonations'
      ].includes(queue)
    ) {
      const accept = queue === 'offers',
        collecting = queue === 'collections';
      const cancellable = ['offers', 'collections', 'invitations'].includes(queue);
      let primary = '';
      if (accept) {
        primary = button('Accept offer', 'accept-offer', id);
      } else if (collecting) {
        primary = button('Confirm donation received', 'confirm-offer', id);
      }
      const status = collecting ? 'Awaiting collection' : row.status;
      const cancelLabel =
        row.status === 'invited' ? 'Withdraw invitation' : 'Cancel offer';
      return `<article class="card review-card">${header('Donation', row.donor?.full_name || 'Donor', chip(row.donor?.blood_type || 'Blood', 'blood-type'))}
        <dl class="review-facts">${fact('Destination', escapeHtml(row.request?.hospital_name || 'Blood bank'))}${fact('Status', chip(status, row.status))}${fact('Offered', escapeHtml(row.created_at?.slice(0, 10) || '—'))}</dl>
        ${accept || collecting ? `<p class="review-action-hint">${accept ? 'Accept to arrange collection. No blood is counted yet.' : 'Confirm only after the blood has been physically collected.'}</p>` : ''}${row.admin_note ? `<p class="review-action-hint">${escapeHtml(row.admin_note)}</p>` : ''}
        <div class="review-record-actions">${primary}${cancellable ? disclosure(cancelLabel, `<form data-action="cancel-offer" data-id="${id}">${note('Reason for cancellation')}<button class="btn ghost sm">Cancel donation</button></form>`) : ''}</div></article>`;
    }
    if (queue === 'batches')
      return `<article class="card review-card">${header('Batch', row.name, chip('Pending review', 'pending'))}
      <dl class="review-facts">${fact('Donated', `<b>${Number(row.quantity_donated)}</b> units`)}${fact('Expiry', escapeHtml(row.expiry_date))}${fact('Donor', '#' + Number(row.donor_id))}</dl>${row.description ? `<p class="review-action-hint">${escapeHtml(row.description)}</p>` : ''}
      <div class="review-record-actions">${button('Approve medicine batch', 'approve-batch', id)}${disclosure('Reject batch', `<form data-action="reject-batch" data-id="${id}">${note('Reason for rejection')}<button class="btn ghost sm">Reject batch</button></form>`)}</div></article>`;
    return `<article class="card review-card">${header('Medicine request', row.medicine_name, chip(queue === 'medicine' ? 'Awaiting handoff' : 'Dispensed', row.status))}
      <dl class="review-facts">${fact('Quantity', `<b>${Number(row.quantity)}</b> units`)}${fact('Batch', '#' + Number(row.medicine_id))}${fact('Requester', '#' + Number(row.requester_id))}</dl><div class="review-record-actions">${queue === 'medicine' ? button('Record medicine handoff', 'dispense-medicine', id) : ''}</div></article>`;
  }
  async function loadQueue() {
    rows.innerHTML = '<p role="status">Loading queue…</p>';
    const { data, meta } = await api(queues[queue][1] + '&page=' + page + '&limit=10', {
      includeMeta: true
    });
    if (!root.isConnected) {
      return;
    }
    queueRows = data;
    root
      .querySelectorAll('[data-admin-queue]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.adminQueue === queue))
      );
    if (page > meta.pages) {
      page = meta.pages;
      return loadQueue();
    }
    rows.innerHTML = `<div class="review-list">${data.map(renderRow).join('') || '<p class="empty">No items in this queue.</p>'}</div>
      ${
        meta.pages > 1
          ? `<div class="acts donor-pages">
        ${page > 1 ? button('Previous', 'page', page - 1, 'ghost') : ''}
        ${meta.pages > 1 ? `<span>Page ${page} of ${meta.pages}</span>` : ''}
        ${page < meta.pages ? button('Next', 'page', page + 1, 'ghost') : ''}
      </div>`
          : ''
      }`;
  }
  async function run(operation) {
    if (busy) {
      return;
    }
    busy = true;
    select.disabled = true;
    feedback.hidden = true;
    root.querySelectorAll('button').forEach((control) => {
      control.disabled = true;
    });
    try {
      await operation();
    } catch (error) {
      handleError(error);
    } finally {
      busy = false;
      select.disabled = false;
      root.querySelectorAll('button').forEach((control) => {
        control.disabled = false;
      });
    }
  }
  const actions = {
    'approve-blood': (id) => [
      '/blood-requests/' + id + '/review',
      {
        decision: 'approve'
      },
      'Blood request approved.'
    ],
    'deny-blood': (id, data) => [
      '/blood-requests/' + id + '/review',
      {
        decision: 'deny',
        note: data.note
      },
      'Blood request denied.'
    ],
    'accept-offer': (id) => [
      '/blood-donations/' + id + '/accept',
      undefined,
      'Offer accepted. Awaiting collection.'
    ],
    'confirm-offer': (id) => [
      '/blood-donations/' + id + '/confirm',
      undefined,
      'Donation receipt recorded.'
    ],
    'cancel-offer': (id, data) => [
      '/blood-donations/' + id + '/cancel',
      {
        note: data.note
      },
      'Donation cancelled.'
    ],
    'approve-batch': (id) => [
      '/medicines/' + id + '/review',
      {
        decision: 'approve'
      },
      'Medicine batch approved.'
    ],
    'reject-batch': (id, data) => [
      '/medicines/' + id + '/review',
      {
        decision: 'reject',
        note: data.note
      },
      'Medicine batch rejected.'
    ],
    'dispense-medicine': (id) => [
      '/medicine-requests/' + id + '/dispense',
      undefined,
      'Medicine handoff recorded.'
    ],
    'dispense-blood': (id, data) => [
      '/blood-requests/' + id + '/dispense',
      {
        blood_type_id: Number(data.blood_type_id),
        units: Number(data.units)
      },
      'Blood handoff recorded.',
      'POST'
    ],
    invite: (id, data) => [
      '/blood-requests/' + id + '/invitations',
      {
        donor_id: Number(data.donor_id)
      },
      'Invitation sent.',
      'POST'
    ]
  };
  async function mutate(action, id, data) {
    const [path, body, success, method = 'PATCH'] = actions[action](id, data);
    await api(path, {
      method,
      body
    });
    await Promise.all([loadQueue(), loadSummary()]);
    message(success);
  }
  select.addEventListener('change', () => {
    queue = select.value;
    history.replaceState(
      null,
      '',
      '#/' + (domain === 'medicine' ? 'admin-medicines' : 'admin') + '?queue=' + queue
    );
    page = 1;
    run(loadQueue);
  });
  root.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    if (form.dataset.action === 'create-blood') {
      const body = Object.fromEntries(
        [...new FormData(form)].filter(([, value]) => value !== '')
      );
      for (const field of ['blood_type_id', 'units_needed', 'latitude', 'longitude']) {
        if (body[field] !== undefined) {
          body[field] = Number(body[field]);
        }
      }
      run(async () => {
        const request = await api('/calls/blood', {
          method: 'POST',
          body
        });
        form.reset();
        queue = 'openBlood';
        select.value = queue;
        page = 1;
        await Promise.all([loadQueue(), loadSummary()]);
        message(
          'Blood appeal #' +
            request.id +
            ' published. ' +
            request.notified +
            ' donor(s) notified.'
        );
      });
      return;
    }
    run(() =>
      mutate(
        form.dataset.action,
        Number(form.dataset.id),
        Object.fromEntries(new FormData(form))
      )
    );
  });
  function closeMatches(panel) {
    const toggle = panel.closest('article').querySelector('[data-action="matches"]');
    panel.hidden = true;
    panel.replaceChildren();
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  root.addEventListener('click', (event) => {
    const queueButton = event.target.closest('[data-admin-queue]');
    if (queueButton && !busy) {
      select.value = queueButton.dataset.adminQueue;
      select.dispatchEvent(new Event('change'));
      return;
    }
    const control = event.target.closest('button[data-action]');
    if (!control) {
      return;
    }
    const id = Number(control.dataset.id);
    const action = control.dataset.action;
    if (action === 'location') {
      if (busy) {
        return;
      }
      const row = queueRows.find((row) => Number(row.id) === id);
      if (!row) {
        return;
      }
      disposeEditor();
      disposeEditor = openLocationEditor(
        row,
        async () => {
          if (!root.isConnected) {
            return;
          }
          message('Hospital location saved.');
          await loadQueue();
        },
        () =>
          handleError({
            status: 401
          })
      );
    } else if (action === 'page') {
      run(async () => {
        page = id;
        await loadQueue();
      });
    } else if (action === 'close-matches') {
      if (!busy) {
        closeMatches(control.closest('[data-matches]'));
      }
    } else if (action === 'matches') {
      if (busy) {
        return;
      }
      const panel = control.closest('article').querySelector('[data-matches]');
      if (!panel.hidden) {
        closeMatches(panel);
        return;
      }
      run(async () => {
        const matches = await api('/blood-requests/' + id + '/matches');
        if (!root.isConnected || !control.isConnected) {
          return;
        }
        const cancelButton = button('Cancel', 'close-matches', id, 'ghost');
        panel.innerHTML = matches.length
          ? `<form data-action="invite" data-id="${id}"><label>Matched donor<select name="donor_id" required>${matches.map((match) => `<option value="${Number(match.donor_id)}">${escapeHtml(match.full_name)} · ${escapeHtml(match.blood_type)}</option>`).join('')}</select></label>
            <div class="acts"><button class="btn sm" type="submit">Invite donor</button>${cancelButton}</div></form>`
          : '<p>No eligible matching donors.</p>' + cancelButton;
        panel.hidden = false;
        control.setAttribute('aria-expanded', 'true');
      });
    } else {
      run(() => mutate(action, id));
    }
  });
  run(() => Promise.all([loadQueue(), loadSummary()]));
  return () => {
    picker?.dispose();
    disposeEditor();
  };
}
