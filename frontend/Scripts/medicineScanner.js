import { api } from './api.js';

// A label identifies a batch. Always load its current record from the API.
function readLabel(value) {
  const match = /^lifelink:medication:([1-9]\d{0,9}):exp:(\d{4}-\d{2}-\d{2})$/.exec(
    value.trim()
  );
  if (!match || Number(match[1]) > 4294967295) {
    throw new Error('This is not a LifeLink medicine QR label.');
  }
  const date = new Date(match[2] + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[2]) {
    throw new Error('The expiry date on this label is invalid.');
  }
  return { id: Number(match[1]), expiry: match[2] };
}

export function mountMedicineScanner(root, escapeHtml, onSessionExpired) {
  root.classList.add('medicine-scanner');
  root.innerHTML = `
    <header class="donor-heading">
      <div class="eyebrow">Medicine inventory</div>
      <h1>Medicine QR lookup</h1>
      <p class="mute">Scan a LifeLink medicine QR label to look up its batch.</p>
    </header>
    <div class="scan-layout">
      <section class="scan-card" aria-labelledby="scan-camera-title">
        <div class="scan-step">01 / Read a label</div>
        <h2 id="scan-camera-title">Scan medicine QR</h2>
        <label class="scan-upload">Read a QR image
          <input data-scan-image type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="scan-upload-help">
        </label>
        <small id="scan-upload-help" class="mute">PNG, JPG or WebP, up to 10 MB. Images are processed on this device.</small>
        <details class="scan-camera-panel" data-scan-camera><summary>Use a camera instead</summary>        <div class="scan-viewfinder">
          <video data-scan-video muted playsinline hidden aria-label="Live camera preview"></video>
          <div data-scan-placeholder class="scan-placeholder">
            <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M24 9H9v15m47-15h15v15M9 56v15h15m32 0h15V56"/><path d="M22 22h12v12H22zm24 0h12v12H46zM22 46h12v12H22zm24 0h5v5h7v7H46z"/></svg>
            <p>Keep the full QR code in view</p>
            <small>Your camera stays off until you start it.</small>
          </div>
          <span class="scan-live" data-scan-live hidden>Camera on</span>
        </div>
        <div class="scan-actions">
          <button class="btn" type="button" data-scan-start>Start camera</button>
          <button class="btn ghost" type="button" data-scan-stop hidden>Stop camera</button>
        </div>
        <p class="scan-camera-note mute">Camera access needs your permission and HTTPS or localhost. You can also choose an image below.</p>
</details>
      </section>
      <div class="scan-side">
        <section class="scan-card" aria-labelledby="scan-manual-title">
          <div class="scan-step">Another way in</div>
          <h2 id="scan-manual-title">Know the batch number?</h2>
          <form data-scan-manual>
            <label>Batch number<input name="batch_id" type="number" min="1" max="4294967295" step="1" required placeholder="e.g. 12"></label>
            <button class="btn ghost" type="submit">Look up batch</button>
          </form>
        </section>

      </div>
    </div>
    <p data-scan-message class="scan-message" role="status" hidden></p>
    <section data-scan-result class="scan-result" aria-live="polite" aria-atomic="true" aria-label="Batch lookup result" hidden></section>`;

  const find = (selector) => root.querySelector(selector);
  const video = find('[data-scan-video]');
  const start = find('[data-scan-start]');
  const stop = find('[data-scan-stop]');
  const fileInput = find('[data-scan-image]');
  const manualForm = find('[data-scan-manual]');
  const feedback = find('[data-scan-message]');
  const result = find('[data-scan-result]');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let disposed = false;
  let stream = null;
  let cameraRequest = 0;
  let timer = null;
  let operation = 0;
  let decoder = null;

  function message(text, error = false) {
    if (disposed) {
      return;
    }
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle('donor-error', error);
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }

  find('[data-scan-camera]').addEventListener('toggle', (event) => {
    if (!event.target.open) stopCamera();
  });

  function stopCamera() {
    cameraRequest++;
    clearTimeout(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.pause();
    video.srcObject = null;
    video.hidden = true;
    find('[data-scan-placeholder]').hidden = false;
    find('[data-scan-live]').hidden = true;
    start.disabled = false;
    start.textContent = 'Start camera';
    stop.hidden = true;
  }

  function beginOperation(text) {
    stopCamera();
    result.hidden = true;
    result.replaceChildren();
    message(text);
    return ++operation;
  }

  async function loadDecoder() {
    if (!decoder) {
      // Bundled locally: no CDN request or image upload during scanning.
      await import('/assets/jsqr/jsQR.js');
      decoder = window.jsQR;
      if (typeof decoder !== 'function') {
        throw new Error('The QR reader could not load. Try the batch number instead.');
      }
    }
    return decoder;
  }

  function decode(source, width, height) {
    // Bound processing work for large camera frames and phone photos.
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return decoder(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: 'attemptBoth'
    });
  }

  function showBatch(batch, label) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const expired = batch.expiry_date <= today;
    const mismatch = label && label.expiry !== batch.expiry_date;
    const available =
      batch.status === 'approved' &&
      !expired &&
      Number(batch.quantity_available) > 0 &&
      !mismatch;
    let explanation = 'This batch is not available for dispensing.';
    if (mismatch) {
      explanation =
        'The label expiry does not match the current record. Set this label aside and check the batch in inventory.';
    } else if (expired) {
      explanation = 'This batch has reached its expiry date. Do not dispense it.';
    } else if (available) {
      explanation =
        'This batch is approved, within its expiry date and has stock available. Dispensing still needs a medicine request and an admin action.';
    } else if (batch.status === 'pending') {
      explanation = 'This donation is still awaiting review. It cannot be dispensed yet.';
    } else if (batch.status === 'rejected') {
      explanation = 'This donation was rejected. It cannot be dispensed.';
    } else if (Number(batch.quantity_available) === 0) {
      explanation = 'This batch has no available stock.';
    }
    result.innerHTML = `<div class="scan-result-heading"><div><div class="scan-step">02 / Current database record</div>
      <h2>${escapeHtml(batch.name)}</h2><p class="mute">Batch #${Number(batch.id)} · ${label ? 'Read from a QR label' : 'Looked up by batch number'}</p></div>
      <span class="pill ${available ? 'approved' : ''}">${available ? 'Stock available' : 'Check before use'}</span></div>
      <p class="scan-outcome ${available ? 'scan-available' : 'scan-unavailable'}">${escapeHtml(explanation)}</p>
      <dl class="scan-facts"><div><dt>Recorded status</dt><dd>${escapeHtml(batch.status)}</dd></div>
      <div><dt>Available quantity</dt><dd>${Number(batch.quantity_available)} units</dd></div>
      <div><dt>Expiry date</dt><dd>${escapeHtml(batch.expiry_date)}</dd></div>
      <div><dt>Originally donated</dt><dd>${Number(batch.quantity_donated)} units</dd></div></dl>
      ${batch.description ? `<p>${escapeHtml(batch.description)}</p>` : ''}
      ${batch.admin_note ? `<p class="mute">Admin note: ${escapeHtml(batch.admin_note)}</p>` : ''}
      <p class="mute">${label ? (mismatch ? 'Label and record differ.' : 'Label number and expiry match this record.') : 'No QR label was checked.'} Expiry is checked against today in Lebanon. Availability is checked again when recording a medicine handoff.</p>
      <div class="scan-actions"><a class="btn ghost" href="#/admin-inventory">Medicine inventory</a><a class="btn" href="#/admin-medicines">Medicine review</a></div>`;
    result.hidden = false;
    result.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth'
    });
  }

  async function lookup(id, label, request) {
    try {
      const batch = await api('/medicines/' + id);
      if (disposed || request !== operation) {
        return;
      }
      showBatch(batch, label);
      message('Batch loaded. Check its current details below.');
    } catch (error) {
      if (disposed || request !== operation) {
        return;
      }
      message(error.message, true);
      if (error.status === 401) {
        onSessionExpired();
      }
    }
  }

  async function acceptCode(text, request) {
    stopCamera();
    try {
      const label = readLabel(text);
      message('Label read. Loading the current batch…');
      await lookup(label.id, label, request);
    } catch (error) {
      message(error.message, true);
    }
  }

  function scanFrame(request, camera) {
    if (disposed || request !== operation || camera !== cameraRequest || !stream) {
      return;
    }
    try {
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const code = decode(video, video.videoWidth, video.videoHeight);
        if (code) {
          acceptCode(code.data, request);
          return;
        }
      }
      timer = setTimeout(() => scanFrame(request, camera), 250);
    } catch {
      stopCamera();
      message('The camera image could not be read. Try an image or batch number.', true);
    }
  }

  async function startCamera() {
    const request = beginOperation('Starting camera…');
    if (!navigator.mediaDevices?.getUserMedia) {
      message(
        'Camera access is unavailable here. Use HTTPS or localhost, choose an image, or enter a batch number.',
        true
      );
      return;
    }
    const camera = cameraRequest;
    start.disabled = true;
    start.textContent = 'Starting…';
    stop.hidden = false;
    try {
      await loadDecoder();
      if (disposed || camera !== cameraRequest || request !== operation) {
        return;
      }
      const incoming = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      // A permission prompt may resolve after the user has left or pressed Stop.
      if (disposed || camera !== cameraRequest || request !== operation) {
        incoming.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = incoming;
      video.srcObject = stream;
      video.hidden = false;
      find('[data-scan-placeholder]').hidden = true;
      find('[data-scan-live]').hidden = false;
      await video.play();
      if (disposed || camera !== cameraRequest) {
        return;
      }
      message('Camera on. Hold a LifeLink medicine QR label steady inside the preview.');
      scanFrame(request, camera);
    } catch (error) {
      if (disposed || camera !== cameraRequest || request !== operation) {
        return;
      }
      stopCamera();
      const messages = {
        NotAllowedError:
          'Camera permission was denied. Allow it in your browser settings, or choose an image or batch number.',
        NotFoundError: 'No camera was found. Choose an image or enter a batch number.',
        NotReadableError:
          'The camera is busy or unavailable. Close other camera apps, or choose an image.'
      };
      message(
        messages[error.name] ||
          'The camera could not start. Try an image or batch number.',
        true
      );
    }
  }

  async function readImage() {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) {
      return;
    }
    const request = beginOperation('Reading the QR image…');
    let image;
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      ) {
        throw new Error('Choose a PNG, JPG or WebP image no larger than 10 MB.');
      }
      await loadDecoder();
      if (disposed || request !== operation) {
        return;
      }
      image = await createImageBitmap(file);
      if (disposed || request !== operation) {
        return;
      }
      const code = decode(image, image.width, image.height);
      if (!code) {
        throw new Error(
          'No readable QR code was found. Choose a clearer image with the entire label, or enter the batch number.'
        );
      }
      await acceptCode(code.data, request);
    } catch (error) {
      if (!disposed && request === operation) {
        message(
          error.name === 'InvalidStateError'
            ? 'This image could not be opened. Try another image.'
            : error.message,
          true
        );
      }
    } finally {
      image?.close();
    }
  }

  function submitManual(event) {
    event.preventDefault();
    const id = Number(manualForm.elements.batch_id.value);
    if (!Number.isInteger(id) || id < 1 || id > 4294967295) {
      return;
    }
    const request = beginOperation('Loading the current batch…');
    lookup(id, null, request);
  }

  function stopByUser() {
    operation++;
    stopCamera();
    message('Camera stopped.');
  }

  function pauseWhenHidden() {
    if (document.hidden && (stream || start.disabled)) {
      stopByUser();
    }
  }

  start.addEventListener('click', startCamera);
  stop.addEventListener('click', stopByUser);
  fileInput.addEventListener('change', readImage);
  manualForm.addEventListener('submit', submitManual);
  document.addEventListener('visibilitychange', pauseWhenHidden);
  window.addEventListener('pagehide', stopByUser);
  return () => {
    disposed = true;
    operation++;
    stopCamera();
    start.removeEventListener('click', startCamera);
    stop.removeEventListener('click', stopByUser);
    fileInput.removeEventListener('change', readImage);
    manualForm.removeEventListener('submit', submitManual);
    document.removeEventListener('visibilitychange', pauseWhenHidden);
    window.removeEventListener('pagehide', stopByUser);
    canvas.width = canvas.height = 0;
  };
}
