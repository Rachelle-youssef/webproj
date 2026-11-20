const friendlyFields = {
  full_name: 'Name',
  blood_type_id: 'Blood type',
  units_needed: 'Units needed',
  current_password: 'Current password',
  new_password: 'New password',
  latitude: 'Hospital location',
  longitude: 'Hospital location'
};
export function installFeedback() {
  const toast = document.querySelector('#toast');
  let timer;
  function clear() {
    clearTimeout(timer);
    toast.className = 'feedback-toast';
  }
  document.addEventListener('lifelink:navigation', clear);
  document.addEventListener('lifelink:api-success', clear);
  function show(message) {
    if (!message) return;
    clearTimeout(timer);
    toast.replaceChildren();
    const content = document.createElement('span');
    content.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss message');
    close.addEventListener('click', clear);
    toast.append(content, close);
    toast.className = 'show feedback-toast bad';
    toast.setAttribute('role', 'alert');
    timer = setTimeout(clear, 10000);
  }
  document.addEventListener('lifelink:api-error', (event) => {
    const error = event.detail;
    if (error.status === 401) return;
    const field = error.details?.[0];
    let message = error.message;
    if (field) {
      const label = friendlyFields[field.field] || field.field.replaceAll('_', ' ');
      message = `${label}: ${field.message}`;
    }
    show(message);
  });
  const seen = new WeakMap();
  const errorSelector = '[role="alert"], .donor-error, [data-error]';

  // Existing forms keep their inline errors. Watch for changes and repeat the
  // message in the visible toast so the user does not have to scroll upward.
  function findChangedMessages(records) {
    const candidates = new Set();
    for (const record of records) {
      const element =
        record.target.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target.parentElement;
      if (!element || toast.contains(element)) continue;
      if (element.matches(errorSelector)) {
        candidates.add(element);
      }
      for (const message of element.querySelectorAll(errorSelector)) {
        candidates.add(message);
      }
    }
    return candidates;
  }

  function showChangedMessage(element) {
    if (element.hidden) {
      seen.delete(element);
      return;
    }
    const text = element.textContent.trim();
    const isVisible = element.getClientRects().length > 0;
    if (text && isVisible && seen.get(element) !== text) {
      seen.set(element, text);
      show(text);
    }
  }

  const observer = new MutationObserver(function (records) {
    const messages = findChangedMessages(records);
    for (const message of messages) {
      showChangedMessage(message);
    }
  });
  observer.observe(document.querySelector('#view'), {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'role']
  });
}
