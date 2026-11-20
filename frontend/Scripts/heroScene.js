// Home hero animation (three.js): "Connecting Blood Donors. Supporting Patients. Saving Lives."
//
// Story, in order (about 5 seconds), then it keeps living:
//   1. a blood drop appears in the middle and starts to beat
//   2. three points appear one by one: Blood donors, Patients, Medical assistance
//   3. a glowing red line grows from each point to the drop
//   4. light flows along the lines (donors -> drop -> patients, medical support -> drop)
//   5. the LifeLink logo appears under the drop
//
// - three.js is our own copy in Assets/three/ and loads ONLY on the home page. The CSP
//   allows scripts from this server only, so no CDN is used.
// - The labels are normal HTML (crisp text); this file only draws the glowing 3D layer and
//   keeps the labels on top of their 3D points.
// - No WebGL or any failure: the labels simply show in their final state, nothing breaks.
// - "Reduce motion": one still frame of the finished picture. The loop pauses when the tab
//   is hidden or the hero is off-screen, and the pixel ratio is capped to save battery.
const THREE_URL = '/assets/three/three.module.min.js';
const RED = 0xff2d3d;
const CREAM = 0xfce6d5;

// Where each point lives in the scene, and when it appears (seconds).
const NODES = [
  { id: 'donors', at: [-2.5, -1.3, 0], on: 0.9, line: [1.2, 2.4], bend: [0.1, 0.9, 0.4], flowsIn: true },
  { id: 'patients', at: [2.5, -1.3, 0], on: 1.9, line: [2.2, 3.4], bend: [-0.1, 0.9, 0.4], flowsIn: false },
  { id: 'medical', at: [0, 2.55, 0], on: 2.9, line: [3.2, 4.4], bend: [0.9, 0, 0.5], flowsIn: true }
];
const FLOW_START = 4.2; // light starts to travel
const LOGO_AT = 5.2; // the logo appears
const DROP_CENTER = [0, 0.25, 0];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const segment = (t, a, b) => clamp01((t - a) / (b - a));
const easeOut = (v) => 1 - Math.pow(1 - v, 3);

function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A teardrop: radius and height for t from 0 (the tip) to PI (the round bottom).
const dropRadius = (t) => Math.sin(t) * Math.pow(Math.sin(t / 2), 1.5);
const dropHeight = (t) => Math.cos(t);

function glowTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// No WebGL or reduced motion: show the finished picture without the 3D layer.
function showFinalLabels(host) {
  host.querySelectorAll('.net-node, .net-logo').forEach((el) => el.classList.add('is-on'));
}

function showStaticScene(host) {
  host.classList.add('is-static');
  showFinalLabels(host);
}

function build(THREE, host) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    showStaticScene(host);
    return () => {};
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.6s ease'
  });
  const grid = host.querySelector('.home-art-grid');
  if (grid) {
    grid.after(canvas); // behind the HTML labels
  } else {
    host.prepend(canvas);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const glow = glowTexture(THREE);
  const disposables = [glow];
  const track = (item) => {
    disposables.push(item);
    return item;
  };
  const small = host.clientWidth < 520;
  const random = seededRandom(11);
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const dropCenter = V(DROP_CENTER);

  // ---- Floating dust, for depth ---------------------------------------------------------
  const dust = [];
  for (let i = 0; i < (small ? 40 : 70); i++) {
    dust.push(new THREE.Vector3((random() - 0.5) * 10, (random() - 0.5) * 9, (random() - 0.5) * 4));
  }
  const dustPoints = new THREE.Points(
    track(new THREE.BufferGeometry().setFromPoints(dust)),
    track(new THREE.PointsMaterial({ map: glow, size: 0.12, color: CREAM, opacity: 0.35, ...additive }))
  );
  scene.add(dustPoints);

  // ---- The central drop: dots, a faint body, a glow and a beating ring --------------------
  const drop = new THREE.Group();
  drop.position.copy(dropCenter);
  const scale = 1.15;
  const surface = [];
  const dotTarget = small ? 600 : 900;
  while (surface.length < dotTarget) {
    const t = random() * Math.PI;
    if (random() > dropRadius(t) / 0.68) {
      continue;
    }
    const phi = random() * Math.PI * 2;
    surface.push(
      new THREE.Vector3(
        dropRadius(t) * Math.cos(phi) * scale,
        dropHeight(t) * scale - 0.15,
        dropRadius(t) * Math.sin(phi) * scale
      )
    );
  }
  drop.add(
    new THREE.Points(
      track(new THREE.BufferGeometry().setFromPoints(surface)),
      track(new THREE.PointsMaterial({ map: glow, size: 0.13, color: 0xffb3aa, opacity: 0.95, ...additive }))
    )
  );
  const profile = [];
  for (let step = 0; step <= 36; step++) {
    const t = (step / 36) * Math.PI;
    profile.push(new THREE.Vector2(dropRadius(t) * scale, dropHeight(t) * scale - 0.15));
  }
  drop.add(
    new THREE.Mesh(
      track(new THREE.LatheGeometry(profile, 36)),
      track(new THREE.MeshBasicMaterial({ color: RED, opacity: 0.22, side: THREE.DoubleSide, ...additive }))
    )
  );
  const bloom = new THREE.Points(
    track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.1, 0)])),
    track(new THREE.PointsMaterial({ map: glow, size: 4.2, color: RED, opacity: 0.4, ...additive }))
  );
  drop.add(bloom);
  const ring = new THREE.Mesh(
    track(new THREE.RingGeometry(0.98, 1, 72)),
    track(new THREE.MeshBasicMaterial({ color: 0xff6b75, opacity: 0, side: THREE.DoubleSide, ...additive }))
  );
  ring.position.y = -0.1;
  drop.add(ring);
  scene.add(drop);

  // ---- Three glowing lines (and halos) from the points to the drop -----------------------
  const SEGMENTS = 56;
  const RADIAL = 6;
  const lines = NODES.map((node) => {
    const nodePos = V(node.at);
    const edge = dropCenter.clone().add(new THREE.Vector3(Math.sign(node.at[0]) * 0.55, node.at[1] > 0 ? 0.9 : -0.25, 0));
    const [from, to] = node.flowsIn ? [nodePos, edge] : [edge, nodePos];
    const control = from.clone().add(to).multiplyScalar(0.5).add(V(node.bend));
    const curve = new THREE.QuadraticBezierCurve3(from, control, to);
    const core = new THREE.Mesh(
      track(new THREE.TubeGeometry(curve, SEGMENTS, 0.022, RADIAL, false)),
      track(new THREE.MeshBasicMaterial({ color: 0xff5a64, opacity: 0.95, ...additive }))
    );
    const halo = new THREE.Mesh(
      track(new THREE.TubeGeometry(curve, SEGMENTS, 0.09, RADIAL, false)),
      track(new THREE.MeshBasicMaterial({ color: RED, opacity: 0.2, ...additive }))
    );
    const nodeGlow = new THREE.Points(
      track(new THREE.BufferGeometry().setFromPoints([nodePos])),
      track(new THREE.PointsMaterial({ map: glow, size: 2.2, color: RED, opacity: 0, ...additive }))
    );
    // three little lights that travel along the line
    const lightPositions = new Float32Array(9);
    const lightGeometry = track(new THREE.BufferGeometry());
    lightGeometry.setAttribute('position', new THREE.BufferAttribute(lightPositions, 3));
    const lightMaterial = track(new THREE.PointsMaterial({ map: glow, size: 0.5, color: 0xffffff, opacity: 0, ...additive }));
    const lights = new THREE.Points(lightGeometry, lightMaterial);
    [core, halo].forEach((mesh) => {
      mesh.geometry.setDrawRange(0, 0);
      scene.add(mesh);
    });
    scene.add(nodeGlow, lights);
    return { node, curve, core, halo, nodeGlow, lights, lightPositions, lightGeometry, lightMaterial, element: host.querySelector(`[data-node="${node.id}"]`) };
  });
  const logo = host.querySelector('.net-logo');

  // ---- Keep the HTML labels on top of their 3D points -----------------------------------
  const projected = new THREE.Vector3();
  function placeLabels() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    lines.forEach(({ node, element }) => {
      if (!element) {
        return;
      }
      projected.set(...node.at).project(camera);
      element.style.setProperty('--x', `${(projected.x * 0.5 + 0.5) * width}px`);
      element.style.setProperty('--y', `${(-projected.y * 0.5 + 0.5) * height}px`);
    });
  }

  // ---- One frame of the story ----------------------------------------------------------
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let elapsed = 0;
  function update(time, beatTime) {
    const intro = easeOut(segment(time, 0, 1));
    const beat = Math.pow(Math.max(0, Math.sin(beatTime * 2.4)), 8); // a heartbeat, not a sine wave
    drop.scale.setScalar(intro * (1 + beat * 0.06));
    drop.position.y = DROP_CENTER[1] + Math.sin(beatTime * 0.9) * 0.06;
    drop.rotation.y = beatTime * 0.35;
    const phase = (beatTime * 2.4) % (Math.PI * 2);
    const wave = segment(phase, 0.3, 2.6);
    ring.material.opacity = phase >= 0.3 && phase <= 2.6 ? (1 - wave) * 0.35 * intro : 0;
    ring.scale.setScalar(1 + wave * 1.4);
    bloom.material.opacity = 0.3 * intro + beat * 0.25;
    dustPoints.rotation.y = beatTime * 0.03;

    const flow = segment(time, FLOW_START, FLOW_START + 0.8);
    lines.forEach((line, index) => {
      const { node, core, halo, nodeGlow, lights, lightPositions, lightGeometry, lightMaterial, curve, element } = line;
      const drawn = easeOut(segment(time, node.line[0], node.line[1]));
      const count = Math.floor(drawn * SEGMENTS) * RADIAL * 6;
      core.geometry.setDrawRange(0, count);
      halo.geometry.setDrawRange(0, count);
      halo.material.opacity = 0.16 + beat * 0.1;
      nodeGlow.material.opacity = segment(time, node.on, node.on + 0.8) * (0.45 + beat * 0.2);
      if (element && time >= node.on) {
        element.classList.add('is-on');
      }
      for (let k = 0; k < 3; k++) {
        const t = ((beatTime * 0.22 + k / 3 + index * 0.17) % 1);
        curve.getPointAt(t, projected);
        projected.toArray(lightPositions, k * 3);
      }
      lightGeometry.attributes.position.needsUpdate = true;
      lightMaterial.opacity = flow;
      lights.visible = flow > 0;
    });
    if (logo && time >= LOGO_AT) {
      logo.classList.add('is-on');
    }
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = 12.4 / Math.min(1, camera.aspect * 1.05);
    camera.updateProjectionMatrix();
    if (!running) {
      draw();
    }
  }
  function onPointerMove(event) {
    const box = host.getBoundingClientRect();
    pointer.targetX = ((event.clientX - box.left) / box.width - 0.5) * 2;
    pointer.targetY = ((event.clientY - box.top) / box.height - 0.5) * 2;
  }
  function onPointerLeave() {
    pointer.targetX = 0;
    pointer.targetY = 0;
  }

  const clock = new THREE.Clock();
  let running = false;
  let contextLost = false;
  let frameId = 0;
  let onScreen = true;
  let beatTime = 0;

  function draw() {
    camera.position.x = pointer.x * 0.5;
    camera.position.y = -pointer.y * 0.35;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    placeLabels();
    renderer.render(scene, camera);
    canvas.style.opacity = '1';
  }
  function frame() {
    frameId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    beatTime += dt;
    pointer.x += (pointer.targetX - pointer.x) * 0.05;
    pointer.y += (pointer.targetY - pointer.y) * 0.05;
    update(elapsed, beatTime);
    draw();
  }
  function sync() {
    const shouldRun = !reduceMotion && !contextLost && onScreen && !document.hidden;
    if (shouldRun && !running) {
      running = true;
      clock.getDelta();
      frame();
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  }

  const resizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  const onLost = (event) => {
    event.preventDefault();
    contextLost = true;
    sync();
    canvas.style.display = 'none';
    showStaticScene(host);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('visibilitychange', sync);
  resizeObserver.observe(host);
  visibilityObserver.observe(host);
  if (reduceMotion) {
    beatTime = 2;
    update(10, beatTime); // the finished picture, no movement
    showFinalLabels(host);
  } else {
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);
    update(0, 0);
  }
  resize();
  sync();

  return () => {
    running = false;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    document.removeEventListener('visibilitychange', sync);
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onLost);
    disposables.forEach((item) => item.dispose());
    renderer.dispose();
    canvas.remove();
  };
}

/** Starts the animation inside the hero panel. Returns a function that stops it. */
export function mountHeroScene(host) {
  if (!host) {
    return () => {};
  }
  let stopped = false;
  let cleanup = () => {};
  import(THREE_URL)
    .then((THREE) => {
      if (!stopped && host.isConnected) {
        cleanup = build(THREE, host);
      }
    })
    .catch(() => { if (!stopped && host.isConnected) showStaticScene(host); });
  return () => {
    stopped = true;
    cleanup();
  };
}
