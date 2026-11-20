export async function api(path, { method = 'GET', body, includeMeta = false } = {}) {
  const headers = {
    Accept: 'application/json'
  };
  if (method !== 'GET') {
    headers['X-Requested-With'] = 'LifeLink';
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch('/api/v1' + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error(
      'Could not reach LifeLink. Check that the server is running and try again.'
    );
  }
  if (response.ok && method !== 'GET') {
    document.dispatchEvent(new Event('lifelink:api-success'));
  }
  if (response.status === 204) {
    return;
  }
  // A response without valid JSON uses the same general error message below.
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok) {
    const detail = result.error?.details?.[0];
    let message = result.error?.message;
    if (detail?.message) {
      message = detail.field + ': ' + detail.message;
    }
    const error = new Error(message || 'Request failed. Please try again.');
    error.status = response.status;
    error.details = result.error?.details || [];
    document.dispatchEvent(new CustomEvent('lifelink:api-error', { detail: error }));
    throw error;
  }
  if (includeMeta) {
    return result;
  }
  return result.data;
}
