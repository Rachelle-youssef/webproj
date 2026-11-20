let boundaryPromise;

export function getLebanonBoundary() {
  // The request map and location picker share one downloaded boundary.
  if (!boundaryPromise) {
    boundaryPromise = loadBoundary();
  }
  return boundaryPromise;
}

async function loadBoundary() {
  try {
    const response = await fetch('/assets/lebanon.json');
    if (!response.ok) {
      throw new Error('Lebanon boundary could not be loaded.');
    }
    return await response.json();
  } catch (error) {
    boundaryPromise = undefined;
    throw error;
  }
}

function isInsideRing(ring, latitude, longitude) {
  let inside = false;
  let previousIndex = ring.length - 1;

  // An odd number of border crossings means the point is inside the outline.
  for (let index = 0; index < ring.length; index++) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previousIndex];
    const crossesLatitude = currentLatitude > latitude !== previousLatitude > latitude;
    if (crossesLatitude) {
      const crossingLongitude =
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
        currentLongitude;
      if (longitude < crossingLongitude) {
        inside = !inside;
      }
    }
    previousIndex = index;
  }
  return inside;
}

export function containsLocation(boundary, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  const [outline, ...holes] = boundary.geometry.coordinates;
  if (!isInsideRing(outline, latitude, longitude)) {
    return false;
  }
  for (const hole of holes) {
    if (isInsideRing(hole, latitude, longitude)) {
      return false;
    }
  }
  return true;
}

export async function createLebanonMap(canvas) {
  const [, boundary] = await Promise.all([
    import('/assets/leaflet/leaflet.js'),
    getLebanonBoundary()
  ]);
  if (!canvas.isConnected) {
    throw new Error('Map view closed.');
  }
  const leaflet = window.L;
  const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const countryLayer = leaflet.geoJSON(boundary, { smoothFactor: 0 });
  const bounds = countryLayer.getBounds();
  const viewBounds = bounds.pad(0.15);
  const map = leaflet.map(canvas, {
    scrollWheelZoom: false,
    maxZoom: 19,
    maxBounds: bounds.pad(0.5),
    maxBoundsViscosity: 1,
    fadeAnimation: animate,
    zoomAnimation: animate,
    markerZoomAnimation: animate
  });
  const fitCountry = () => {
    map.fitBounds(viewBounds, {
      padding: [16, 16],
      animate: false
    });
  };
  const resize = () => {
    if (!canvas.clientWidth || !canvas.clientHeight) {
      return;
    }
    map.invalidateSize({
      pan: false
    });
    map.setMinZoom(map.getBoundsZoom(viewBounds, false, [32, 32]));
    fitCountry();
  };
  resize();
  leaflet
    .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      noWrap: true,
      maxZoom: 19,
      referrerPolicy: 'origin',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    })
    .on('tileerror', () => canvas.dispatchEvent(new CustomEvent('map-tile-error')))
    .addTo(map);

  // Hide the surrounding countries while keeping Lebanon's map tiles visible.
  const maskPane = map.createPane('lebanonMask');
  maskPane.style.zIndex = '350';
  maskPane.style.pointerEvents = 'none';
  const worldOutline = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
  const countryOutline = boundary.geometry.coordinates[0].map(
    ([longitude, latitude]) => [latitude, longitude]
  );
  leaflet.polygon([worldOutline, countryOutline], {
    pane: 'lebanonMask',
    className: 'lebanon-mask',
    stroke: false,
    fillRule: 'evenodd',
    fillOpacity: 1,
    smoothFactor: 0,
    interactive: false
  }).addTo(map);

  countryLayer
    .setStyle({
      className: 'lebanon-outline',
      color: '#45695c',
      weight: 2,
      fill: false,
      interactive: false
    })
    .addTo(map);
  return {
    map,
    leaflet,
    resize,
    fitCountry
  };
}

