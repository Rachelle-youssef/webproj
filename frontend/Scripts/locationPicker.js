import { api } from './api.js';
import { createLebanonMap, getLebanonBoundary, containsLocation } from './lebanonMap.js';

export function mountLocationPicker(container, form, options = {}) {
  const {
    title = 'Hospital location in Lebanon',
    description = 'Select the treating hospital, not a home address. Zoom in and drag the pin to adjust it.',
    showCoordinates = true,
    required = true
  } = options;
  let initialPoint = options.initialPoint || null;
  container.innerHTML = `<div class="location-picker"><b data-picker-title></b>
    <p class="mute" data-picker-description></p>
    <div class="location-picker-map" data-location-map role="region" aria-label="Choose hospital location in Lebanon"></div>
    <p data-location-message role="status">Loading Lebanon map…</p>
    ${showCoordinates ? '<details class="coordinate-details"><summary>Enter coordinates instead</summary>' : '<div hidden>'}
      <label>Hospital latitude (optional)<input name="latitude" type="number" min="-90" max="90" step="any"></label>
      <label>Hospital longitude (optional)<input name="longitude" type="number" min="-180" max="180" step="any"></label>
    ${showCoordinates ? '</details>' : '</div>'}</div>`;
  container.querySelector('[data-picker-title]').textContent = title;
  container.querySelector('[data-picker-description]').textContent = description;
  const canvas = container.querySelector('[data-location-map]');
  const message = container.querySelector('[data-location-message]');
  const latitude = form.elements.latitude;
  const longitude = form.elements.longitude;
  let boundary, map, leaflet, marker, observer, resizeMap;
  let disposed = false;
  let initializing = false;
  const coordinates = () =>
    latitude.value !== '' && longitude.value !== ''
      ? [Number(latitude.value), Number(longitude.value)]
      : null;
  function report(text, error = false) {
    message.textContent = text;
    message.classList.toggle('donor-error', error);
  }
  function syncMarker() {
    const point = coordinates();
    if (!point || !boundary || !containsLocation(boundary, ...point)) {
      marker?.remove();
      marker = undefined;
      report(
        point
          ? 'Choose a hospital point inside Lebanon.'
          : 'Click the map to select the hospital location.',
        Boolean(point)
      );
      return;
    }
    report('Hospital location selected.');
    if (!map) {
      return;
    }
    if (marker) {
      marker.setLatLng(point);
    } else {
      marker = leaflet
        .marker(point, {
          draggable: true,
          title: 'Selected hospital location',
          alt: 'Selected hospital location'
        })
        .addTo(map);
      marker.on('dragend', () => select(marker.getLatLng()));
    }
  }
  function select(point) {
    const selectedLatitude = Number(point.lat.toFixed(6)),
      selectedLongitude = Number(point.lng.toFixed(6));
    if (!containsLocation(boundary, selectedLatitude, selectedLongitude)) {
      syncMarker();
      report('Select a point inside Lebanon.', true);
      return;
    }
    latitude.value = selectedLatitude;
    longitude.value = selectedLongitude;
    syncMarker();
  }
  const validate = (event) => {
    const point = coordinates();
    if (
      (!point && required) ||
      (point && (!boundary || !containsLocation(boundary, ...point)))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      report('Select your hospital location inside Lebanon before saving.', true);
      container.scrollIntoView({
        block: 'center'
      });
    }
  };
  function setLocation(point, remember = false) {
    if (remember) {
      initialPoint = point;
      latitude.defaultValue = point?.[0] ?? '';
      longitude.defaultValue = point?.[1] ?? '';
    }
    latitude.value = point?.[0] ?? '';
    longitude.value = point?.[1] ?? '';
    syncMarker();
  }
  const reset = () => setLocation(initialPoint);
  if (initialPoint) {
    latitude.defaultValue = initialPoint[0];
    longitude.defaultValue = initialPoint[1];
  }
  form.addEventListener('submit', validate, true);
  form.addEventListener('reset', reset);
  latitude.addEventListener('change', syncMarker);
  longitude.addEventListener('change', syncMarker);
  canvas.addEventListener('map-tile-error', () =>
    report(
      'Background tiles could not load. You can select a point inside the Lebanon outline or use coordinates.',
      true
    )
  );
  async function initialize() {
    if (disposed || initializing || map || !canvas.clientWidth || !canvas.clientHeight) {
      return;
    }
    initializing = true;
    try {
      boundary = await getLebanonBoundary();
      if (disposed || !container.isConnected) {
        return;
      }
      const result = await createLebanonMap(canvas);
      if (disposed || !container.isConnected) {
        result.map.remove();
        return;
      }
      ({ map, leaflet } = result);
      map.on('click', (event) => select(event.latlng));
      resizeMap = result.resize;
      syncMarker();
    } catch {
      if (!disposed) {
        report(
          'The map could not load. Use the top refresh icon to try again, or enter hospital coordinates.',
          true
        );
      }
    } finally {
      initializing = false;
    }
  }
  observer = new ResizeObserver(() => {
    if (!disposed) {
      if (map) {
        resizeMap();
      } else {
        initialize();
      }
    }
  });
  observer.observe(canvas);
  // Saved pins may sit inside a closed disclosure, before Leaflet is visible.
  getLebanonBoundary()
    .then((value) => {
      if (!disposed) {
        boundary = value;
        syncMarker();
      }
    })
    .catch(() => {});
  initialize();
  return {
    setLocation,
    dispose() {
      disposed = true;
      observer?.disconnect();
      map?.remove();
      form.removeEventListener('submit', validate, true);
      form.removeEventListener('reset', reset);
      latitude.removeEventListener('change', syncMarker);
      longitude.removeEventListener('change', syncMarker);
    }
  };
}

export function openLocationEditor(row, onSaved, onSessionExpired) {
  const dialog = document.createElement('dialog');
  dialog.className = 'location-dialog';
  dialog.innerHTML = `<form class="card" data-location-editor><div class="acts"><h2>Set hospital location</h2><button class="btn ghost sm" type="button" data-close-location>Close</button></div>
    <p data-location-title></p><div data-location-picker></div><p data-save-location role="status" hidden></p>
    <button class="btn" type="submit">Save hospital location</button></form>`;
  dialog.querySelector('[data-location-title]').textContent =
    'Request #' + row.id + ' — ' + row.hospital_name;
  document.body.append(dialog);
  dialog.showModal();
  const form = dialog.querySelector('form');
  const picker = mountLocationPicker(
    dialog.querySelector('[data-location-picker]'),
    form
  );
  if (row.latitude != null && row.longitude != null) {
    form.elements.latitude.value = row.latitude;
    form.elements.longitude.value = row.longitude;
  }
  const feedback = dialog.querySelector('[data-save-location]');
  let busy = false,
    disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    picker.dispose();
    dialog.remove();
  };
  dialog.addEventListener('close', dispose);
  dialog.addEventListener('cancel', (event) => {
    if (busy) {
      event.preventDefault();
    }
  });
  dialog
    .querySelector('[data-close-location]')
    .addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    busy = true;
    form.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    feedback.hidden = true;
    try {
      const updated = await api('/blood-requests/' + Number(row.id) + '/location', {
        method: 'PATCH',
        body: {
          latitude: Number(form.elements.latitude.value),
          longitude: Number(form.elements.longitude.value)
        }
      });
      if (disposed) {
        return;
      }
      dialog.close();
      await onSaved(updated);
    } catch (error) {
      if (disposed) {
        return;
      }
      if (error.status === 401) {
        dialog.close();
        onSessionExpired();
      } else {
        feedback.textContent = error.message;
        feedback.hidden = false;
      }
    } finally {
      busy = false;
      form.querySelectorAll('button').forEach((button) => {
        button.disabled = false;
      });
    }
  });
  return dispose;
}
