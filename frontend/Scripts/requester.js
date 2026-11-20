import { api } from './api.js';
import { mountLocationPicker, openLocationEditor } from './locationPicker.js';

export function mountRequester(
  root,
  user,
  types,
  escapeHtml,
  onSessionExpired,
  section = 'all'
) {
  const options = types
    .map(
      (type) => `<option value="${Number(type.id)}">${escapeHtml(type.label)}</option>`
    )
    .join('');
  const badge = (status, label = status) =>
    `<span class="pill ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">${user.role === 'hospital' ? 'Hospital' : 'Patient'} dashboard</div>
    <h1>${section === 'medicine' ? 'Medicines' : 'Blood requests'}</h1>
    <p class="mute">${section === 'medicine' ? 'Find available medicine and follow your requests through to handoff.' : 'Submit a hospital request and follow each unit received.'}</p></header>
    ${
      section !== 'medicine'
        ? `<section><h2>Request blood</h2><form class="card" data-submit="blood">
      <label>Blood type<select name="blood_type_id" required><option value="">Choose a blood type</option>${options}</select></label>
      <label>Units needed<input name="units_needed" type="number" min="1" max="50" step="1" required></label>
      <label>Hospital name<input name="hospital_name" minlength="2" maxlength="120" value="${user.role === 'hospital' ? escapeHtml(user.full_name) : ''}" required></label>
      <label>Hospital city (optional)<input name="city" minlength="2" maxlength="60" value="${user.role === 'hospital' ? escapeHtml(user.city) : ''}" placeholder="City of the treating hospital"></label>
      <label>Urgency<select name="urgency"><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="sos">SOS</option></select></label>
      ${
        user.role === 'hospital' && user.latitude != null && user.longitude != null
          ? '<p class="saved-hospital-location">Using your saved hospital location. <a href="#/account">Manage hospital details</a></p><details class="request-location-choice"><summary>Use a different hospital location for this request</summary><div data-hospital-picker></div></details>'
          : '<div data-hospital-picker></div>'
      }
      <button class="btn" type="submit"${options ? '' : ' disabled'}>Submit blood request</button>
      ${options ? '' : '<p class="mute">Blood types could not be loaded. Reload the page to retry.</p>'}
    </form><p data-feedback="blood" role="status" hidden></p></section>
    <section><h2>My blood requests</h2><div data-list="blood"></div></section>`
        : ''
    }
    ${
      section !== 'blood'
        ? `<section><h2>Available medicine</h2><p class="mute">Requests are reviewed before medicine is handed out.</p>
      <p data-feedback="catalog" role="status" hidden></p><div data-list="catalog"></div></section>
    <section><h2>My medicine requests</h2><div data-list="medicine"></div></section>`
        : ''
    }`;
  const pages = {
    blood: 1,
    catalog: 1,
    medicine: 1
  };
  const paths = {
    blood: '/blood-requests?sort=-created_at',
    catalog: '/medicines/available?sort=expiry_date',
    medicine: '/medicine-requests?sort=-created_at'
  };
  const empty = {
    blood: 'No blood requests on this page.',
    catalog: 'No available medicine on this page.',
    medicine: 'No medicine requests on this page.'
  };
  let busy = false;
  let disposeEditor = () => {};
  const pickerContainer = root.querySelector('[data-hospital-picker]');
  const picker = pickerContainer
    ? mountLocationPicker(pickerContainer, root.querySelector('[data-submit="blood"]'), {
        initialPoint:
          user.role === 'hospital' && user.latitude != null && user.longitude != null
            ? [user.latitude, user.longitude]
            : null,
        showCoordinates: true
      })
    : null;
  let bloodRows = [];
  const renderRow = {
    blood: (row) => `<article class="item">
      <div><b>${escapeHtml(row.hospital_name)}</b>${row.city ? ` <small>${escapeHtml(row.city)}</small>` : ''}
        <p>Request #${Number(row.id)} · ${escapeHtml(row.blood_type)} · ${Number(row.units_received)} of ${Number(row.units_needed)} units received</p>
        ${row.admin_note ? `<p class="mute">${escapeHtml(row.admin_note)}</p>` : ''}</div>
      <div class="acts">${badge(row.urgency)}${badge(row.status)}
        ${
          ['pending', 'open'].includes(row.status)
            ? `<button class="btn ghost sm" type="button" data-set-location="${Number(row.id)}">Edit hospital pin</button>`
            : ''
        }
        ${
          ['pending', 'open'].includes(row.status)
            ? `<button class="btn ghost sm" type="button" data-show-cancel>Cancel request</button>
        <span data-cancel-options hidden>
          <button class="btn sm" type="button" data-cancel="${Number(row.id)}">Confirm cancellation</button>
          <button class="btn ghost sm" type="button" data-keep-request>Keep request</button>
        </span>`
            : ''
        }
      </div></article>`,
    catalog: (row) => `<article class="item med"><div><b>${escapeHtml(row.name)}</b>
      <p>Batch #${Number(row.id)} · ${Number(row.quantity_available)} available · Expires ${escapeHtml(row.expiry_date)}</p>
      ${row.description ? `<p class="mute">${escapeHtml(row.description)}</p>` : ''}</div>
      <form data-submit="medicine" data-id="${Number(row.id)}">
        <label>Quantity for batch ${Number(row.id)}<input name="quantity" type="number" min="1" max="${Number(row.quantity_available)}" step="1" required></label>
        <button class="btn med sm" type="submit">Request medicine</button>
      </form></article>`,
    medicine: (
      row
    ) => `<article class="item med"><div><b>${escapeHtml(row.medicine_name)}</b>
      <p>Request #${Number(row.id)} · Batch #${Number(row.medicine_id)} · ${Number(row.quantity)} requested</p>
      ${row.admin_note ? `<p class="mute">${escapeHtml(row.admin_note)}</p>` : ''}</div>
      ${badge(row.status, row.status === 'approved' ? 'Dispensed' : row.status)}</article>`
  };
  function showFeedback(section, message, error = false) {
    const output = root.querySelector(`[data-feedback="${section}"]`);
    output.textContent = message;
    output.hidden = false;
    output.classList.toggle('donor-error', error);
  }
  async function load(section) {
    const list = root.querySelector(`[data-list="${section}"]`);
    list.innerHTML = '<p role="status">Loading…</p>';
    try {
      const { data, meta } = await api(
        paths[section] + '&limit=10&page=' + pages[section],
        {
          includeMeta: true
        }
      );
      if (!root.isConnected) {
        return;
      }
      if (section === 'blood') {
        bloodRows = data;
      }
      if (data.length === 0 && pages[section] > meta.pages) {
        pages[section] = meta.pages;
        return load(section);
      }
      const controls =
        meta.pages > 1
          ? `<div class="acts donor-pages">
        ${meta.page > 1 ? `<button class="btn ghost sm" data-section="${section}" data-page="${meta.page - 1}">Previous</button>` : ''}
        ${meta.pages > 1 ? `<span>Page ${meta.page} of ${meta.pages}</span>` : ''}
        ${meta.page < meta.pages ? `<button class="btn ghost sm" data-section="${section}" data-page="${meta.page + 1}">Next</button>` : ''}
      </div>`
          : '';
      list.innerHTML =
        (data.map(renderRow[section]).join('') ||
          `<p class="empty">${empty[section]}</p>`) + controls;
    } catch (err) {
      if (!root.isConnected) {
        return;
      }
      if (err.status === 401) {
        onSessionExpired();
      } else {
        list.innerHTML = `<p class="empty" role="alert">${escapeHtml(err.message)}</p>
        <button class="btn ghost sm" data-section="${section}" data-page="${pages[section]}">Retry</button>`;
      }
    }
  }
  async function change(button, section, operation) {
    if (busy || !button || button.disabled) {
      return;
    }
    busy = true;
    button.disabled = true;
    try {
      await operation();
    } catch (err) {
      if (!root.isConnected) {
        return;
      }
      if (err.status === 401) {
        onSessionExpired();
      } else {
        showFeedback(section, err.message, true);
      }
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  root.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    const data = Object.fromEntries(
      [...new FormData(form)].filter(([, value]) => value !== '')
    );
    const button = form.querySelector('button[type="submit"]');
    if (form.dataset.submit === 'blood') {
      for (const field of ['blood_type_id', 'units_needed', 'latitude', 'longitude']) {
        if (data[field] !== undefined) {
          data[field] = Number(data[field]);
        }
      }
      change(button, 'blood', async () => {
        const request = await api('/blood-requests', {
          method: 'POST',
          body: data
        });
        form.reset();
        showFeedback('blood', 'Blood request #' + request.id + ' submitted for review.');
        pages.blood = 1;
        await load('blood');
      });
    } else if (form.dataset.submit === 'medicine') {
      change(button, 'catalog', async () => {
        const request = await api('/medicine-requests', {
          method: 'POST',
          body: {
            medicine_id: Number(form.dataset.id),
            quantity: Number(data.quantity)
          }
        });
        form.reset();
        showFeedback('catalog', 'Medicine request #' + request.id + ' submitted.');
        pages.medicine = 1;
        await load('medicine');
      });
    }
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || busy) {
      return;
    }
    if (button.dataset.section) {
      pages[button.dataset.section] = Number(button.dataset.page);
      load(button.dataset.section);
    } else if (button.dataset.setLocation) {
      const row = bloodRows.find(
        (row) => Number(row.id) === Number(button.dataset.setLocation)
      );
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
          showFeedback(
            'blood',
            'Hospital location saved. Approved open requests appear on the Lebanon map.'
          );
          await load('blood');
        },
        onSessionExpired
      );
    } else if (
      button.hasAttribute('data-show-cancel') ||
      button.hasAttribute('data-keep-request')
    ) {
      const confirming = button.hasAttribute('data-show-cancel');
      const article = button.closest('article');
      article.querySelector('[data-show-cancel]').hidden = confirming;
      article.querySelector('[data-cancel-options]').hidden = !confirming;
      article.querySelector(confirming ? '[data-cancel]' : '[data-show-cancel]').focus();
    } else if (button.dataset.cancel) {
      change(button, 'blood', async () => {
        await api('/blood-requests/' + Number(button.dataset.cancel) + '/cancel', {
          method: 'PATCH'
        });
        showFeedback('blood', 'Blood request cancelled.');
        await load('blood');
      });
    }
  });
  let sections;
  if (section === 'all') {
    sections = Object.keys(paths);
  } else if (section === 'blood') {
    sections = ['blood'];
  } else {
    sections = ['catalog', 'medicine'];
  }
  sections.forEach(load);
  return () => {
    picker?.dispose();
    disposeEditor();
  };
}
