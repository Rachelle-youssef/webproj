import { api } from './api.js';

export function mountMedicineDonations(root, escapeHtml, onSessionExpired) {
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Donor dashboard</div>
    <h1>Medicine donations</h1><p class="mute">Submit a batch for admin review and track its status here.</p></header>
    <section><h2>Open medicine appeals</h2><div data-appeals><p role="status">Loading appeals…</p></div></section>
    <section><h2>Donate medicine</h2>
      <form class="card" data-medicine-form>
        <input name="call_id" type="hidden">
        <div class="appeal-selection" data-appeal-selection hidden><span data-appeal-label></span>
          <button class="btn ghost sm" type="button" data-clear-appeal>Remove appeal link</button></div>
        <label>Medicine name<input name="name" required minlength="2" maxlength="120"></label>
        <label>Category<select name="category_id" required disabled><option value="">Loading categories…</option></select></label>
        <label>Quantity<input name="quantity_donated" type="number" min="1" max="10000" step="1" required></label>
        <label>Expiry date<input name="expiry_date" type="date" required></label>
        <label>Description (optional)<textarea name="description" maxlength="500"></textarea></label>
        <label>Photo URL (optional)<input name="photo_url" type="url" maxlength="500"></label>
        <button class="btn" type="submit" disabled>Submit donation</button>
        <p data-feedback role="status" hidden></p>
      </form>
    </section>
    <section><h2>My medicine donations</h2>
      <div data-history><p role="status">Loading donations…</p></div></section>`;
  const form = root.querySelector('[data-medicine-form]');
  const select = form.elements.category_id;
  const submit = form.querySelector('button[type="submit"]');
  const feedback = root.querySelector('[data-feedback]');
  const history = root.querySelector('[data-history]');
  const appeals = root.querySelector('[data-appeals]');
  const appealSelection = root.querySelector('[data-appeal-selection]');
  let page = 1;
  let appealPage = 1;
  let appealRows = [];
  let loadingAppeals = false;
  let loading = false;
  let submitting = false;
  function updateSubmitButton() {
    submit.disabled = select.disabled || submitting || loading;
  }
  function showFeedback(text, isError = false) {
    feedback.textContent = text;
    feedback.classList.toggle('donor-error', isError);
    feedback.hidden = false;
  }
  async function loadAppeals() {
    if (loadingAppeals) {
      return;
    }
    loadingAppeals = true;
    try {
      const { data, meta } = await api(
        '/calls?status=open&sort=-created_at&limit=10&page=' + appealPage,
        {
          includeMeta: true
        }
      );
      if (!root.isConnected) {
        return;
      }
      appealRows = data;
      appeals.innerHTML =
        (data
          .map(
            (
              row
            ) => `<article class="item med"><div><b>${escapeHtml(row.medicine_name)}</b>
        <p>Appeal #${Number(row.id)} · ${Number(row.quantity)} units needed</p>${row.note ? `<p class="mute">${escapeHtml(row.note)}</p>` : ''}</div>
        <button class="btn med sm" type="button" data-respond-appeal="${Number(row.id)}">Respond with a donation</button></article>`
          )
          .join('') || '<p class="empty">No open medicine appeals on this page.</p>') +
        (meta.pages > 1
          ? `<div class="acts donor-pages">${meta.page > 1 ? `<button class="btn ghost sm" data-appeal-page="${meta.page - 1}">Previous</button>` : ''}
          <span>Page ${Number(meta.page)} of ${Number(meta.pages)}</span>${meta.page < meta.pages ? `<button class="btn ghost sm" data-appeal-page="${meta.page + 1}">Next</button>` : ''}</div>`
          : '');
    } catch (err) {
      if (!root.isConnected) {
        return;
      }
      if (err.status === 401) {
        onSessionExpired();
      } else {
        appeals.innerHTML = `<p class="empty" role="alert">${escapeHtml(err.message)}</p>`;
      }
    } finally {
      loadingAppeals = false;
    }
  }
  async function loadCategories() {
    try {
      const categories = await api('/medicines/categories');
      if (!root.isConnected) {
        return;
      }
      select.innerHTML =
        '<option value="">Choose a category</option>' +
        categories
          .map(
            (category) =>
              `<option value="${Number(category.id)}">${escapeHtml(category.name)}</option>`
          )
          .join('');
      select.disabled = false;
      updateSubmitButton();
    } catch (err) {
      if (!root.isConnected) {
        return;
      }
      if (err.status === 401) {
        onSessionExpired();
      } else {
        showFeedback(err.message, true);
      }
    }
  }
  async function loadHistory() {
    if (loading) {
      return;
    }
    loading = true;
    updateSubmitButton();
    try {
      const { data, meta } = await api(
        '/medicines?page=' + page + '&limit=10&sort=-created_at',
        {
          includeMeta: true
        }
      );
      if (!root.isConnected) {
        return;
      }
      const entries = data
        .map(
          (row) => `<article class="item med">
        <div><b>${escapeHtml(row.name)}</b>
          <p>Batch #${Number(row.id)} · ${Number(row.quantity_donated)} donated · ${Number(row.quantity_available)} available</p>
          <p class="mute">Expires ${escapeHtml(row.expiry_date)}</p>
          ${row.admin_note ? `<p class="mute">Admin note: ${escapeHtml(row.admin_note)}</p>` : ''}</div>
        <span class="pill ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
      </article>`
        )
        .join('');
      history.innerHTML =
        (entries || '<p class="empty">No medicine donations yet.</p>') +
        (meta.pages > 1
          ? `<div class="acts donor-pages">
            ${meta.page > 1 ? `<button class="btn ghost sm" data-page="${meta.page - 1}">Previous</button>` : ''}
            <span>Page ${meta.page} of ${meta.pages}</span>
            ${meta.page < meta.pages ? `<button class="btn ghost sm" data-page="${meta.page + 1}">Next</button>` : ''}
          </div>`
          : '');
    } catch (err) {
      if (!root.isConnected) {
        return;
      }
      if (err.status === 401) {
        onSessionExpired();
      } else {
        history.innerHTML = `<p class="empty" role="alert">${escapeHtml(err.message)}</p>`;
      }
    } finally {
      loading = false;
      updateSubmitButton();
    }
  }
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || loading || submitting) {
      return;
    }
    page = Number(button.dataset.page);
    loadHistory();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || submitting || loadingAppeals) {
      return;
    }
    if (button.dataset.respondAppeal) {
      const appeal = appealRows.find(
        (row) => Number(row.id) === Number(button.dataset.respondAppeal)
      );
      if (!appeal) {
        return;
      }
      form.elements.call_id.value = appeal.id;
      form.elements.name.value = appeal.medicine_name;
      root.querySelector('[data-appeal-label]').textContent =
        'Responding to appeal #' + appeal.id + ' — ' + appeal.medicine_name;
      appealSelection.hidden = false;
      form.scrollIntoView({
        block: 'start',
        behavior: 'smooth'
      });
      form.elements.quantity_donated.focus({
        preventScroll: true
      });
    } else if (button.hasAttribute('data-clear-appeal')) {
      form.elements.call_id.value = '';
      appealSelection.hidden = true;
    } else if (button.dataset.appealPage) {
      appealPage = Number(button.dataset.appealPage);
      loadAppeals();
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || loading) {
      return;
    }
    const fields = Object.fromEntries(
      [...new FormData(form)].filter(([, value]) => value !== '')
    );
    fields.category_id = Number(fields.category_id);
    fields.quantity_donated = Number(fields.quantity_donated);
    if (fields.call_id !== undefined) {
      fields.call_id = Number(fields.call_id);
    }
    submitting = true;
    updateSubmitButton();
    feedback.hidden = true;
    try {
      const batch = await api('/medicines', {
        method: 'POST',
        body: fields
      });
      if (!root.isConnected) {
        return;
      }
      form.reset();
      appealSelection.hidden = true;
      showFeedback('Batch #' + batch.id + ' was submitted for admin review.');
      page = 1;
      await loadHistory();
    } catch (err) {
      if (!root.isConnected) {
        return;
      }
      if (err.status === 401) {
        onSessionExpired();
      } else {
        showFeedback(err.message, true);
      }
    } finally {
      submitting = false;
      updateSubmitButton();
    }
  });
  loadCategories();
  loadHistory();
  loadAppeals();
}
