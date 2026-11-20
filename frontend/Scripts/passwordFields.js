// One password field and eye control, reused by all account forms.
function eyeIcon(visible) {
  const path = visible
    ? '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-3 3.6M6.5 6.5A20 20 0 0 0 2 12s4 7 10 7a11 11 0 0 0 5.5-1.5"/>'
    : '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

export function passwordField(label, name, attributes) {
  // Labels, names and attributes are static form definitions, never API content.
  const id = 'field-' + name.replaceAll('_', '-');
  const shortLabel = label.replace(/\s*\([^)]*\)/g, '').toLowerCase();
  return `<div class="password-field">
    <label for="${id}">${label}</label>
    <div class="password-input">
      <input id="${id}" name="${name}" type="password" ${attributes}>
      <button class="password-eye" type="button" data-password-toggle data-password-label="${shortLabel}" aria-controls="${id}" aria-label="Show ${shortLabel}" title="Show ${shortLabel}" aria-pressed="false">${eyeIcon(false)}</button>
    </div>
  </div>`;
}

function setVisibility(button, visible) {
  const input = button.closest('.password-input').querySelector('input');
  input.type = visible ? 'text' : 'password';
  const label = `${visible ? 'Hide' : 'Show'} ${button.dataset.passwordLabel}`;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', String(visible));
  button.innerHTML = eyeIcon(visible);
}

export function handlePasswordToggle(event) {
  const button = event.target.closest('[data-password-toggle]');
  if (!button) {
    return false;
  }
  const input = button.closest('.password-input').querySelector('input');
  if (!button.disabled && !input.disabled) {
    setVisibility(button, input.type === 'password');
  }
  return true;
}

export function resetPasswordVisibility(form) {
  form
    .querySelectorAll('[data-password-toggle]')
    .forEach((button) => setVisibility(button, false));
}
