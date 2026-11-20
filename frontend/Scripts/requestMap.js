import { api } from './api.js';
import { createLebanonMap } from './lebanonMap.js';

export function mountRequestMap(root, user, types, escapeHtml, onSessionExpired) {
  root.classList.add('map-page');
  const options = types
    .map(
      (type) => `<option value="${Number(type.id)}">${escapeHtml(type.label)}</option>`
    )
    .join('');
  let workspace;
  if (user.role === 'donor') {
    workspace = ['donor', 'Open blood donations'];
  } else if (user.role === 'admin') {
    workspace = ['admin', 'Open blood coordination'];
  } else {
    workspace = ['requests', 'Open my blood requests'];
  }
  root.innerHTML = `<header class="donor-heading"><div class="eyebrow">Connections across Lebanon</div><h1>Blood request map</h1>
    <p class="mute">Explore open blood requests with a selected treating-hospital location.</p></header>
    <section aria-label="Find blood requests"><form class="admin-filters" data-map-filters>
      <label>Blood type<select name="blood_type_id"><option value="">All blood types</option>${options}</select></label>
      <label>Urgency<select name="urgency"><option value="">All urgency levels</option><option value="sos">SOS</option><option value="urgent">Urgent</option><option value="normal">Normal</option></select></label>
      <label>City<input name="city" type="search" maxlength="60" placeholder="Search a city"></label>
      <button class="btn ghost sm" type="submit">Apply filters</button><button class="btn ghost sm" type="button" data-map-clear>Clear filters</button>
    </form><p data-map-status role="status">Loading mapped requests…</p>
    <div class="request-map-layout">
      <div class="request-map-panel"><div class="request-map-toolbar"><span class="map-legend"><i class="sos"></i>SOS <i class="urgent"></i>Urgent <i class="normal"></i>Normal</span>
        <button class="btn ghost sm" type="button" data-map-fit disabled>Fit shown requests</button></div>
        <p data-map-note class="note warn" role="status" hidden></p>
        <div data-request-map class="request-map-canvas" role="region" aria-label="Interactive hospital blood request map"></div>
        <p class="map-caption">Pins show the current results page. Select a pin or use the request list to view details.</p>
      </div><div class="request-map-list"><h2>Mapped requests</h2><div data-map-list aria-live="polite"><p role="status">Loading…</p></div></div>
    </div><div data-map-pages class="acts donor-pages"></div></section>
    <section class="note map-explanation"><h2>Continue in your workspace</h2><p>Use your Blood page to offer a donation, track a request or coordinate collection. Pins identify treating hospitals on open requests, including patient requests. Personal home locations are never used as patient hospital pins.</p>
      <a class="btn ghost sm" href="#/${workspace[0]}">${workspace[1]}</a></section>`;
  const form = root.querySelector('[data-map-filters]');
  const status = root.querySelector('[data-map-status]');
  const list = root.querySelector('[data-map-list]');
  const pages = root.querySelector('[data-map-pages]');
  const notice = root.querySelector('[data-map-note]');
  const canvas = root.querySelector('[data-request-map]');
  const fit = root.querySelector('[data-map-fit]');
  let page = 1;
  let filters = {};
  let records = [];
  let dataReady = false;
  let busy = false;
  let disposed = false;
  let leaflet;
  let map;
  let fitCountry;
  let markerLayer;
  let resizeObserver;
  const markers = new Map();
  function showNotice(text) {
    if (disposed) {
      return;
    }
    notice.textContent = text;
    notice.hidden = false;
  }
  function fitRequests() {
    if (!map || !records.length) {
      return;
    }
    const points = records.map((row) => [Number(row.latitude), Number(row.longitude)]);
    map.invalidateSize({
      pan: false
    });
    map.fitBounds(leaflet.latLngBounds(points), {
      paddingTopLeft: [48, 64],
      paddingBottomRight: [48, 40],
      maxZoom: 13,
      animate: false
    });
  }
  function requestContent(row) {
    return `<b>${escapeHtml(row.hospital_name)}</b><p>Request #${Number(row.id)} · ${escapeHtml(row.blood_type)} · ${escapeHtml(row.urgency)}</p>
      <p>${Number(row.units_received)} of ${Number(row.units_needed)} units received${row.city ? ' · ' + escapeHtml(row.city) : ''}</p>`;
  }
  function renderMarkers() {
    if (!map) {
      return;
    }
    markerLayer.clearLayers();
    markers.clear();
    const locations = new Map();
    for (const row of records) {
      const key =
        Number(row.latitude).toFixed(6) + ',' + Number(row.longitude).toFixed(6);
      if (!locations.has(key)) {
        locations.set(key, []);
      }
      locations.get(key).push(row);
    }
    for (const group of locations.values()) {
      let urgency;
      if (group.some((row) => row.urgency === 'sos')) {
        urgency = 'sos';
      } else if (group.some((row) => row.urgency === 'urgent')) {
        urgency = 'urgent';
      } else {
        urgency = 'normal';
      }
      const first = group[0];
      const label =
        group.length > 1
          ? group.length + ' requests at this location'
          : first.hospital_name + ', ' + first.blood_type + ', ' + first.urgency;
      const icon = leaflet.divIcon({
        className: 'lifelink-map-icon',
        iconSize: [48, 48],
        iconAnchor: [24, 48],
        popupAnchor: [0, -46],
        html: `<span class="request-map-pin ${urgency}"><span>${group.length > 1 ? group.length : escapeHtml(first.blood_type)}</span></span>`
      });
      const marker = leaflet
        .marker([Number(first.latitude), Number(first.longitude)], {
          icon,
          title: label,
          keyboard: true
        })
        .addTo(markerLayer);
      marker.getElement().setAttribute('aria-label', label);
      const content = document.createElement('div');
      content.className = 'request-map-popup';
      content.innerHTML =
        group.map((row) => `<div>${requestContent(row)}</div>`).join('') +
        `<a href="#/${workspace[0]}">${workspace[1]}</a>`;
      marker.bindPopup(content, {
        maxWidth: 290,
        maxHeight: 260
      });
      for (const row of group) {
        markers.set(Number(row.id), marker);
      }
    }
    fit.disabled = !records.length || busy;
    fitCountry();
  }
  function renderList() {
    list.innerHTML =
      records
        .map(
          (
            row
          ) => `<article class="map-request-card"><div class="acts"><span class="pill ${escapeHtml(row.urgency)}">${row.urgency === 'sos' ? 'SOS' : escapeHtml(row.urgency)}</span><strong>${escapeHtml(row.blood_type)}</strong></div>
      <h3>${escapeHtml(row.hospital_name)}</h3><p>Request #${Number(row.id)}${row.city ? ' · ' + escapeHtml(row.city) : ''}</p>
      <p>${Number(row.units_received)} of ${Number(row.units_needed)} units received</p>
      <button class="btn ghost sm" type="button" data-map-focus="${Number(row.id)}"${map ? '' : ' disabled'}>Show on map</button></article>`
        )
        .join('') ||
      '<p class="empty">No mapped requests match these filters. Try another city or clear the filters.</p>';
  }
  async function load() {
    if (busy || disposed) {
      return;
    }
    busy = true;
    status.textContent = 'Loading mapped requests…';
    root.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    try {
      const query = new URLSearchParams({
        ...filters,
        page,
        limit: 20,
        sort: '-created_at'
      });
      let result = await api('/feed/map?' + query, {
        includeMeta: true
      });
      if (disposed || !root.isConnected) {
        return;
      }
      if (page > result.meta.pages) {
        page = result.meta.pages;
        query.set('page', page);
        result = await api('/feed/map?' + query, {
          includeMeta: true
        });
        if (disposed || !root.isConnected) {
          return;
        }
      }
      const { data, meta } = result;
      records = data;
      dataReady = true;
      status.textContent =
        data.length +
        ' shown of ' +
        meta.total +
        ' matching request(s) · Page ' +
        meta.page +
        ' of ' +
        meta.pages;
      renderList();
      renderMarkers();
      pages.innerHTML =
        meta.pages > 1
          ? `${meta.page > 1 ? `<button class="btn ghost sm" type="button" data-map-page="${meta.page - 1}">Previous</button>` : ''}
        <span>Page ${Number(meta.page)} of ${Number(meta.pages)}</span>${meta.page < meta.pages ? `<button class="btn ghost sm" type="button" data-map-page="${meta.page + 1}">Next</button>` : ''}`
          : '';
    } catch (error) {
      if (disposed || !root.isConnected) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
        return;
      }
      records = [];
      dataReady = false;
      renderMarkers();
      pages.innerHTML = '';
      status.textContent = 'Mapped requests could not be loaded.';
      list.innerHTML = `<p class="empty" role="alert">${escapeHtml(error.message)}</p>`;
    } finally {
      busy = false;
      root.querySelectorAll('button').forEach((button) => {
        button.disabled = false;
      });
      fit.disabled = !map || !records.length;
      root.querySelectorAll('[data-map-focus]').forEach((button) => {
        button.disabled = !map;
      });
    }
  }
  async function initializeMap() {
    try {
      const result = await createLebanonMap(canvas);
      if (disposed || !root.isConnected) {
        result.map.remove();
        return;
      }
      ({ map, leaflet, fitCountry } = result);
      markerLayer = leaflet.layerGroup().addTo(map);
      canvas.addEventListener('map-tile-error', () =>
        showNotice(
          'Some background tiles could not load. Request pins and the list are still available.'
        )
      );
      resizeObserver = new ResizeObserver(() => {
        if (disposed) {
          return;
        }
        result.resize();
      });
      resizeObserver.observe(canvas);
      renderMarkers();
      if (dataReady) {
        renderList();
      }
      fit.disabled = !records.length || busy;
    } catch {
      showNotice(
        'The interactive map could not be loaded. You can still browse the request list below.'
      );
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    filters = Object.fromEntries(
      [...new FormData(form)]
        .map(([key, value]) => [key, String(value).trim()])
        .filter(([, value]) => value !== '')
    );
    page = 1;
    load();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || busy) {
      return;
    }
    if (button.hasAttribute('data-map-clear')) {
      form.reset();
      filters = {};
      page = 1;
      load();
    } else if (button.hasAttribute('data-map-fit')) {
      fitRequests();
    } else if (button.dataset.mapPage) {
      page = Number(button.dataset.mapPage);
      load();
    } else if (button.dataset.mapFocus) {
      const marker = markers.get(Number(button.dataset.mapFocus));
      if (!marker) {
        return;
      }
      canvas.scrollIntoView({
        block: 'center'
      });
      map.setView(marker.getLatLng(), 14, {
        animate: false
      });
      marker.openPopup();
    }
  });
  load();
  initializeMap();
  return () => {
    disposed = true;
    resizeObserver?.disconnect();
    map?.remove();
  };
}
