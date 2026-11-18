// Solmar Bay — the renderer (three.js).
// A WebGL scene for the world and a 2D canvas overlay for the HUD, minimap
// and screens. World (x, y) maps to three.js (x - 1280, 0, y - 960);
// a world angle θ becomes rotation.y = -θ.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, FONT, PALETTE, WORLD } from './config.js';
import { makeBuilding, makeCar, makeHelicopter, makePalm, makePerson, makeProp, box, cyl } from './models.js';

const CX = WORLD.width / 2;
const CZ = WORLD.height / 2;
const toX = (x) => x - CX;
const toZ = (y) => y - CZ;
const toAngle = (a) => -a;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = { x: 0, y: 0, w: 232, h: 172 };

export function createRenderer(canvas, hudCanvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xf2b878, 700, 2400);

  const camera = new THREE.PerspectiveCamera(60, 1, 1, 4000);
  camera.position.set(0, 300, 600);

  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x4a5a3a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -380;
  sun.shadow.camera.right = 380;
  sun.shadow.camera.top = 380;
  sun.shadow.camera.bottom = -380;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const hud = hudCanvas.getContext('2d');
  const view = { w: 1280, h: 720, scale: 1, dpr: 1 };
  const camState = { x: 0, y: 300, z: 600, fov: 60 };

  // ---- entity pools (meshes are reused, never allocated per frame) ----
  const clouds = [];
  const carMeshes = new Map();
  const personMeshes = new Map();
  const pickupMeshes = new Map();
  let heliMesh = null;
  let heliRotor = null;

  const PARTICLE_MAX = 400;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_MAX * 3);
  const pCol = new Float32Array(PARTICLE_MAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 7, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);

  const SKID_MAX = 200;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SKID_MAX * 2 * 3);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const skids = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.45 }));
  skids.frustumCulled = false;
  scene.add(skids);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    hudCanvas.width = Math.round(w * dpr);
    hudCanvas.height = Math.round(h * dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    view.scale = Math.min(w / 1280, h / 720);
    MINIMAP.x = w - 248;
    MINIMAP.y = 16;
  }

  function buildSky() {
    // Golden-hour sky: a gradient dome (warm horizon, deep top), a low sun
    // with a glow, and slow-drifting clouds. The dome, sun and clouds are
    // never fogged — they ARE the sky. Without them the top of every shot
    // is one flat peach colour.
    const sunDir = new THREE.Vector3(-0.85, 0.26, 0.35).normalize();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0xc96a45) },
        horizon: { value: new THREE.Color(0xffd9a0) },
        sunDir: { value: sunDir },
        sunColor: { value: new THREE.Color(0xfff3c4) },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunColor * pow(s, 24.0) * 0.55 + sunColor * pow(s, 6.0) * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1900, 24, 12), skyMat));
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(55, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    sunDisc.position.copy(sunDir).multiplyScalar(1750);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(170, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.copy(sunDir).multiplyScalar(1740);
    glow.lookAt(0, 0, 0);
    scene.add(glow);
    // Clouds: flattened white blobs, high over the city, drifting slowly.
    const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.88, fog: false });
    const blobs = [[0, 0, 0, 26], [24, -3, 4, 18], [-22, -2, -3, 16], [8, 5, -6, 14]];
    const cloudSeeds = [[-900, 300, -500, 1.4], [-300, 350, -700, 1.1], [400, 280, -600, 1.6], [1000, 330, -300, 1.2], [-1100, 320, 300, 1.0], [-500, 360, 500, 1.3], [200, 300, 650, 1.0], [900, 350, 550, 1.5], [0, 330, 0, 1.2], [1300, 290, 100, 0.9], [-1400, 310, -100, 1.2], [600, 370, 900, 1.1], [-1200, 290, -950, 1.3], [-600, 270, -1100, 1.0], [800, 300, -1050, 1.4], [-200, 320, 1050, 1.1]];
    for (const [cx, cy, cz, s] of cloudSeeds) {
      const cloud = new THREE.Group();
      for (const [bx, by, bz, br] of blobs) {
        const b = new THREE.Mesh(cloudGeo, cloudMat);
        b.scale.set(br * s, br * s * 0.42, br * s * 0.7);
        b.position.set(bx * s, by * s, bz * s);
        cloud.add(b);
      }
      cloud.position.set(cx, cy, cz);
      scene.add(cloud);
      clouds.push(cloud);
    }
  }

  function buildCity(city) {
    buildSky();
    // Ground: grass base, sand beach, turquoise sea.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, WORLD.height), new THREE.MeshLambertMaterial({ color: 0x7fae5a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, WORLD.height - CITY.beachTop), new THREE.MeshLambertMaterial({ color: 0xe3cf9e }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.5, toZ(CITY.beachTop) + (WORLD.height - CITY.beachTop) / 2);
    beach.receiveShadow = true;
    scene.add(beach);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, WORLD.height - CITY.beachTop + 400), new THREE.MeshLambertMaterial({ color: 0x2e7f9e }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.2, toZ(CITY.beachTop) + (WORLD.height - CITY.beachTop) / 2 + 200);
    scene.add(sea);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width - CITY.riverLeft, WORLD.height), new THREE.MeshLambertMaterial({ color: 0x2e7f9e }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(toX(CITY.riverLeft) + (WORLD.width - CITY.riverLeft) / 2, 0.2, 0);
    scene.add(river);

    // Roads: dark slabs + centre dashes + sidewalks (block slabs).
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x3d3a38 });
    const sideMat = new THREE.MeshLambertMaterial({ color: 0xc9b896 });
    for (const r of city.roads) {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), roadMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(toX(r.x + r.w / 2), 1, toZ(r.y + r.h / 2));
      slab.receiveShadow = true;
      scene.add(slab);
    }
    // Block slabs (sidewalks) between the roads.
    for (let bx = 0; bx < CITY.verticalRoads.length; bx += 1) {
      for (let by = 0; by < CITY.horizontalRoads.length; by += 1) {
        const x0 = CITY.verticalRoads[bx] + CITY.roadWidth / 2;
        const y0 = CITY.horizontalRoads[by] + CITY.roadWidth / 2;
        if (x0 >= CITY.riverLeft || y0 >= CITY.beachTop) continue;
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), sideMat);
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(toX(x0 + 128), 0.6, toZ(y0 + 128));
        slab.receiveShadow = true;
        scene.add(slab);
      }
    }
    // Centre dashes, one instanced mesh.
    const dashGeo = new THREE.BoxGeometry(14, 0.4, 3);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xf5d76e });
    const dashes = [];
    for (const x of CITY.verticalRoads) for (let y = 80; y < CITY.beachTop; y += 56) dashes.push([x, y, 0]);
    for (const y of CITY.horizontalRoads) for (let x = 80; x < CITY.riverLeft; x += 56) dashes.push([x, y, 1]);
    const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    dashes.forEach(([x, y, horiz], i) => {
      eul.set(0, horiz ? Math.PI / 2 : 0, 0);
      q.setFromEuler(eul);
      m4.compose(new THREE.Vector3(toX(x), 1.4, toZ(y)), q, new THREE.Vector3(1, 1, 1));
      dashMesh.setMatrixAt(i, m4);
    });
    scene.add(dashMesh);

    // Buildings.
    const facades = [0xe8dcc0, 0xd9c4a5, 0xcbb59a, 0xe0cfae];
    for (const b of city.buildings) {
      const mesh = makeBuilding(b.w, b.h, 40 + b.height * 30, b.roof, facades[(b.x + b.y) % facades.length | 0] || 0xe8dcc0);
      mesh.position.set(toX(b.x + b.w / 2), 0, toZ(b.y + b.h / 2));
      scene.add(mesh);
    }

    // Park: pond and trees.
    const park = city.park;
    const pond = cyl(46, 2, 0x2e7f9e, toX(park.x + park.w / 2), 1.2, toZ(park.y + park.h / 2));
    scene.add(pond);
    for (let i = 0; i < 10; i += 1) {
      const tree = makeProp('tree');
      tree.position.set(toX(park.x + 30 + (i % 5) * 48), 0, toZ(park.y + 30 + Math.floor(i / 5) * 90));
      scene.add(tree);
    }

    // Palms along the beach and the Strip.
    for (let x = 120; x < WORLD.width - 120; x += 160) {
      const palm = makePalm();
      palm.position.set(toX(x), 0, toZ(CITY.beachTop - 24));
      scene.add(palm);
    }
    for (let y = 400; y < CITY.beachTop - 100; y += 320) {
      const palm = makePalm();
      palm.position.set(toX(1280 - 44), 0, toZ(y));
      scene.add(palm);
    }

    // Street lamps at intersections.
    for (const n of city.roadGraph.nodes) {
      if ((n.x + n.y) % 640 !== 0) continue;
      const lamp = makeProp('lamp');
      lamp.position.set(toX(n.x + 40), 0, toZ(n.y + 40));
      scene.add(lamp);
    }

    // Docks: containers + a crane silhouette (two posts + beam).
    // The docks sit on a concrete apron, not grass.
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), new THREE.MeshLambertMaterial({ color: 0x8a8a80 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(toX(160), 0.75, toZ(1440));
    apron.receiveShadow = true;
    scene.add(apron);
    const docks = city.docks;
    const containerColors = [0xc96f4a, 0x3f8f7f, 0xd9a441, 0x7d5ba6];
    for (let i = 0; i < 8; i += 1) {
      const c = makeProp('container', containerColors[i % containerColors.length]);
      c.position.set(toX(docks.x + 50 + (i % 4) * 70), 0, toZ(docks.y + 50 + Math.floor(i / 4) * 120));
      c.rotation.y = (i % 2) * 0.12;
      scene.add(c);
    }
    const craneL = box(6, 90, 6, 0xd9a441, toX(120), 45, toZ(1330));
    const craneR = box(6, 90, 6, 0xd9a441, toX(220), 45, toZ(1330));
    const craneTop = box(140, 6, 8, 0xd9a441, toX(170), 92, toZ(1330));
    scene.add(craneL, craneR, craneTop);

    // Bridge deck over the river.
    const bridge = box(320, 4, CITY.roadWidth, 0x8a7f70, toX(2400), 2, toZ(960));
    bridge.receiveShadow = true;
    scene.add(bridge);
    for (const z of [-26, 26]) {
      const rail = box(320, 5, 2, 0xd9a441, toX(2400), 6, toZ(960 + z));
      scene.add(rail);
    }
  }

  function carMeshFor(v) {
    let mesh = carMeshes.get(v);
    if (!mesh) {
      mesh = makeCar(v.color, v.kind);
      carMeshes.set(v, mesh);
      scene.add(mesh);
    }
    return mesh;
  }

  function personMeshFor(key, jacket) {
    let mesh = personMeshes.get(key);
    if (!mesh) {
      mesh = makePerson(jacket);
      personMeshes.set(key, mesh);
      scene.add(mesh);
    }
    return mesh;
  }

  function syncVehicles(state) {
    for (const v of state.vehicles) {
      const mesh = carMeshFor(v);
      mesh.position.set(toX(v.x), 0, toZ(v.y));
      mesh.rotation.y = toAngle(v.angle);
      mesh.visible = true;
    }
  }

  function syncPeople(state, time) {
    // Player.
    const p = state.player;
    const playerMesh = personMeshes.get('player') || personMeshFor('player', 0xffd23f);
    if (p.inCar) {
      playerMesh.visible = false;
    } else {
      playerMesh.visible = !p.dead;
      playerMesh.position.set(toX(p.x), 0, toZ(p.y));
      playerMesh.rotation.y = toAngle(p.angle);
      const moving = Math.abs(p.x - (playerMesh.userData.lx || p.x)) + Math.abs(p.y - (playerMesh.userData.ly || p.y)) > 0.01;
      playerMesh.userData.lx = p.x;
      playerMesh.userData.ly = p.y;
      const legSwing = moving ? Math.sin(time * 10) * 0.5 : 0;
      playerMesh.userData.legs.rotation.x = legSwing;
    }
    // Pedestrians.
    const seen = new Set(['player']);
    state.pedestrians.forEach((ped, i) => {
      const key = `ped${i}`;
      seen.add(key);
      const mesh = personMeshFor(key, ped.color);
      mesh.visible = !ped.dead;
      mesh.position.set(toX(ped.x), ped.dead ? 2 : 0, toZ(ped.y));
      mesh.rotation.y = toAngle(ped.angle);
      if (ped.dead) mesh.rotation.x = Math.PI / 2;
      else mesh.rotation.x = 0;
      mesh.userData.legs.rotation.x = ped.state === 'flee' ? Math.sin(time * 14) * 0.6 : Math.sin(time * 8) * 0.3;
    });
    // Gang members (red jackets) and officers (blue).
    state.gang.forEach((g, i) => {
      const key = `gang${i}`;
      seen.add(key);
      const mesh = personMeshFor(key, 0xd94f3d);
      mesh.position.set(toX(g.x), 0, toZ(g.y));
      mesh.rotation.y = toAngle(g.angle);
      mesh.visible = !g.dead;
    });
    state.police.forEach((o, i) => {
      const key = `cop${i}`;
      seen.add(key);
      const mesh = personMeshFor(key, 0x2b4acb);
      mesh.position.set(toX(o.x), 0, toZ(o.y));
      mesh.rotation.y = toAngle(o.angle);
      mesh.visible = true;
    });
    for (const [key, mesh] of personMeshes) {
      if (!seen.has(key)) {
        scene.remove(mesh);
        personMeshes.delete(key);
      }
    }
  }

  function syncPickups(state, time) {
    const seen = new Set();
    state.pickups.forEach((pk, i) => {
      const key = `pk${i}`;
      seen.add(key);
      let mesh = pickupMeshes.get(key);
      if (!mesh) {
        const color = pk.kind === 'health' ? 0xffffff : pk.kind === 'ammo' ? 0x4caf6d : 0xffd23f;
        mesh = box(16, 16, 16, color, 0, 0, 0);
        if (pk.kind === 'health') {
          mesh.add(box(12, 4, 4, 0xd94f3d, 0, 0, 9));
          mesh.add(box(4, 12, 4, 0xd94f3d, 0, 0, 9));
        }
        pickupMeshes.set(key, mesh);
        scene.add(mesh);
      }
      mesh.position.set(toX(pk.x), 12 + Math.sin(pk.bob) * 4, toZ(pk.y));
      mesh.rotation.y = time * 1.5;
    });
    for (const [key, mesh] of pickupMeshes) {
      if (!seen.has(key)) {
        scene.remove(mesh);
        pickupMeshes.delete(key);
      }
    }
  }

  function syncHelicopter(state, time) {
    const h = state.helicopter;
    if (!heliMesh) {
      heliMesh = makeHelicopter();
      heliRotor = heliMesh.userData.rotor;
      scene.add(heliMesh);
    }
    heliMesh.visible = h.active;
    if (!h.active) return;
    heliMesh.position.set(toX(h.x), h.altitude, toZ(h.y));
    heliMesh.rotation.y = toAngle(h.angle) + Math.PI / 2;
    const spin = time * 22;
    heliMesh.userData.rotor.rotation.y = spin;
    heliMesh.userData.rotor2.rotation.y = spin;
  }

  function syncParticles(state) {
    const n = Math.min(state.particles.length, PARTICLE_MAX);
    for (let i = 0; i < n; i += 1) {
      const pt = state.particles[i];
      pPos[i * 3] = toX(pt.x);
      pPos[i * 3 + 1] = 6 + pt.size;
      pPos[i * 3 + 2] = toZ(pt.y);
      const c = new THREE.Color(pt.color);
      pCol[i * 3] = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function syncSkids(state) {
    const n = Math.min(state.skids.length, SKID_MAX);
    for (let i = 0; i < n; i += 1) {
      const s = state.skids[i];
      sPos[i * 6] = toX(s.x1);
      sPos[i * 6 + 1] = 1.6;
      sPos[i * 6 + 2] = toZ(s.y1);
      sPos[i * 6 + 3] = toX(s.x2);
      sPos[i * 6 + 4] = 1.6;
      sPos[i * 6 + 5] = toZ(s.y2);
    }
    sGeo.setDrawRange(0, n * 2);
    sGeo.attributes.position.needsUpdate = true;
  }

  function updateCamera(state, screen, dt, time) {
    if (screen === SCREEN_TITLE) {
      const a = time * 0.05;
      camera.position.set(Math.cos(a) * 650, 380, Math.sin(a) * 650);
      camera.lookAt(0, 0, 0);
      if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
      return;
    }
    const p = state.player;
    const driving = !!p.inCar;
    const target = driving ? p.inCar : p;
    const fx = Math.cos(p.angle);
    const fz = Math.sin(p.angle);
    // High enough to look OVER a police car ramming from behind (a low
    // chase cam puts the pursuer between the camera and the player) and
    // over a pedestrian standing by the camera, low enough to stay a chase
    // cam and not a top-down map. The steeper pitch also keeps empty sky
    // out of the top of the frame.
    const dist = driving ? 130 : 180;
    const height = driving ? 68 : 66;
    const wantX = toX(target.x) - fx * dist;
    const wantZ = toZ(target.y) - fz * dist;
    const wantY = height;
    const k = 1 - Math.exp(-dt * 4.5);
    camState.x += (wantX - camState.x) * k;
    camState.y += (wantY - camState.y) * k;
    camState.z += (wantZ - camState.z) * k;
    camera.position.set(camState.x, camState.y, camState.z);
    camera.lookAt(toX(target.x) + fx * 55, 8, toZ(target.y) + fz * 55);
    const speedFov = driving ? Math.min(12, Math.abs(p.inCar.speed) / 45) : 0;
    const wantFov = 60 + speedFov;
    if (Math.abs(camera.fov - wantFov) > 0.1) {
      camera.fov += (wantFov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
    // Sun follows the player so shadows stay near the action.
    sun.position.set(toX(p.x) - 500, 420, toZ(p.y) + 260);
    sun.target.position.set(toX(p.x), 0, toZ(p.y));
  }

  // ---- 2D HUD overlay ----
  function text(str, x, y, size, color, align = 'left', weight = '') {
    hud.font = `${weight} ${size}px ${FONT}`;
    hud.textAlign = align;
    hud.textBaseline = 'top';
    // A soft dark offset under every label: HUD text sits over the 3D
    // scene, and a bright car or the sky behind it must never wash it out.
    hud.fillStyle = 'rgba(10,12,20,0.55)';
    hud.fillText(str, x + 1, y + 2);
    hud.fillStyle = color;
    hud.fillText(str, x, y);
  }

  function panel(x, y, w, h, alpha = 0.82) {
    hud.fillStyle = `rgba(20,26,46,${alpha})`;
    hud.beginPath();
    hud.roundRect(x, y, w, h, 10);
    hud.fill();
    hud.strokeStyle = PALETTE.panelEdge;
    hud.lineWidth = 2;
    hud.stroke();
  }

  /** Wrap a string to lines of at most maxChars (two lines max). */
  function wrap(str, maxChars) {
    const words = str.split(' ');
    const lines = [''];
    for (const w of words) {
      const last = lines[lines.length - 1];
      if (last && (last + ' ' + w).length > maxChars) lines.push(w);
      else lines[lines.length - 1] = last ? `${last} ${w}` : w;
    }
    return lines.slice(0, 2);
  }

  function drawHud(state, screen, ui) {
    const dpr = view.dpr;
    hud.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.clearRect(0, 0, view.w, view.h);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    const p = state.player;
    // Top-left: cash + health.
    panel(16, 16, 250, 80);
    text(`$${p.cash.toLocaleString('en-US')}`, 30, 24, 34, PALETTE.cash, 'left', '700');
    hud.fillStyle = '#222a3d';
    hud.fillRect(30, 66, 180, 12);
    hud.fillStyle = p.health > 30 ? PALETTE.health : PALETTE.danger;
    hud.fillRect(30, 66, 180 * Math.max(0, p.health / 100), 12);
    text(`${Math.ceil(p.health)}`, 218, 62, 18, PALETTE.text, 'left', '700');
    // Top-centre: wanted stars.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, view.w / 2, 16, 40, state.wanted > 0 ? PALETTE.star : '#5a6274', 'center', '700');
    // Under the minimap: ammo + radio (the minimap label sits at y 202).
    text(`AMMO ${p.ammo}`, view.w - 248, 240, 20, PALETTE.text, 'left', '700');
    if (ui.radio) text(`♪ ${ui.radio.station}${ui.radio.on ? '' : ' (muted)'}`, view.w - 248, 266, 17, '#d8dce6', 'left');
    // Clock.
    const hh = Math.floor(state.clock / 3600) % 24;
    const mm = Math.floor((state.clock % 3600) / 60);
    text(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, view.w / 2, 60, 22, PALETTE.text, 'center', '700');
    // Speed when driving (play screen only).
    if (p.inCar && screen === SCREEN_PLAY) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.36);
      text(`${kmh}`, view.w - 30, view.h - 104, 52, PALETTE.text, 'right', '800');
      text('km/h', view.w - 30, view.h - 52, 16, PALETTE.muted, 'right');
    }
    drawMinimap(state, ui);
    // Objective banner: mission name, waypoint, the hint wrapped inside,
    // and the M4 timer at the top right.
    if (ui.mission && ui.mission.current) {
      const m = ui.mission.current;
      const hintLines = state.missionHint ? wrap(state.missionHint, 52) : [];
      const h = 70 + hintLines.length * 22;
      const y = view.h - 16 - h;
      panel(16, y, 520, h);
      text(m.name.toUpperCase(), 30, y + 10, 26, PALETTE.mission, 'left', '800');
      text(m.waypoint ? `➤ ${m.waypoint.name}` : '', 30, y + 42, 20, PALETTE.text, 'left');
      hintLines.forEach((line, i) => text(line, 30, y + 68 + i * 22, 17, PALETTE.muted, 'left'));
      if (m.id === 'm4') text(`TIME ${Math.ceil(m.timer)}s`, 522, y + 10, 22, PALETTE.danger, 'right', '700');
    }
    // Dialogue box (lifted clear of the taller objective panel, wrapped to
    // two lines so a long line never overflows the box).
    if (ui.mission && ui.mission.current && ui.mission.current.dialogue.length > 0) {
      const line = ui.mission.current.dialogue[ui.mission.current.dialogueIndex];
      if (line) {
        const dlgLines = wrap(`${line[0]}: ${line[1]}`, 62);
        const dh = 24 + dlgLines.length * 26;
        panel(view.w / 2 - 380, view.h - 216, 760, dh, 0.78);
        dlgLines.forEach((dl, i) => text(dl, view.w / 2, view.h - 216 + 12 + i * 26, 20, PALETTE.text, 'center'));
      }
    }
    if (screen === SCREEN_PAUSED) drawCenterPanel('PAUSED', ['The city waits.', 'Press P to keep playing.'], 'P — resume');
    else if (screen === SCREEN_COMPLETE) drawCenterPanel('JOB DONE', [ui.completeText || 'Mission complete.', `Cash $${(ui.completeReward || 0).toLocaleString('en-US')}`], 'Press Enter for the next job');
    else if (screen === SCREEN_BUSTED) drawCenterPanel('BUSTED', ['The Solmar Bay PD has you.', 'The crew will post bail.'], 'Press Enter to try again');
    else if (screen === SCREEN_WASTED) drawCenterPanel('WASTED', ['Jace is down. The city moves on.', ''], 'Press Enter to try again');
  }

  function drawMinimap(state, ui) {
    const m = MINIMAP;
    const sx = m.w / WORLD.width;
    const sy = m.h / WORLD.height;
    panel(m.x - 8, m.y - 8, m.w + 16, m.h + 16, 0.78);
    hud.save();
    hud.beginPath();
    hud.rect(m.x, m.y, m.w, m.h);
    hud.clip();
    hud.fillStyle = '#20293d';
    hud.fillRect(m.x, m.y, m.w, m.h);
    // Sea + beach.
    hud.fillStyle = '#2e7f9e';
    hud.fillRect(m.x, m.y + CITY.beachTop * sy, m.w, m.h - CITY.beachTop * sy);
    hud.fillRect(m.x + CITY.riverLeft * sx, m.y, m.w - CITY.riverLeft * sx, m.h);
    // Roads.
    hud.strokeStyle = '#8a8378';
    hud.lineWidth = 3;
    for (const x of CITY.verticalRoads) {
      hud.beginPath(); hud.moveTo(m.x + x * sx, m.y); hud.lineTo(m.x + x * sx, m.y + CITY.beachTop * sy); hud.stroke();
    }
    for (const y of CITY.horizontalRoads) {
      hud.beginPath(); hud.moveTo(m.x, m.y + y * sy); hud.lineTo(m.x + CITY.riverLeft * sx, m.y + y * sy); hud.stroke();
    }
    // Mission marker (pulsing diamond).
    if (ui.mission && ui.mission.current) {
      const w = ui.mission.current.waypoint;
      const pulse = 6 + Math.sin(performance.now() / 240) * 2;
      hud.fillStyle = PALETTE.mission;
      hud.beginPath();
      hud.moveTo(m.x + w.x * sx, m.y + w.y * sy - pulse);
      hud.lineTo(m.x + w.x * sx + pulse, m.y + w.y * sy);
      hud.lineTo(m.x + w.x * sx, m.y + w.y * sy + pulse);
      hud.lineTo(m.x + w.x * sx - pulse, m.y + w.y * sy);
      hud.closePath(); hud.fill();
    }
    // Police blips.
    hud.fillStyle = '#7ea0ff';
    for (const v of state.vehicles) {
      if (v.driver !== 'police') continue;
      hud.beginPath(); hud.arc(m.x + v.x * sx, m.y + v.y * sy, 3.5, 0, Math.PI * 2); hud.fill();
    }
    // Helicopter.
    if (state.helicopter.active) {
      hud.fillStyle = '#ffe08a';
      hud.font = `700 13px ${FONT}`;
      hud.textAlign = 'center';
      hud.fillText('H', m.x + state.helicopter.x * sx, m.y + state.helicopter.y * sy - 6);
    }
    // Player arrow.
    const px = m.x + state.player.x * sx;
    const py = m.y + state.player.y * sy;
    hud.save();
    hud.translate(px, py);
    hud.rotate(state.player.angle);
    hud.fillStyle = '#ffd23f';
    hud.beginPath();
    hud.moveTo(9, 0); hud.lineTo(-6, -6); hud.lineTo(-6, 6); hud.closePath(); hud.fill();
    hud.restore();
    hud.restore();
    text('SOLMAR BAY', m.x + m.w / 2, m.y + m.h + 14, 13, '#e8ebf2', 'center', '700');
  }

  function drawCenterPanel(title, lines, prompt) {
    const w = 560;
    const h = 150 + lines.length * 30;
    const x = (view.w - w) / 2;
    // Lifted above centre so the player's car and the street stay visible
    // below the panel (the complete screen is a showcase, not a curtain).
    const y = (view.h - h) / 2 - 60;
    panel(x, y, w, h, 0.9);
    text(title, view.w / 2, y + 30, 48, PALETTE.text, 'center', '800');
    lines.forEach((line, i) => text(line, view.w / 2, y + 92 + i * 30, 20, PALETTE.muted, 'center'));
    text(prompt, view.w / 2, y + h - 40, 18, PALETTE.cash, 'center', '700');
  }

  function drawTitle(state, ui) {
    text('SOLMAR BAY', view.w / 2, view.h * 0.16, 88, '#fff2d8', 'center', '800');
    text('A SUN-SOAKED CRIME STORY', view.w / 2, view.h * 0.16 + 96, 22, '#ffffff', 'center', '700');
    const w = 620;
    const h = 300;
    const x = (view.w - w) / 2;
    const y = view.h * 0.42;
    panel(x, y, w, h, 0.82);
    const lines = [
      'WASD drive / walk · Mouse aim · Click shoot',
      'E enter a car · Shift sprint · Space handbrake',
      'R radio · P pause · M mute',
      '',
      'Six jobs. One city. Do not get caught.',
    ];
    lines.forEach((line, i) => text(line, view.w / 2, y + 26 + i * 34, 20, line === '' ? PALETTE.text : PALETTE.muted, 'center', i === 4 ? '700' : ''));
    if (ui.best > 0) text(`BEST CASH $${ui.best.toLocaleString('en-US')}`, view.w / 2, y + h - 76, 18, PALETTE.cash, 'center', '700');
    text('PRESS ENTER TO PLAY', view.w / 2, y + h - 44, 22, PALETTE.cash, 'center', '800');
  }

  function draw(state, screen, ui, dt, time) {
    for (const cloud of clouds) {
      cloud.position.x += dt * 3;
      if (cloud.position.x > 1500) cloud.position.x = -1500;
    }
    syncVehicles(state, time);
    syncPeople(state, time);
    syncPickups(state, time);
    syncHelicopter(state, time);
    syncParticles(state);
    syncSkids(state);
    updateCamera(state, screen, dt, time);
    renderer.render(scene, camera);
    drawHud(state, screen, ui);
  }

  function diagnostics() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }

  /** Screen-space mouse position → world coords on the ground plane. */
  const raycaster = new THREE.Raycaster();
  function aimPoint(mx, my) {
    const ndc = new THREE.Vector2((mx / view.w) * 2 - 1, -(my / view.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    if (Math.abs(dir.y) < 1e-6) return { x: CX, y: CZ };
    const t = -origin.y / dir.y;
    if (t < 0) return { x: CX, y: CZ };
    return { x: origin.x + dir.x * t + CX, y: origin.z + dir.z * t + CZ };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, diagnostics, buildCity, aimPoint };
}
