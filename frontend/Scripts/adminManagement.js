import { api } from './api.js';

export function mountAdminManagement(
  root,
  user,
  types,
  escapeHtml,
  onSessionExpired,
  section
) {
  const options = (values, first) =>
    `<option value="">${first}</option>` +
    values
      .map(
        (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
      .join('');
  const bloodOptions =
    `<option value="">All blood types</option>` +
    types
      .map(
        (type) => `<option value="${Number(type.id)}">${escapeHtml(type.label)}</option>`
      )
      .join('');
  const configurations = {
    users: {
      title: 'Accounts',
      description: 'Find people and manage their access to LifeLink.',
      path: '/users',
      filters: `<label>Name or email<input name="q" maxlength="100" type="search"></label>
        <label>Role<select name="role">${options(['donor', 'recipient', 'hospital', 'admin'], 'All roles')}</select></label>
        <label>Account status<select name="is_active"><option value="">All accounts</option><option value="true">Active</option><option value="false">Inactive</option></select></label>`
    },
    stock: {
      title: 'Blood stock',
      description: 'Record stock corrections and trace every unit added or handed out.',
      path: '/blood-stock/movements',
      filters: `<label>Blood type<select name="blood_type_id">${bloodOptions}</select></label>
        <label>Movement<select name="reason">${options(['donation', 'dispensed', 'adjustment'], 'All movements')}</select></label>`
    },
    calls: {
      title: 'Medicine appeals',
      description:
        'Ask the donor community for medicine and close appeals when they are resolved.',
      path: '/calls',
      filters: `<label>Appeal status<select name="status"><option value="open">Open</option><option value="closed">Closed</option></select></label>
        <label>Medicine name<input name="medicine_name" maxlength="120" type="search"></label>`
    },
    inventory: {
      title: 'Medicine inventory',
      description: 'Check every donated batch, its available quantity and its QR label.',
      path: '/medicines',
      filters: `<label>Batch status<select name="status">${options(['pending', 'approved', 'rejected', 'expired', 'dispensed'], 'All statuses')}</select></label>`
    },
    audit: {
      title: 'Audit history',
      description: 'Trace account, donation, request and stock actions.',
      path: '/admin/audit-logs',
      filters: `<label>Action<input name="action" maxlength="60" placeholder="e.g. blood_donation.confirmed"></label>
        <label>Entity<input name="entity" maxlength="40" placeholder="e.g. blood_donation"></label>
        <label>Account ID<input name="user_id" type="number" min="1" max="4294967295" step="1"></label>`
    }
  };
  const config = configurations[section];
  const stockForm = `<section><details class="admin-create"><summary>Record a stock adjustment</summary>
    <form data-admin-submit="stock" class="card">
      <label>Blood type<select name="blood_type_id" required>${bloodOptions.replace('All blood types', 'Choose blood type')}</select></label>
      <label>Change in units<input name="change_units" type="number" min="-500" max="500" step="1" required></label>
      <p class="mute">Use a positive number to add units or a negative number to remove units. Every adjustment needs a reason.</p>
      <label>Reason<textarea name="note" minlength="3" maxlength="255" required></textarea></label>
      <button class="btn" type="submit">Record adjustment</button>
    </form></details></section>`;
  const callForm = `<section><details class="admin-create"><summary>Create a medicine appeal</summary>
    <form data-admin-submit="call" class="card">
      <label>Medicine name<input name="medicine_name" minlength="2" maxlength="120" required></label>
      <label>Quantity needed<input name="quantity" type="number" min="1" max="100000" step="1" required></label>
      <label>Note (optional)<textarea name="note" maxlength="300"></textarea></label>
      <button class="btn" type="submit">Publish appeal</button>
    </form></details></section>`;
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Administration</div><h1>${config.title}</h1><p class="mute">${config.description}</p></header>
    <p data-admin-message role="status" hidden></p>
    ${section === 'stock' ? '<section aria-label="Current blood stock"><div data-stock-levels role="status">Loading stock…</div></section>' + stockForm : ''}
    ${section === 'calls' ? callForm : ''}
    ${section === 'inventory' ? '<p><a class="btn ghost" href="#/admin-scanner">Scan a medicine QR label ↗</a></p>' : ''}
    <section><h2>${section === 'stock' ? 'Movement history' : config.title}</h2>
      <form data-admin-filter class="admin-filters">${config.filters}
        <label>Order<select name="sort"><option value="-created_at">Newest first</option><option value="created_at">Oldest first</option></select></label>
        <button class="btn ghost sm" type="submit">Apply filters</button>
        <button class="btn ghost sm" type="button" data-admin-reset>Clear filters</button>
      </form><div data-admin-rows aria-live="polite"></div></section>`;
  const filterForm = root.querySelector('[data-admin-filter]');
  const rows = root.querySelector('[data-admin-rows]');
  const feedback = root.querySelector('[data-admin-message]');
  let page = 1;
  let filters =
    section === 'calls'
      ? {
          status: 'open',
          sort: '-created_at'
        }
      : {
          sort: '-created_at'
        };
  let busy = false;
  function message(text, error = false) {
    if (!root.isConnected) {
      return;
    }
    feedback.textContent = text;
    feedback.classList.toggle('donor-error', error);
    feedback.hidden = false;
  }
  const date = (value) =>
    escapeHtml(
      value
        ? String(value)
            .replace('T', ' ')
            .replace(/\.\d+Z$/, ' UTC')
        : '—'
    );
  const badge = (status) =>
    `<span class="pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  const confirm = (
    label,
    description,
    action,
    id,
    value = ''
  ) => `<details class="admin-confirm"><summary>${label}</summary>
    <p>${description}</p><button class="btn ghost sm" type="button" data-admin-action="${action}" data-id="${Number(id)}" data-value="${escapeHtml(value)}">Confirm ${label.toLowerCase()}</button></details>`;
  function renderRow(row) {
    const id = Number(row.id);
    if (section === 'users') {
      const active = Boolean(row.is_active);
      const action = active ? 'Deactivate' : 'Reactivate';
      return `<article class="item admin-record"><div><h3>${escapeHtml(row.full_name)}</h3>
        <p>Account #${id} · ${escapeHtml(row.role)} · ${escapeHtml(row.email)}</p>
        <p class="mute">${escapeHtml(row.city || 'City not provided')}${row.donor ? ' · ' + escapeHtml(row.donor.blood_type) : ''}</p></div>
        <div class="acts">${badge(active ? 'active' : 'inactive')}${id === Number(user.id) ? '<small>Current account</small>' : confirm(action, active ? 'This account will lose access to LifeLink until reactivated.' : 'This account will be able to sign in again.', 'status', id, !active)}</div></article>`;
    }
    if (section === 'stock') {
      const change = Number(row.change_units);
      return `<article class="item admin-record"><div><h3>${escapeHtml(row.blood_type)} · ${change > 0 ? '+' : ''}${change} units</h3>
        <p>${escapeHtml(row.reason)} · Movement #${id} · ${date(row.created_at)}</p>
        <p class="mute">${escapeHtml(row.note || 'No note')}${row.created_by ? ' · ' + escapeHtml(row.created_by) : ''}</p>
        ${row.donation_id ? `<small>Donation #${Number(row.donation_id)}</small>` : ''}${row.request_id ? `<small>Request #${Number(row.request_id)}</small>` : ''}</div></article>`;
    }
    if (section === 'calls') {
      return `<article class="item med admin-record"><div><h3>${escapeHtml(row.medicine_name)}</h3>
      <p>Appeal #${id} · ${Number(row.quantity)} units needed</p><p class="mute">${escapeHtml(row.note || '')}</p>
      <small>Created ${date(row.created_at)}</small></div><div class="acts">${badge(row.status)}
      ${row.status === 'open' ? confirm('Close appeal', 'Donors will no longer be able to link new medicine donations to this appeal.', 'close', id) : ''}</div></article>`;
    }
    if (section === 'inventory') {
      return `<article class="item med admin-record"><div><h3>${escapeHtml(row.name)}</h3>
      <p>Batch #${id} · Donor #${Number(row.donor_id)} · ${Number(row.quantity_available)} available of ${Number(row.quantity_donated)} donated</p>
      <p class="mute">Expires ${escapeHtml(row.expiry_date)}${row.call_id ? ' · Appeal #' + Number(row.call_id) : ''}</p>
      ${row.description ? `<p>${escapeHtml(row.description)}</p>` : ''}${row.admin_note ? `<p class="mute">Admin note — ${escapeHtml(row.admin_note)}</p>` : ''}</div>
      <div class="acts">${badge(row.status)}${row.status === 'approved' ? `<a class="btn ghost sm" href="/api/v1/medicines/${id}/qr" target="_blank" rel="noopener">View QR label</a>` : ''}
      ${row.status === 'pending' ? '<a class="btn ghost sm" href="#/admin-medicines">Open medicine review</a>' : ''}</div></article>`;
    }
    return `<article class="item admin-record"><div><h3>${escapeHtml(row.action)}</h3><p>Event #${id} · ${date(row.created_at)}</p>
      <p class="mute">${row.user_id ? 'Account #' + Number(row.user_id) : 'Unauthenticated'} · ${escapeHtml(row.entity || 'No entity')}${row.entity_id ? ' #' + Number(row.entity_id) : ''}</p></div></article>`;
  }
  async function loadList() {
    rows.innerHTML = '<p role="status">Loading…</p>';
    const query = new URLSearchParams({
      ...filters,
      page,
      limit: 10
    });
    const { data, meta } = await api(config.path + '?' + query, {
      includeMeta: true
    }).catch((error) => {
      if (root.isConnected) {
        rows.innerHTML = `<p class="empty" role="alert">${escapeHtml(error.message)}</p>`;
      }
      throw error;
    });
    if (!root.isConnected) {
      return;
    }
    if (page > meta.pages) {
      page = meta.pages;
      return loadList();
    }
    rows.innerHTML =
      `<p class="mute">${Number(meta.total)} result(s)</p>` +
      (data.map(renderRow).join('') ||
        '<p class="empty">No records match these filters.</p>') +
      (meta.pages > 1
        ? `<div class="acts donor-pages">${meta.page > 1 ? `<button class="btn ghost sm" data-admin-page="${meta.page - 1}">Previous</button>` : ''}
        <span>Page ${Number(meta.page)} of ${Number(meta.pages)}</span>${meta.page < meta.pages ? `<button class="btn ghost sm" data-admin-page="${meta.page + 1}">Next</button>` : ''}</div>`
        : '');
  }
  async function loadStock() {
    const data = await api('/blood-stock').catch((error) => {
      if (root.isConnected) {
        root.querySelector('[data-stock-levels]').innerHTML =
          `<p class="empty" role="alert">${escapeHtml(error.message)}</p>`;
      }
      throw error;
    });
    if (!root.isConnected) {
      return;
    }
    root.querySelector('[data-stock-levels]').innerHTML =
      `<div class="bloodgrid">${data.map((item) => `<div class="bt"><strong>${escapeHtml(item.blood_type)}</strong><small>${Number(item.units_available)} units</small></div>`).join('')}</div>`;
  }
  async function run(operation) {
    if (busy) {
      return;
    }
    busy = true;
    feedback.hidden = true;
    root.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    try {
      await operation();
    } catch (error) {
      if (!root.isConnected) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
      } else {
        message(error.message, true);
      }
    } finally {
      busy = false;
      root.querySelectorAll('button').forEach((button) => {
        button.disabled = false;
      });
    }
  }
  async function reloadAfterChange(success, operation) {
    message(success);
    try {
      await operation();
    } catch (error) {
      if (!root.isConnected) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
      } else {
        message(
          success +
            ' The updated records could not be loaded. Use the top refresh icon to try again.',
          true
        );
      }
    }
  }
  root.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    if (busy) {
      return;
    }
    const body = Object.fromEntries(
      [...new FormData(form)].filter(([, value]) => String(value).trim() !== '')
    );
    if (form === filterForm) {
      filters = body;
      page = 1;
      run(loadList);
      return;
    }
    run(async () => {
      if (form.dataset.adminSubmit === 'stock') {
        body.blood_type_id = Number(body.blood_type_id);
        body.change_units = Number(body.change_units);
        await api('/blood-stock/adjustments', {
          method: 'POST',
          body
        });
        form.reset();
        await reloadAfterChange('Stock adjustment recorded.', () =>
          Promise.all([loadList(), loadStock()])
        );
      } else {
        body.quantity = Number(body.quantity);
        const appeal = await api('/calls/medicine', {
          method: 'POST',
          body
        });
        form.reset();
        filterForm.reset();
        filters = {
          status: 'open',
          sort: '-created_at'
        };
        page = 1;
        await reloadAfterChange(
          'Medicine appeal #' + appeal.call.id + ' published.',
          loadList
        );
      }
    });
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || busy) {
      return;
    }
    if (button.hasAttribute('data-admin-reset')) {
      filterForm.reset();
      filters =
        section === 'calls'
          ? {
              status: 'open',
              sort: '-created_at'
            }
          : {
              sort: '-created_at'
            };
      page = 1;
      run(loadList);
    } else if (button.dataset.adminPage) {
      page = Number(button.dataset.adminPage);
      run(loadList);
    } else if (button.dataset.adminAction) {
      run(async () => {
        const id = Number(button.dataset.id);
        if (button.dataset.adminAction === 'status') {
          await api('/users/' + id + '/status', {
            method: 'PATCH',
            body: {
              is_active: button.dataset.value === 'true'
            }
          });
          await reloadAfterChange('Account status updated.', loadList);
        } else {
          await api('/calls/' + id + '/close', {
            method: 'PATCH'
          });
          await reloadAfterChange('Medicine appeal closed.', loadList);
        }
      });
    }
  });
  run(() => (section === 'stock' ? Promise.all([loadList(), loadStock()]) : loadList()));
}
