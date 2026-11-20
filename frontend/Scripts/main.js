// Client-side script (runs in the browser). It calls the server with AJAX:
// browser -> PL (route + controller) -> BLL (health rules) -> DAL (database ping) -> MySQL
'use strict';

async function showServerStatus() {
  const status = document.getElementById('status');
  try {
    const response = await fetch('/api/v1/health');
    const { data } = await response.json();
    status.textContent = `Server: ${data.status} · Database: ${data.database} · Version ${data.version}`;
    status.classList.add(data.status === 'ok' ? 'ok' : 'bad');
  } catch {
    status.textContent = 'The server did not answer.';
    status.classList.add('bad');
  }
}
showServerStatus();
