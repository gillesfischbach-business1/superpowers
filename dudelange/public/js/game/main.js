/**
 * Diddeleng — single-player open world of Dudelange (LU).
 * Boot, player controller, vehicles, train line 60a, interiors, quests, save.
 */
import * as THREE from 'three';
import { buildWorld } from '../core/world.js';
import {
  terrainHeight, terrainNormal, project, unproject, clamp, lerp, resolveCollisions,
  polylineAt, resamplePolyline, polylineLength, closestOnPolyline
} from '../core/geo.js';
import { INTERIORS } from '../core/interiors.js';
import { QUESTS } from '../core/quests.js';
import { createTown } from './world-render.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { TEX } from './textures.js';

const WORLD_SEED = 20261112;

/* ------------------------------------------------------------------ state */
const app = {
  world: null,
  town: null,
  scene: null,
  camera: null,
  renderer: null,
  ui: null,
  audio: new AudioEngine(),
  clock: new THREE.Clock(),
  mode: 'loading',
  keys: Object.create(null),
  time: 8.5 * 60,
  weather: 'clear',
  night: 0,
  player: {
    x: 0, z: 0, y: 0, vy: 0, rot: Math.PI, yaw: Math.PI, pitch: 0.16,
    grounded: true, speed: 0, stamina: 100, distance: 0, level: 1, xp: 0, money: 120,
    inventory: [], visitedStations: new Set(), lastStep: 0, bob: 0
  },
  car: { x: 0, z: 0, rot: 0, speed: 0, occupied: false, group: null, wheels: [] },
  train: null,
  interior: null,
  quests: [],
  saveTimer: 0,
  autosaveId: null,
  lastAlertId: 0,
  compass: 0
};

const el = (id) => document.getElementById(id);

/* --------------------------------------------------------------- bootstrap */
init().catch((err) => {
  console.error(err);
  const box = el('errors');
  box.classList.remove('hidden');
  box.textContent = `Game failed to start:\n${err && err.stack ? err.stack : err}`;
  el('loadtext').textContent = 'Something went wrong — see the error log bottom-left.';
});

async function init() {
  app.ui = new UIEmpty();
  app.ui.setLoadProgress(0.04, 'Reading the geography of the Minett…');
  step('Cartographer — OSM anchors, streets, rail line 60a');
  await tick();

  app.world = buildWorld({ seed: WORLD_SEED });
  app.ui = new UI(app.world);
  app.ui.setLoadProgress(0.22, `Projected ${app.world.stats.roads} streets and ${app.world.stats.buildings} buildings`);
  step('Geologist — EU-DEM terrain, valley, Mont Saint-Jean');
  await tick();
  app.ui.setLoadProgress(0.34, 'Sampling the Diddelengerbaach valley');

  setupThree();
  step('Urbanist — districts, lots, density rules');
  await tick();
  app.ui.setLoadProgress(0.48, 'Zoning Centre, Italien, Burange, Budersberg, Nei Schmelz');

  app.town = createTown(app.world, { quality: devicePixelRatio > 1.6 ? 'high' : 'high' });
  app.scene.add(app.town.group);
  step('Architect — facades, windows, shopfronts, interiors');
  await tick();
  app.ui.setLoadProgress(0.64, `${app.world.stats.buildings} buildings, 17 visitable interiors`);

  setupPlayer();
  step('Rail engineer — platforms, catenary, underpasses');
  await tick();
  setupTrain();
  setupCar();
  setupTraffic();
  setupNPCs();
  step('Systems — save API, HUD, minimap, audio');
  await tick();
  setupQuests();
  bindInput();
  setupRain();
  await loadSave();
  app.ui.setLoadProgress(0.9, 'QA gate: checking the world');
  step('QA — collisions, station order, performance budget');
  await tick();
  await fetch('/api/health').then((r) => r.json()).catch(() => null);
  app.ui.setLoadProgress(1, 'Welcome to Diddeleng');
  step('Release — build report written to data/reports');
  app.mode = 'menu';
  app.renderer.setAnimationLoop(frame);
  app.ui.ready(() => {
    app.mode = 'foot';
    app.audio.resume();
    updateHUD(true);
    pollAgents(true);
  });
}

function tick() { return new Promise((r) => setTimeout(r, 90)); }
function step(text) { app.ui.loadingStep(`✓ ${text}`); }

class UIEmpty {
  loadingStep(t) { const li = document.createElement('li'); li.textContent = t; document.getElementById('loadsteps').appendChild(li); }
  setLoadProgress(p, t) {
    const f = document.getElementById('loadfill'); if (f) f.style.width = `${p * 100}%`;
    const x = document.getElementById('loadtext'); if (x && t) x.textContent = t;
  }
}

/* ------------------------------------------------------------------ scene */
function setupThree() {
  const canvas = el('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  app.renderer = renderer;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb6c6cf, 260, 2900);
  app.scene = scene;

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.12, 12000);
  camera.position.set(0, 20, 20);
  app.camera = camera;

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

/* ----------------------------------------------------------------- player */
let playerObj = null;
let playerParts = null;

function setupPlayer() {
  const p = app.player;
  p.x = app.world.spawn.x;
  p.z = app.world.spawn.z;
  p.y = terrainHeight(p.x, p.z);
  p.yaw = Math.PI * 0.9;
  p.rot = p.yaw;

  const person = makePerson({ shirt: '#264653', pants: '#22262a', skin: '#e2b48f', hair: '#2b2118', jacket: '#e9c46a' });
  playerObj = person.group;
  playerParts = person;
  app.scene.add(playerObj);
}

function makePerson({ shirt = '#2a6f97', pants = '#2f3336', skin = '#e2b48f', hair = '#2b2118', jacket = null, scale = 1 } = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.44, 4, 8), mat(shirt));
  torso.position.y = 1.08;
  torso.castShadow = true;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.26), mat(pants));
  hips.position.y = 0.82;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), mat(skin));
  head.position.y = 1.55;
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(hair));
  hairMesh.position.y = 1.57;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 6), mat(skin));
  nose.position.set(0, 1.53, 0.19);
  nose.rotation.x = Math.PI / 2;
  const armGeo = new THREE.CapsuleGeometry(0.075, 0.5, 3, 6);
  const armL = new THREE.Mesh(armGeo, mat(shirt));
  armL.position.set(-0.33, 1.1, 0);
  const armR = armL.clone(); armR.position.x = 0.33;
  const legGeo = new THREE.CapsuleGeometry(0.095, 0.62, 3, 6);
  const legL = new THREE.Mesh(legGeo, mat(pants));
  legL.position.set(-0.14, 0.44, 0);
  const legR = legL.clone(); legR.position.x = 0.14;
  g.add(torso, hips, head, hairMesh, nose, armL, armR, legL, legR);
  let jacketMesh = null;
  if (jacket) {
    jacketMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.4, 4, 8), mat(jacket));
    jacketMesh.position.y = 1.1;
    g.add(jacketMesh);
  }
  g.scale.setScalar(scale);
  return {
    group: g,
    animate(t, speed = 0, riding = false) {
      const swing = Math.sin(t * 9) * clamp(speed / 6, 0, 1) * 0.6;
      legL.rotation.x = ride ? -0.9 : swing;
      legR.rotation.x = ride ? -0.9 : -swing;
      armL.rotation.x = ride ? -1.1 : -swing * 0.8;
      armR.rotation.x = ride ? -1.1 : swing * 0.8;
      g.position.y += Math.sin(t * 9) * clamp(speed / 8, 0, 1) * 0.02;
    }
  };
}

/* ------------------------------------------------------------------- cars */
function makeCar(color = '#b23a48') {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.72, 1.8), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 1.72), paint);
  hood.position.set(1.55, 0.95, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.68, 1.62), new THREE.MeshStandardMaterial({ color: 0x1b2226, roughness: 0.2, metalness: 0.4 }));
  cabin.position.set(-0.25, 1.2, 0);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa9c7d4, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.7 });
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.55), glassMat);
  windshield.position.set(0.82, 1.2, 0);
  windshield.rotation.y = Math.PI / 2;
  windshield.rotation.z = -0.32;
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.9 });
  const wheels = [];
  [[1.3, 0.92], [1.3, -0.92], [-1.3, 0.92], [-1.3, -0.92]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.34, z);
    g.add(w);
    wheels.push(w);
  });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4cf, emissive: 0xffe0a0, emissiveIntensity: 1 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.4), lightMat);
  hl.position.set(2.06, 0.75, 0.55);
  const hr = hl.clone(); hr.position.z = -0.55;
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.34), new THREE.MeshStandardMaterial({ color: 0x5b1a1a, emissive: 0x330000 }));
  tl.position.set(-2.06, 0.75, 0.55);
  const tr = tl.clone(); tr.position.z = -0.55;
  g.add(body, hood, cabin, windshield, hl, hr, tl, tr);
  return { group: g, wheels };
}

function setupCar() {
  const car = makeCar('#b23a48');
  const spot = { x: app.world.spawn.x + 14, z: app.world.spawn.z + 6 };
  app.car.x = spot.x;
  app.car.z = spot.z;
  app.car.y = terrainHeight(spot.x, spot.z);
  app.car.rot = Math.PI * 0.5;
  car.group.position.set(app.car.x, app.car.y, app.car.z);
  app.scene.add(car.group);
  app.car.group = car.group;
  app.car.wheels = car.wheels;
}

function setupTraffic() {
  const palette = ['#e9c46a', '#2a9d8f', '#264653', '#e6e6e6', '#1d1d1d', '#7f8c8d', '#bc4749'];
  app.traffic = [];
  app.world.roads
    .filter((r) => (r.cls === 'primary' || r.cls === 'secondary') && r.length > 300)
    .slice(0, 9)
    .forEach((road, i) => {
      const car = makeCar(palette[i % palette.length]);
      const samples = resamplePolyline(road.points, 6);
      app.scene.add(car.group);
      app.traffic.push({
        group: car.group, samples, length: polylineLength(samples),
        dist: (i * 97) % 300, speed: 7 + (i % 4) * 1.6, dir: i % 2 ? -1 : 1,
        wheels: car.wheels
      });
    });
}

/* ------------------------------------------------------------------ train */
function setupTrain() {
  const group = new THREE.Group();
  const livery = new THREE.MeshStandardMaterial({ color: 0xdbe3e8, roughness: 0.5, metalness: 0.2 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x12457a, roughness: 0.5, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2b33, roughness: 0.15, metalness: 0.5 });
  const cars = [];
  for (let c = 0; c < 2; c++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(21, 2.5, 2.9), livery);
    body.position.y = 1.9;
    body.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(21, 0.7, 2.6), blue);
    skirt.position.y = 0.7;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(21, 0.35, 2.5), new THREE.MeshStandardMaterial({ color: 0xa9b4ba, roughness: 0.7 }));
    roof.position.y = 3.25;
    const band = new THREE.Mesh(new THREE.BoxGeometry(21.05, 0.25, 2.92), blue);
    band.position.y = 1.05;
    // windows
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), glass);
        win.position.set(-8.4 + i * 2.7, 2.45, side * 1.462);
        win.rotation.y = side > 0 ? 0 : Math.PI;
        car.add(win);
      }
    }
    // doors
    for (const dx of [-6.2, 6.2]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 0.1), blue);
      door.position.set(dx, 1.6, 1.49);
      const door2 = door.clone(); door2.position.z = -1.49;
      car.add(door, door2);
    }
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 2.8), blue);
    front.position.set(10.5, 1.85, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 2.2), new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe8b0, emissiveIntensity: 0.8 }));
    head.position.set(10.85, 1.1, 0);
    const pantograph = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x33383b }));
    pantograph.position.set(2, 3.9, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x33383b }));
    arm.position.set(2, 3.4, 0.6);
    const arm2 = arm.clone(); arm2.position.z = -0.6;
    car.add(body, skirt, roof, band, front, head, pantograph, arm, arm2);
    car.position.x = c * -23;
    group.add(car);
    cars.push(car);
  }
  const railPts = resamplePolyline(app.world.rail.points, 4);
  const total = polylineLength(railPts);
  const stations = app.world.rail.stations
    .map((s) => ({ ...s, chainage: closestOnPolyline(railPts, s.x, s.z).dist, along: true }))
    .sort((a, b) => a.chainage - b.chainage);
  app.train = {
    group, cars, railPts, total, stations,
    dist: 300, speed: 0, dir: 1, dwell: 6, doorsOpen: false,
    state: 'dwell', nextStop: 1, boarded: false, startDist: 0, travelled: 0,
    stopTime: 18
  };
  app.scene.add(group);
  placeTrain();
}

function placeTrain() {
  const t = app.train;
  for (let i = 0; i < t.cars.length; i++) {
    const d = t.dist - i * 23;
    const at = polylineAt(t.railPts, clamp(d, 0, t.total));
    const car = t.cars[i];
    car.position.set(at.x, terrainHeight(at.x, at.z) + 3.3, at.z);
    car.rotation.y = at.angle + Math.PI / 2;
    // tilt with the rail direction
    const ahead = polylineAt(t.railPts, clamp(d + 4, 0, t.total));
    const behind = polylineAt(t.railPts, clamp(d - 4, 0, t.total));
    const slope = (terrainHeight(ahead.x, ahead.z) - terrainHeight(behind.x, behind.z)) / 8;
    car.rotation.z = -Math.atan(slope) * 0.6;
  }
  t.group.updateMatrixWorld();
}

function updateTrain(dt) {
  const t = app.train;
  if (!t) return;
  const stop = t.stations[t.nextStop];
  const targetDist = stop ? stop.chainage : (t.dir > 0 ? t.total - 40 : 40);
  if (t.state === 'dwell') {
    t.dwell -= dt;
    t.doorsOpen = t.dwell > 0 && t.dwell < t.stopTime - 3;
    if (t.dwell <= 0) {
      t.state = 'run';
      t.doorsOpen = false;
      app.audio.horn();
    }
  } else {
    const gap = Math.abs(targetDist - t.dist);
    const targetSpeed = clamp(gap * 0.35, 0, 21);
    t.speed = lerp(t.speed, targetSpeed, clamp(dt * 0.9, 0, 1));
    t.dist += t.speed * dt * t.dir;
    t.travelled += Math.abs(t.speed * dt);
    if (gap < 1.2 && t.speed < 1.2) {
      t.state = 'dwell';
      t.dwell = t.stopTime;
      t.speed = 0;
      t.dist = targetDist;
      arrival(t.stations[t.nextStop]);
    }
    if (t.dist >= t.total - 30) { t.dir = -1; t.nextStop = t.stations.length - 1; }
    if (t.dist <= 20) { t.dir = 1; t.nextStop = 0; }
  }
  placeTrain();
}

function arrival(station) {
  const p = app.player;
  const near = Math.hypot(p.x - station.x, p.z - station.z) < 70;
  if (near) app.ui.toast(`Train arriving at ${station.name}`, 'good');
  if (app.mode === 'train' && app.train.boarded) {
    app.ui.toast(`Stop: ${station.name}. Doors open — press E to step out.`, 'good');
    p.visitedStations.add(station.id);
    questEvent('station', station.id);
  }
}

function boardTrain() {
  const t = app.train;
  if (t.state !== 'dwell' || !t.doorsOpen) { app.ui.toast('The train is moving — wait for the doors.', 'bad'); return; }
  t.boarded = true;
  t.startDist = t.dist;
  t.boardedTravelled = t.travelled;
  app.mode = 'train';
  app.ui.toast('On board line 60a. Sit back, or press E at a stop to get off.', 'good');
  app.audio.door();
  questEvent('train_board');
}

function leaveTrain() {
  const t = app.train;
  const st = t.stations.reduce((best, s) => (Math.abs(s.chainage - t.dist) < Math.abs(best.chainage - t.dist) ? s : best), t.stations[0]);
  const p = app.player;
  p.x = st.x + 9;
  p.z = st.z + 5;
  p.y = terrainHeight(p.x, p.z);
  t.boarded = false;
  app.mode = 'foot';
  app.ui.toast(`You stepped off at ${st.name}.`, 'good');
}

/* -------------------------------------------------------------------- NPCs */
function setupNPCs() {
  app.npcs = [];
  const spots = [
    { x: 49.47855, lon: 6.08430, name: 'Jos', role: 'Retired steelworker', shirt: '#6b705c', line: 'I poured steel here for thirty-one years. Now I walk the mill with tourists and tell them it was louder than thunder.' },
    { x: 49.47895, lon: 6.08540, name: 'Céline', role: 'Cyclist', shirt: '#2a9d8f', line: 'The valley is flat until it is not. Go up Gehaansbierg once and you will know every hill in the Minett.' },
    { x: 49.48342, lon: 6.08360, name: 'M. Weber', role: 'Commuters', shirt: '#1d3557', line: 'Twenty-two minutes to Luxembourg City if the train is on time. It is usually on time.' },
    { x: 49.47862, lon: 6.09220, name: 'Nadia', role: 'Shopkeeper', shirt: '#bc4749', line: 'The Italien quarter was built by Italians who came for the works in the twenties. Their grandchildren run the cafés now.' },
    { x: 49.48642, lon: 6.09820, name: 'Pit', role: 'Forester', shirt: '#386641', line: 'Parc Le’h is beech and oak. Listen — that is a woodpecker, not a machine. The machines stopped in 2005.' },
    { x: 49.47420, lon: 6.08320, name: 'Sofia', role: 'CNA guide', shirt: '#7b5ea7', line: 'Every photograph in there smells faintly of oil. That is not nostalgia, that is the archive.' },
    { x: 49.48004, lon: 6.06089, name: 'Hiker', role: 'On the summit', shirt: '#e07a3f', line: 'Roman outpost, medieval castle, then a beer garden. History has layers here, like the rock.' },
    { x: 49.47190, lon: 6.07900, name: 'Luca', role: 'Trainspotter', shirt: '#457b9d', line: 'Line 60a is the only place where Luxembourg feels like a branch line. Four stops for twenty-two thousand people.' }
  ];
  for (const s of spots) {
    const p = project(s.x, s.lon);
    const person = makePerson({ shirt: s.shirt, pants: '#2f3336', skin: '#e2b48f', hair: '#2b2118' });
    person.group.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    person.group.rotation.y = Math.random() * Math.PI * 2;
    app.scene.add(person.group);
    app.npcs.push({ ...s, x: p.x, z: p.z, person, radius: 3.4 });
  }
}

/* ------------------------------------------------------------------ quests */
function setupQuests() {
  app.quests = QUESTS.map((q) => ({ ...q, done: false }));
}

function questEvent(kind, value) {
  const p = app.player;
  if (kind === 'station') {
    p.visitedStations.add(value);
    if (p.visitedStations.size >= 4) completeQuest('stations');
    else app.ui.toast(`Station visited — ${p.visitedStations.size}/4`, 'good');
  }
  if (kind === 'interior') {
    if (value === 'townhall') completeQuest('welcome');
    if (value === 'rolling_mill' || value === 'cna') {
      p.steelVisits = p.steelVisits || new Set();
      p.steelVisits.add(value);
      if (p.steelVisits.size >= 2) completeQuest('steel');
      else app.ui.toast('Steel heritage — one more site to see.', 'good');
    }
    if (value === 'parc_leh') completeQuest('parc');
  }
  if (kind === 'summit') completeQuest('summit');
  if (kind === 'dish') completeQuest('dinner');
  if (kind === 'train_board') app.ui.toast('Line 60a — Bettembourg ↔ Volmerange-les-Mines', '');
}

function completeQuest(id) {
  const q = app.quests.find((x) => x.id === id);
  if (!q || q.done) return;
  q.done = true;
  app.player.money += q.money;
  addXP(q.xp);
  app.ui.toast(`✔ ${q.title} — +€${q.money}, +${q.xp} XP`, 'good');
  app.audio.quest();
  app.ui.flash();
  updateObjective();
  saveGame();
  if (app.quests.every((x) => x.done)) {
    setTimeout(() => app.ui.toast('Diddeleng Expert — you have seen the whole town. Merci!', 'good'), 900);
  }
}

function addXP(v) {
  const p = app.player;
  p.xp += v;
  while (p.xp >= p.level * 100) { p.xp -= p.level * 100; p.level++; app.ui.toast(`Level ${p.level} — keep wandering.`, 'good'); }
}

function updateObjective() {
  const next = app.quests.find((q) => !q.done);
  app.ui.setObjective(next ? next.desc : 'All objectives complete. Explore at your own pace.');
  app.ui.setXP(app.player.xp, app.player.level);
  app.ui.setMoney(app.player.money);
}

/* ------------------------------------------------------------------ input */
let pointerLocked = false;
let dragging = false;

function bindInput() {
  const canvas = el('game');
  addEventListener('keydown', (e) => {
    app.keys[e.code] = true;
    if (e.code === 'Escape') {
      if (app.ui.dialogOpen) app.ui.hideDialog();
      else if (app.ui.shopOpen) app.ui.closeShop();
      else if (app.ui.panelOpen) app.ui.closePanel();
      else openPause();
    }
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyM' && app.mode !== 'menu') { if (app.ui.panelOpen) app.ui.closePanel(); else app.ui.openMap(app.player, app.player.yaw); }
    if (e.code === 'KeyJ' && app.mode !== 'menu') app.ui.journal(app.quests, app.player, app.world.stats);
    if (e.code === 'KeyP' && app.mode !== 'menu') app.ui.agents();
    if (e.code === 'KeyF' && app.mode === 'car') exitCar();
    if (e.code === 'Digit1' && app.ui.dialogOpen) clickChoice(0);
    if (e.code === 'Digit2' && app.ui.dialogOpen) clickChoice(1);
    if (e.code === 'Digit3' && app.ui.dialogOpen) clickChoice(2);
  });
  addEventListener('keyup', (e) => { app.keys[e.code] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (app.mode === 'menu') return;
    if (e.button === 0) {
      dragging = true;
      if (!pointerLocked && canvas.requestPointerLock) canvas.requestPointerLock();
    }
  });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (app.mode === 'menu') return;
    if (!pointerLocked && !dragging) return;
    const speed = app.mode === 'car' || app.mode === 'train' ? 0.0022 : 0.0028;
    app.player.yaw -= e.movementX * speed;
    app.player.pitch = clamp(app.player.pitch - e.movementY * speed, -0.55, 1.15);
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  el('panelClose').onclick = () => app.ui.closePanel();
  el('panel').addEventListener('click', (e) => { if (e.target.id === 'panel') app.ui.closePanel(); });
  addEventListener('wheel', (e) => {
    if (app.mode === 'car') return;
    app.player.camDist = clamp((app.player.camDist || 7) + e.deltaY * 0.004, 2.6, 14);
  }, { passive: true });
}

function clickChoice(i) {
  const btns = document.querySelectorAll('#dlgChoices button');
  if (btns[i]) btns[i].click();
}

/* ------------------------------------------------------------ interaction */
let nearest = null;

function findInteractable() {
  const p = app.player;
  let best = null;
  const consider = (obj, radius, prompt) => {
    const d = Math.hypot(obj.x - p.x, obj.z - p.z);
    if (d <= radius && (!best || d < best.d)) best = { ...obj, d, prompt };
  };
  for (const it of app.town.interactables) {
    if (it.kind === 'door') consider(it, it.radius || 4.5, `Enter ${it.name}`);
    if (it.kind === 'station') consider(it, 34, `${it.name} — station` );
  }
  for (const n of app.npcs) consider({ kind: 'npc', npc: n, x: n.x, z: n.z, name: n.name }, 3.6, `Talk to ${n.name}`);
  const car = app.car;
  if (!car.occupied) consider({ kind: 'car', x: car.x, z: car.z, name: 'car' }, 4.0, 'Drive the car');
  const t = app.train;
  if (t && t.state === 'dwell' && t.doorsOpen) {
    const carPos = t.cars[0].position;
    consider({ kind: 'train', x: carPos.x, z: carPos.z, name: 'train' }, 14, 'Board the train');
  }
  return best;
}

function interact() {
  if (app.mode === 'menu' || app.ui.panelOpen || app.ui.dialogOpen || app.ui.shopOpen) return;
  if (app.mode === 'interior') { interactInterior(); return; }
  if (app.mode === 'train') { if (app.train.state === 'dwell') leaveTrain(); else app.ui.toast('Wait until the train stops.'); return; }
  if (app.mode === 'car') { exitCar(); return; }
  const target = nearest;
  if (!target) return;
  if (target.kind === 'door') enterInterior(target.interior, target.name);
  else if (target.kind === 'npc') talkToNPC(target.npc);
  else if (target.kind === 'car') enterCar();
  else if (target.kind === 'train') boardTrain();
  else if (target.kind === 'station') stationInfo(target.station);
}

function talkToNPC(npc) {
  app.ui.showDialog({
    speaker: `${npc.name} · ${npc.role}`,
    text: npc.line,
    choices: [
      { label: 'Ask about Dudelange', action: () => app.ui.toast(app.world.meta.facts[Math.floor(Math.random() * app.world.meta.facts.length)]) },
      { label: 'Goodbye' }
    ]
  });
  app.audio.ui();
}

function stationInfo(station) {
  const t = app.train;
  const next = t.stations.filter((s) => Math.abs(s.chainage - t.dist) > 40);
  const eta = (s) => Math.max(1, Math.round(Math.abs(s.chainage - t.dist) / 12));
  app.ui.openPanel(station.name, `
    <p style="font-family:system-ui;font-size:13px;color:rgba(244,239,227,.75);max-width:560px">
      Stop ${station.id === 'burange' ? 'north of town by Stade J.F. Kennedy' :
        station.id === 'ville' ? 'by Avenue Grande-Duchesse Charlotte, the main town stop' :
        station.id === 'centre' ? 'on Rue de l’Étang, closest to the town hall' :
        'on the works site, the last stop before France'}.
      Line 60a continues to Bettembourg (north) and Volmerange-les-Mines (FR, south).
    </p>
    <h3 style="font:600 11px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#e9c46a;margin:22px 0 8px">Live departures</h3>
    <div style="font-family:system-ui;font-size:13px;display:grid;gap:8px">
      ${next.slice(0, 4).map((s) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(244,239,227,.1);padding-bottom:6px">
        <span>${s.name}</span><span style="color:#e9c46a">~${eta(s)} min · platform ${s.platforms - 1}</span></div>`).join('')}
    </div>
    <p class="small" style="margin-top:18px">The train is currently ${t.state === 'dwell' ? 'standing at ' + (t.stations[t.nextStop] ? t.stations[t.nextStop].name : 'the terminus') : 'running between stops'}.</p>
  `);
}

/* ---------------------------------------------------------------- vehicles */
function enterCar() {
  const p = app.player;
  app.car.occupied = true;
  app.mode = 'car';
  app.ui.showSpeed(0);
  app.audio.engine(true);
  p.x = app.car.x;
  p.z = app.car.z;
  playerObj.visible = false;
  app.ui.toast('Car — W/S throttle and brake, A/D steer, F to get out.');
}

function exitCar() {
  const c = app.car;
  const side = { x: Math.sin(c.rot) * 2.2, z: Math.cos(c.rot) * 2.2 };
  app.player.x = c.x + side.x;
  app.player.z = c.z + side.z;
  app.player.y = terrainHeight(app.player.x, app.player.z);
  c.occupied = false;
  c.speed = 0;
  app.mode = 'foot';
  app.ui.showSpeed(null);
  app.audio.engine(false);
  playerObj.visible = true;
}

function updateCar(dt) {
  const c = app.car;
  const p = app.player;
  if (app.mode !== 'car') {
    c.group.position.set(c.x, c.y, c.z);
    c.group.rotation.y = c.rot;
    return;
  }
  const throttle = app.keys.KeyW ? 1 : 0;
  const brake = app.keys.KeyS ? 1 : 0;
  const steer = (app.keys.KeyA ? 1 : 0) - (app.keys.KeyD ? 1 : 0);
  const maxSpeed = brake ? -7 : throttle ? 24 : 0;
  const accel = throttle ? 10 : brake ? 14 : 6;
  if (c.speed < maxSpeed) c.speed = Math.min(maxSpeed, c.speed + accel * dt);
  else if (c.speed > maxSpeed) c.speed = Math.max(maxSpeed, c.speed - accel * dt);
  if (!throttle && !brake) c.speed = lerp(c.speed, 0, dt * 1.4);

  if (Math.abs(c.speed) > 0.2) {
    c.rot += steer * dt * clamp(Math.abs(c.speed) / 12, 0.3, 1.6) * Math.sign(c.speed);
  }
  const nx = c.x + Math.cos(c.rot) * c.speed * dt;
  const nz = c.z - Math.sin(c.rot) * c.speed * dt;
  const solved = resolveCollisions(app.world, nx, nz, 1.0);
  if (Math.hypot(solved.x - nx, solved.z - nz) > 0.01) c.speed *= 0.35;
  c.x = solved.x;
  c.z = solved.z;
  c.y = terrainHeight(c.x, c.z);
  const ahead = terrainHeight(c.x + Math.cos(c.rot) * 3, c.z - Math.sin(c.rot) * 3);
  const behind = terrainHeight(c.x - Math.cos(c.rot) * 3, c.z + Math.sin(c.rot) * 3);
  const pitch = -Math.atan2(ahead - behind, 6);
  c.group.position.set(c.x, c.y + 0.06, c.z);
  c.group.rotation.set(pitch * 0.7, c.rot, 0, 'YXZ');
  c.wheels.forEach((w) => { w.rotation.x += c.speed * dt * 3; });
  p.x = c.x; p.z = c.z; p.y = c.y;
  app.ui.showSpeed(Math.abs(c.speed) * 3.6);
  app.audio.enginePitch(Math.abs(c.speed));
  p.yaw = c.rot;
}

/* --------------------------------------------------------------- interiors */
let interiorState = null;

function enterInterior(id, name) {
  const spec = INTERIORS[id];
  if (!spec) { app.ui.toast('That door is locked.'); return; }
  app.audio.door();
  app.ui.flash();
  app.interior = { id, spec };
  app.mode = 'interior';
  app.savedPos = { x: app.player.x, z: app.player.z, rot: app.player.rot };
  const room = buildInterior(spec, name);
  interiorState = room;
  app.scene = room.scene;
  app.scene.add(playerObj);
  app.camera.position.set(0, 3, 6);
  app.player.x = spec.layout.playerAt.x;
  app.player.z = spec.layout.playerAt.z;
  app.player.y = 0;
  app.player.rot = spec.layout.playerAt.rot || Math.PI;
  app.player.yaw = app.player.rot;
  playerObj.visible = true;
  playerObj.position.set(app.player.x, 0, app.player.z);
  app.ui.prompt(null);
  questEvent('interior', id);
  if (spec.kind === 'shop') {
    app.ui.toast(`${spec.shop.title} — walk to the till and press E to shop.`);
  } else if (spec.kind === 'restaurant') {
    app.ui.toast(`${spec.npc.name}'s place — press E at the bar to order.`);
  } else if (spec.kind === 'station') {
    app.ui.toast('Station hall — press E at the desk for timetables.');
  } else if (id === 'rolling_mill') {
    app.ui.toast('The 600 m rolling mill. The roof is gone; the steel stayed.');
  } else if (id === 'cna') {
    app.ui.toast('CNA gallery — press E in front of a photograph to look closer.');
  }
}

function exitInterior() {
  app.audio.door();
  app.ui.flash();
  app.mode = 'foot';
  app.interior = null;
  app.scene = interiorState.scene;
  const mainScene = app.town.group.parent;
  app.scene = mainScene;
  mainScene.add(playerObj);
  app.scene.add(rainPoints);
  app.player.x = app.savedPos.x + 1.2;
  app.player.z = app.savedPos.z + 1.2;
  app.player.y = terrainHeight(app.player.x, app.player.z);
  app.player.yaw = app.savedPos.rot;
  playerObj.visible = true;
  app.player.camDist = 7;
  app.ui.closeShop();
  app.ui.prompt(null);
  if (interiorState && interiorState.dispose) interiorState.dispose();
  interiorState = null;
}

function buildInterior(spec, name) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1216);
  const { w, d, h } = spec.size;
  const g = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({ color: spec.palette.floor, roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ color: spec.palette.wall, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: spec.palette.accent, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: spec.palette.shelf, roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  g.add(floor);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), new THREE.MeshStandardMaterial({ color: '#e9e5da', roughness: 1 }));
  ceiling.position.y = h;
  g.add(ceiling);
  const walls = [
    [w, h, 0.24, 0, h / 2, -d / 2],
    [w, h, 0.24, 0, h / 2, d / 2],
    [0.24, h, d, -w / 2, h / 2, 0],
    [0.24, h, d, w / 2, h / 2, 0]
  ];
  for (const [bw, bh, bd, bx, by, bz] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat);
    wall.position.set(bx, by, bz);
    wall.receiveShadow = true;
    g.add(wall);
  }
  // skirting
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.12, d - 0.4), accentMat);
  skirt.position.y = 0.06;
  g.add(skirt);

  const colliders = [];
  const addBox = (bw, bh, bd, bx, by, bz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(bx, by, bz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const L = spec.layout || {};
  for (const s of L.shelves || []) {
    addBox(s.w, 1.9, s.d, s.x, 0.95, s.z, woodMat);
    for (let i = 0; i < 3; i++) {
      const p = addBox(s.w * 0.9, 0.08, s.d * 0.94, s.x, 0.55 + i * 0.55, s.z, accentMat);
      p.material = new THREE.MeshStandardMaterial({ color: ['#d9c7a7', '#cbb894', '#e0d2b8'][i], roughness: 0.9 });
      // products
      for (let k = 0; k < 5; k++) {
        const prod = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.22),
          new THREE.MeshStandardMaterial({ color: ['#b23a48', '#2a9d8f', '#e9c46a', '#457b9d', '#e07a3f'][(i + k) % 5], roughness: 0.7 }));
        prod.position.set(s.x - s.w / 2 + 0.3 + k * (s.w - 0.6) / 4, 0.75 + i * 0.55, s.z + (s.d / 2 - 0.35) * (k % 2 ? 1 : -1));
        g.add(prod);
      }
    }
    colliders.push({ x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2 });
  }
  for (const c of L.counters || []) {
    addBox(c.w, 1.05, c.d, c.x, 0.52, c.z, woodMat);
    addBox(c.w + 0.1, 0.06, c.d + 0.1, c.x, 1.06, c.z, accentMat);
    const till = addBox(0.5, 0.35, 0.4, c.x + c.w / 2 - 0.7, 1.25, c.z, new THREE.MeshStandardMaterial({ color: 0x2b2f33 }));
    colliders.push({ x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2 });
  }
  for (const f of L.fridges || []) {
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3ee, transparent: true, opacity: 0.35, roughness: 0.1 });
    addBox(f.w, 2.4, f.d, f.x, 1.2, f.z, glass);
    const inner = addBox(f.w - 0.2, 2.1, f.d - 0.2, f.x, 1.2, f.z, new THREE.MeshStandardMaterial({ color: 0xf2f6f4, emissive: 0x9fd7e8, emissiveIntensity: 0.5 }));
    colliders.push({ x: f.x, z: f.z, hw: f.w / 2, hd: f.d / 2 });
  }
  for (const c of L.crates || []) {
    addBox(c.w, 1.1, c.d, c.x, 0.55, c.z, new THREE.MeshStandardMaterial({ color: 0x9c7a52 }));
    colliders.push({ x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2 });
  }
  for (const p of L.plants || []) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x8b5e3c }));
    pot.position.set(p.x, 0.25, p.z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0x3f6b3a, flatShading: true }));
    leaves.position.set(p.x, 0.95, p.z);
    g.add(pot, leaves);
  }
  for (const t of L.tables || []) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), woodMat);
    top.position.set(t.x, 0.75, t.z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 6), accentMat);
    leg.position.set(t.x, 0.38, t.z);
    g.add(top, leg);
    for (const [cx, cz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), accentMat);
      chair.position.set(t.x + cx, 0.45, t.z + cz);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), accentMat);
      back.position.set(t.x + cx * 1.25, 0.7, t.z + cz * 1.25);
      g.add(chair, back);
    }
    colliders.push({ x: t.x, z: t.z, hw: 0.7, hd: 0.7 });
  }
  if (L.bar) {
    addBox(L.bar.w, 1.1, L.bar.d, L.bar.x, 0.55, L.bar.z, woodMat);
    addBox(L.bar.w + 0.2, 0.08, L.bar.d + 0.2, L.bar.x, 1.14, L.bar.z, accentMat);
    for (let i = 0; i < 5; i++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), new THREE.MeshStandardMaterial({ color: [0x3f6b3a, 0x7a3b1f, 0xb08d57][i % 3], metalness: 0.2 }));
      bottle.position.set(L.bar.x - 0.3, 1.32, L.bar.z - 1.2 + i * 0.6);
      g.add(bottle);
    }
    colliders.push({ x: L.bar.x, z: L.bar.z, hw: L.bar.w / 2, hd: L.bar.d / 2 });
  }
  if (L.kitchen) addBox(L.kitchen.w, 1.0, L.kitchen.d, L.kitchen.x, 0.5, L.kitchen.z, new THREE.MeshStandardMaterial({ color: 0x9aa0a1, metalness: 0.5, roughness: 0.4 }));
  if (L.desk) {
    addBox(L.desk.w, 1.05, L.desk.d, L.desk.x, 0.52, L.desk.z, woodMat);
    colliders.push({ x: L.desk.x, z: L.desk.z, hw: L.desk.w / 2, hd: L.desk.d / 2 });
  }
  for (const b of L.benches || []) {
    addBox(4.6, 0.14, 0.55, b.x, 0.5, b.z, woodMat);
    addBox(0.2, 0.5, 0.5, b.x - 1.8, 0.25, b.z, accentMat);
    addBox(0.2, 0.5, 0.5, b.x + 1.8, 0.25, b.z, accentMat);
    colliders.push({ x: b.x, z: b.z, hw: 2.3, hd: 0.35 });
  }
  for (const p of L.pews || []) {
    addBox(p.w, 0.9, p.d, p.x, 0.45, p.z, woodMat);
    colliders.push({ x: p.x, z: p.z, hw: p.w / 2, hd: p.d / 2 });
  }
  if (L.altar) addBox(L.altar.w, 1.0, L.altar.d, L.altar.x, 0.5, L.altar.z, new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.8 }));
  for (const p of L.paintings || []) {
    const art = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.6), new THREE.MeshStandardMaterial({ map: TEX.poster(paintingSeed(p.art || 'photo')), roughness: 0.8 }));
    art.position.set(p.x, Math.min(h - 2.4, 3.4), p.z);
    art.rotation.y = p.z < 0 ? 0 : Math.PI;
    g.add(art);
  }
  for (const s of L.sofas || []) {
    addBox(2.4, 0.7, 1.0, s.x, 0.35, s.z, new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.95 }));
    addBox(2.4, 0.7, 0.24, s.x, 0.75, s.z - 0.38, new THREE.MeshStandardMaterial({ color: 0x7a4d3a }));
    colliders.push({ x: s.x, z: s.z, hw: 1.2, hd: 0.6 });
  }
  if (L.ticketMachine) {
    addBox(0.7, 1.8, 0.5, L.ticketMachine.x, 0.9, L.ticketMachine.z, new THREE.MeshStandardMaterial({ color: 0x1d3557 }));
    const screen = addBox(0.5, 0.4, 0.04, L.ticketMachine.x, 1.35, L.ticketMachine.z + 0.27, new THREE.MeshStandardMaterial({ color: 0x8fd3e8, emissive: 0x2d7f9a, emissiveIntensity: 0.6 }));
    colliders.push({ x: L.ticketMachine.x, z: L.ticketMachine.z, hw: 0.4, hd: 0.3 });
  }
  for (const gt of L.gantries || []) {
    for (const side of [-1, 1]) {
      const col = addBox(0.5, h, 0.5, side * (w / 2 - 3), h / 2, gt.z, new THREE.MeshStandardMaterial({ color: 0x7e6a56, metalness: 0.5, roughness: 0.6 }));
      col.castShadow = true;
    }
    addBox(w - 3, 0.5, 0.6, 0, h - 1, gt.z, new THREE.MeshStandardMaterial({ color: 0x8a4b32, metalness: 0.4, roughness: 0.7 }));
  }
  if (L.skate) {
    const ramp = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 1.2, 14, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb9b4a8, roughness: 0.9 }));
    ramp.position.set(L.skate.x, 0.6, L.skate.z);
    ramp.rotation.z = Math.PI;
    g.add(ramp);
  }
  // exit door
  const exit = L.exitAt || { x: 0, z: d / 2 - 0.4 };
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), new THREE.MeshStandardMaterial({ map: TEX.door(), roughness: 0.7 }));
  door.position.set(exit.x, 1.4, exit.z + (exit.z > 0 ? -0.12 : 0.12));
  door.rotation.y = exit.z > 0 ? Math.PI : 0;
  g.add(door);
  const exitLight = new THREE.PointLight(0xffe0a0, 6, 8);
  exitLight.position.set(exit.x, 2.6, exit.z - Math.sign(exit.z) * 1.5);
  g.add(exitLight);

  // lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8b7a63, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.PointLight(0xfff0d0, 12, Math.max(w, d) * 0.85);
    lamp.position.set(-w / 4 + (i % 2) * w / 2, h - 0.7, -d / 4 + Math.floor(i / 2) * d / 2);
    scene.add(lamp);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0cc, emissiveIntensity: 1.3 }));
    panel.position.copy(lamp.position);
    panel.position.y = h - 0.22;
    panel.rotation.x = Math.PI / 2;
    g.add(panel);
  }
  scene.add(g);

  // NPC
  const npc = makePerson({ shirt: spec.npc.look.shirt, hair: spec.npc.look.hair, skin: spec.npc.look.skin, pants: '#2f3336' });
  const npcAt = L.npcAt || { x: 0, z: -d / 2 + 2, rot: 0 };
  npc.group.position.set(npcAt.x, 0, npcAt.z);
  npc.group.rotation.y = npcAt.rot || 0;
  scene.add(npc.group);

  return {
    scene,
    spec,
    colliders,
    npc,
    npcPos: { x: npcAt.x, z: npcAt.z },
    exitAt: exit,
    bounds: { w, d, h },
    dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  };
}

function paintingSeed(kind) {
  return kind.split('').reduce((a, c) => a + c.charCodeAt(0), 7) * 13;
}

function interactInterior() {
  const spec = interiorState.spec;
  const L = spec.layout;
  const p = app.player;
  const npcD = Math.hypot(L.npcAt.x - p.x, L.npcAt.z - p.z);
  const exitD = Math.hypot(L.exitAt.x - p.x, L.exitAt.z - p.z);
  if (exitD < 2.4) { exitInterior(); return; }
  if (npcD < 3.2) {
    if (spec.kind === 'shop') openShopUI();
    else if (spec.kind === 'restaurant') openMenuUI();
    else if (spec.kind === 'station') { app.ui.showDialog({ speaker: spec.npc.name, text: spec.npc.line, choices: [{ label: 'Timetable', action: () => stationInfo(app.train.stations[0]) }, { label: 'Thanks' }] }); }
    else if (spec.id === 'cna') { app.ui.showDialog({ speaker: spec.npc.name, text: spec.npc.line, choices: [{ label: 'Look at the photographs', action: () => app.ui.toast('Steel, hands, smoke, and a mill that is now a museum.') }, { label: 'Leave' }] }); }
    else app.ui.showDialog({ speaker: spec.npc.name, text: spec.npc.line, choices: [{ label: 'Thanks' }] });
    return;
  }
  // paintings
  for (const art of L.paintings || []) {
    if (Math.hypot(art.x - p.x, art.z - p.z) < 3) {
      app.ui.showDialog({
        speaker: 'Photograph',
        text: ['The mill in 1962 — the last furnace still lit.', 'Families on the steps of Saint-Martin, 1954.', 'Italian workers arriving at the station, 1926.', 'The valley before the works, from Mont Saint-Jean.'][Math.floor(Math.random() * 4)],
        choices: [{ label: 'Step back' }]
      });
      return;
    }
  }
  if (spec.id === 'rolling_mill') {
    if (Math.hypot(4 - p.x, 34 - p.z) < 8) { app.ui.toast('Skate bowls under the gantry crane. Concrete on steel.'); return; }
  }
}

function openShopUI() {
  const spec = interiorState.spec;
  app.ui.openShop(spec.shop, () => app.player.money, (cart, total) => {
    app.player.money -= total;
    for (const line of cart) {
      const found = app.player.inventory.find((i) => i.id === line.id);
      if (found) found.qty += line.qty; else app.player.inventory.push({ ...line });
    }
    app.audio.buy();
    app.ui.setMoney(app.player.money);
    app.ui.setTradeMoney(app.player.money);
    app.ui.toast(`Paid €${total.toFixed(2)} — merci!`, 'good');
    checkGroceries();
    updateObjective();
    saveGame();
  });
}

function openMenuUI() {
  const spec = interiorState.spec;
  if (!spec.shop || !spec.shop.items) return;
  app.ui.openShop({ ...spec.shop, items: spec.shop.items.map((i) => ({ ...i, cat: i.cat, desc: i.desc })) }, () => app.player.money, (cart, total) => {
    app.player.money -= total;
    app.audio.buy();
    app.ui.setMoney(app.player.money);
    app.ui.setTradeMoney(app.player.money);
    app.ui.toast(`Order taken: €${total.toFixed(2)}. It will be on the table.`, 'good');
    if (cart.some((c) => c.price * c.qty >= 10)) questEvent('dish');
    updateObjective();
    saveGame();
  });
}

function checkGroceries() {
  const need = ['bread', 'milk', 'kachkeis'];
  const have = need.every((id) => app.player.inventory.some((i) => i.id === id && i.qty > 0));
  if (have) completeQuest('groceries');
}

/* ---------------------------------------------------------------- weather */
let rainPoints = null;

function setupRain() {
  const count = 5000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 120;
    pos[i * 3 + 1] = Math.random() * 60;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xbfd3dd, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false });
  rainPoints = new THREE.Points(geo, mat);
  rainPoints.visible = false;
  rainPoints.frustumCulled = false;
  app.scene.add(rainPoints);
}

function updateRain(dt) {
  if (!rainPoints) return;
  rainPoints.visible = app.weather === 'rain';
  if (!rainPoints.visible) return;
  rainPoints.position.set(app.player.x, app.player.y, app.player.z);
  const pos = rainPoints.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) - dt * 26;
    if (y < 0) { y = 55 + Math.random() * 8; pos.setX(i, (Math.random() - 0.5) * 120); pos.setZ(i, (Math.random() - 0.5) * 120); }
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
}

function setWeather(kind, announce = true) {
  app.weather = kind;
  app.town.setWeather(kind);
  app.audio.setWeather(kind);
  if (announce) {
    const label = { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', fog: 'Fog' }[kind];
    app.ui.toast(`Weather: ${label.toLowerCase()} over the Minett.`);
  }
}

/* ------------------------------------------------------------------- loop */
let hudTick = 0;
let lastDistrict = '';

function frame() {
  const dt = Math.min(0.05, app.clock.getDelta());
  const t = performance.now() / 1000;

  if (app.mode !== 'menu') {
    app.time += dt * 0.55;
    if (app.time > 1440) app.time -= 1440;
    updateDaylight();
  }
  updatePlayer(dt, t);
  updateCar(dt);
  updateTrain(dt);
  updateTraffic(dt);
  updateNPCs(t);
  updateRain(dt);

  app.town.update(t, dt, app.player);
  const sky = app.town.sky;
  if (app.mode !== 'interior') {
    sky.update(dt, t, new THREE.Vector3(app.player.x, app.player.y + 2, app.player.z));
    app.scene.fog.color.copy(sky.uniforms.bottom.value).lerp(new THREE.Color(0xffffff), 0.1);
    app.scene.fog.near = app.weather === 'fog' ? 30 : 280;
    app.scene.fog.far = app.weather === 'fog' ? 420 : app.weather === 'rain' ? 1500 : 2900;
  }

  updateCamera(dt);

  // UI tick
  hudTick += dt;
  if (hudTick > 0.1) {
    hudTick = 0;
    updateHUD();
    app.ui.updateMinimap(app.player, app.player.yaw);
    nearest = app.mode === 'foot' ? findInteractable() : null;
    app.ui.prompt(nearest && app.mode === 'foot' ? nearest.prompt : null);
    if (app.mode === 'interior' && interiorState) {
      const L = interiorState.spec.layout;
      const dExit = Math.hypot(L.exitAt.x - app.player.x, L.exitAt.z - app.player.z);
      const dNpc = Math.hypot(L.npcAt.x - app.player.x, L.npcAt.z - app.player.z);
      if (dExit < 2.6) app.ui.prompt('Leave the building');
      else if (dNpc < 3.4) {
        const kind = interiorState.spec.kind;
        app.ui.prompt(kind === 'shop' ? 'Open the till' : kind === 'restaurant' ? 'Order at the bar' : 'Talk');
      } else app.ui.prompt(null);
    }
    if (app.mode === 'train' && app.train.state === 'dwell' && app.train.doorsOpen) app.ui.prompt('Step off the train');
    if (app.mode === 'car') app.ui.prompt('F — get out of the car');
    checkProximity();
    pollAgents(false);
  }

  if (app.scene && app.camera) app.renderer.render(app.scene, app.camera);
}

function updateDaylight() {
  const minutes = app.time;
  const angle = (minutes / 1440) * Math.PI * 2 - Math.PI / 2;
  const sun = { x: Math.cos(angle) * 0.85, y: Math.sin(angle), z: 0.42 };
  app.town.sky.sunDir.set(sun.x, sun.y, sun.z);
  app.town.sky.uniforms.sunDir.value.set(sun.x, sun.y, sun.z);
  const night = clamp((0.06 - sun.y) * 5.2, 0, 1);
  app.night = night;
  app.town.setNight(night);
  const dusk = clamp(1 - Math.abs(sun.y) * 4, 0, 1);
  const warm = new THREE.Color(0xffb066);
  const day = new THREE.Color(0xfff2cf);
  app.town.sky.uniforms.sunColor.value.copy(day).lerp(warm, dusk);
  app.town.sky.uniforms.top.value.setHSL(0.58, 0.38, lerp(0.5, 0.05, night));
  app.town.sky.uniforms.bottom.value.setHSL(0.56, 0.3, lerp(0.82, 0.09, night));
}

function updatePlayer(dt, t) {
  const p = app.player;
  if (app.mode === 'menu' || app.mode === 'train' || app.mode === 'car') {
    if (app.mode === 'train') {
      const t2 = app.train;
      p.x = t2.cars[0].position.x; p.z = t2.cars[0].position.z;
      p.y = t2.cars[0].position.y;
      if (t2.travelled - (t2.lastTravelled || 0) > 0) { /* noop */ }
      if (t2.boarded && t2.travelled - (t2.boardedTravelled || 0) > 500) completeQuest('ride');
    }
    return;
  }
  if (app.mode === 'interior') {
    const speed = 3.4;
    let mx = 0, mz = 0;
    if (app.keys.KeyW) mz += 1;
    if (app.keys.KeyS) mz -= 1;
    if (app.keys.KeyA) mx -= 1;
    if (app.keys.KeyD) mx += 1;
    const len = Math.hypot(mx, mz) || 1;
    const yaw = p.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let nx = p.x + (fx * mz / len + rx * mx / len) * speed * dt;
    let nz = p.z + (fz * mz / len + rz * mx / len) * speed * dt;
    const b = interiorState.bounds;
    nx = clamp(nx, -b.w / 2 + 0.7, b.w / 2 - 0.7);
    nz = clamp(nz, -b.d / 2 + 0.7, b.d / 2 - 0.7);
    for (const c of interiorState.colliders) {
      if (Math.abs(nx - c.x) < c.hw + 0.35 && Math.abs(nz - c.z) < c.hd + 0.35) {
        const ox = c.hw + 0.35 - Math.abs(nx - c.x);
        const oz = c.hd + 0.35 - Math.abs(nz - c.z);
        if (ox < oz) nx += Math.sign(nx - c.x || 1) * ox;
        else nz += Math.sign(nz - c.z || 1) * oz;
      }
    }
    p.x = nx; p.z = nz; p.y = 0;
    p.speed = (mx || mz) ? speed : 0;
    p.rot = yaw;
    playerObj.position.set(p.x, 0, p.z);
    playerObj.rotation.y = yaw;
    playerObj.visible = true;
    playerParts.animate(t, p.speed);
    return;
  }
  // first/third person on the map
  const sprint = app.keys.ShiftLeft || app.keys.ShiftRight;
  const canSprint = p.stamina > 2;
  const speed = sprint && canSprint ? 8.4 : 4.3;
  if (sprint && canSprint) p.stamina = Math.max(0, p.stamina - dt * 13);
  else p.stamina = Math.min(100, p.stamina + dt * 9);

  let mx = 0, mz = 0;
  if (app.keys.KeyW) mz += 1;
  if (app.keys.KeyS) mz -= 1;
  if (app.keys.KeyA) mx -= 1;
  if (app.keys.KeyD) mx += 1;
  const moving = mx || mz;
  const len = Math.hypot(mx, mz) || 1;
  const yaw = p.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const vx = (fx * mz / len + rx * mx / len);
  const vz = (fz * mz / len + rz * mx / len);
  let nx = p.x + vx * speed * dt;
  let nz = p.z + vz * speed * dt;

  if (moving) p.rot = Math.atan2(vx, vz);
  const solved = resolveCollisions(app.world, nx, nz, 0.42);
  nx = solved.x; nz = solved.z;
  // world bounds
  nx = clamp(nx, -3200, 3200);
  nz = clamp(nz, -3200, 3200);
  const moved = Math.hypot(nx - p.x, nz - p.z);
  p.distance += moved;
  p.x = nx; p.z = nz;

  const ground = terrainHeight(p.x, p.z);
  p.vy -= 19 * dt;
  p.y += p.vy * dt;
  if (p.y <= ground) { p.y = ground; p.vy = 0; p.grounded = true; }
  else p.grounded = false;
  if (app.keys.Space && p.grounded) { p.vy = 6.4; p.grounded = false; }

  p.speed = moving ? speed : 0;
  playerObj.position.set(p.x, p.y, p.z);
  playerObj.rotation.y = p.rot;
  playerParts.animate(t, p.speed);
  // footsteps
  if (moving && p.grounded && t - p.lastStep > (sprint ? 0.28 : 0.44)) {
    p.lastStep = t;
    app.audio.step(Math.random() < 0.3 ? 'grass' : 'paving');
  }
}

function updateCamera(dt) {
  const cam = app.camera;
  const p = app.player;
  if (app.mode === 'interior') {
    const yaw = p.yaw;
    const dist = 5.2;
    const target = new THREE.Vector3(p.x, 1.5, p.z);
    const desired = new THREE.Vector3(
      p.x - Math.sin(yaw) * dist,
      1.5 + Math.sin(p.pitch) * dist + 1.4,
      p.z - Math.cos(yaw) * dist
    );
    cam.position.lerp(desired, clamp(dt * 7, 0, 1));
    cam.lookAt(target);
    return;
  }
  if (app.mode === 'train' && app.train) {
    const car = app.train.cars[0];
    const at = polylineAt(app.train.railPts, clamp(app.train.dist, 0, app.train.total));
    const behind = polylineAt(app.train.railPts, clamp(app.train.dist - 18, 0, app.train.total));
    cam.position.lerp(new THREE.Vector3(behind.x, terrainHeight(behind.x, behind.z) + 11, behind.z), clamp(dt * 2.2, 0, 1));
    cam.lookAt(new THREE.Vector3(at.x, terrainHeight(at.x, at.z) + 4, at.z));
    return;
  }
  if (app.mode === 'car') {
    const c = app.car;
    const back = 8.5;
    const desired = new THREE.Vector3(
      c.x - Math.cos(c.rot) * back,
      c.y + 4.4,
      c.z + Math.sin(c.rot) * back
    );
    const ground = terrainHeight(desired.x, desired.z) + 1.4;
    if (desired.y < ground) desired.y = ground;
    cam.position.lerp(desired, clamp(dt * 5.5, 0, 1));
    cam.lookAt(new THREE.Vector3(c.x + Math.cos(c.rot) * 8, c.y + 1.8, c.z - Math.sin(c.rot) * 8));
    return;
  }
  const yaw = p.yaw, pitch = p.pitch;
  const dist = p.camDist || 7.2;
  const target = new THREE.Vector3(p.x, p.y + 1.7, p.z);
  const desired = new THREE.Vector3(
    p.x - Math.sin(yaw) * Math.cos(pitch) * dist,
    p.y + 1.7 + Math.sin(pitch) * dist + 1.2,
    p.z - Math.cos(yaw) * Math.cos(pitch) * dist
  );
  const ground = terrainHeight(desired.x, desired.z) + 0.9;
  if (desired.y < ground) desired.y = ground;
  cam.position.lerp(desired, clamp(dt * 9, 0, 1));
  cam.lookAt(target);
}

function updateTraffic(dt) {
  for (const c of app.traffic || []) {
    c.dist += c.speed * dt * c.dir;
    if (c.dist > c.length) { c.dist = 0; }
    if (c.dist < 0) { c.dist = c.length; }
    const at = polylineAt(c.samples, c.dist);
    const side = 1.5;
    const x = at.x + Math.cos(at.angle) * side;
    const z = at.z - Math.sin(at.angle) * side;
    c.group.position.set(x, terrainHeight(x, z) + 0.05, z);
    c.group.rotation.y = at.angle + (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    c.wheels.forEach((w) => { w.rotation.x += c.speed * dt * 3; });
  }
}

function updateNPCs(t) {
  for (const n of app.npcs) {
    n.person.animate(t + n.x, 0);
    // face the player when close
    const d = Math.hypot(app.player.x - n.x, app.player.z - n.z);
    if (d < 6) {
      const target = Math.atan2(app.player.x - n.x, app.player.z - n.z);
      n.person.group.rotation.y = lerp(n.person.group.rotation.y, target, 0.05);
    }
  }
}

function updateHUD(force = false) {
  const p = app.player;
  const ll = unproject(p.x, p.z);
  const district = app.world.functions.districtAt(p.x, p.z);
  const d = app.world.districts.find((x) => x.id === district);
  if (force || district !== lastDistrict) {
    lastDistrict = district;
    app.ui.setDistrict(d ? d.name : 'Countryside', d ? d.blurb.slice(0, 60) : 'Fields and forest', !force);
  }
  const hours = Math.floor(app.time / 60) % 24;
  const weatherLabel = { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', fog: 'Fog' }[app.weather] || 'Clear';
  const temp = Math.round(13 - app.night * 7 + (app.weather === 'rain' ? -2 : 0));
  app.ui.setClock(app.time, weatherLabel, temp);
  app.ui.setCoords(ll.lat, ll.lon);
  app.ui.compass(p.yaw * 180 / Math.PI);
  app.ui.setMoney(p.money);
  app.ui.setXP(p.xp, p.level);
}

function checkProximity() {
  const p = app.player;
  for (const s of app.world.rail.stations) {
    if (Math.hypot(p.x - s.x, p.z - s.z) < 24) {
      if (!p.visitedStations.has(s.id)) {
        p.visitedStations.add(s.id);
        if (p.visitedStations.size >= 4) completeQuest('stations');
        else app.ui.toast(`${s.name} visited — ${p.visitedStations.size}/4 stations`, 'good');
      }
    }
  }
  if (Math.hypot(p.x - project(49.49002, 6.06057).x, p.z - project(49.49002, 6.06057).z) < 26) questEvent('summit');

  // auto-save
  app.saveTimer += 0.1;
  if (app.saveTimer > 30) { app.saveTimer = 0; saveGame(); }
}

/* ------------------------------------------------------------------- save */
function playerId() {
  let id = localStorage.getItem('diddeleng:pid');
  if (!id) {
    id = 'p' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('diddeleng:pid', id);
  }
  return id;
}

function saveGame(silent = true) {
  const p = app.player;
  const state = {
    v: 1,
    x: p.x, z: p.z, rot: p.rot, money: p.money, xp: p.xp, level: p.level,
    time: app.time, weather: app.weather,
    inventory: p.inventory,
    questsDone: app.quests.filter((q) => q.done).map((q) => q.id),
    stations: [...p.visitedStations],
    distance: p.distance,
    at: new Date().toISOString()
  };
  fetch(`/api/save/${playerId()}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state)
  }).then(() => { if (!silent) app.ui.toast('Progress saved.', 'good'); })
    .catch(() => { /* offline is fine */ });
}

async function loadSave() {
  try {
    const res = await fetch(`/api/save/${playerId()}`);
    if (!res.ok) return;
    const s = await res.json();
    if (!s || !s.state) return;
    const p = app.player;
    if (Number.isFinite(s.state.x)) { p.x = s.state.x; p.z = s.state.z; p.rot = s.state.rot || p.rot; p.y = terrainHeight?.(p.x, p.z) ?? p.y; }
    p.money = s.state.money ?? p.money;
    p.xp = s.state.xp ?? 0;
    p.level = s.state.level ?? 1;
    p.inventory = s.state.inventory || [];
    p.distance = s.state.distance || 0;
    p.visitedStations = new Set(s.state.stations || []);
    app.time = s.state.time ?? app.time;
    for (const id of s.state.questsDone || []) {
      const q = app.quests.find((x) => x.id === id);
      if (q) q.done = true;
    }
    app.ui.toast('Save loaded — welcome back to Diddeleng.', 'good');
  } catch (e) { /* no save yet */ }
}

function openPause() {
  app.ui.openPanel('Paused', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;font-family:system-ui;font-size:13px;line-height:1.7;color:rgba(244,239,227,.8)">
      <div>
        <h3 style="font:600 11px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#e9c46a;margin:0 0 10px">Diddeleng</h3>
        <p style="margin:0">A single-player open world built from real OpenStreetMap street geometry and EU-DEM elevations of Dudelange.</p>
        <p>${app.world.stats.buildings} buildings · ${app.world.stats.roads} streets · ${app.world.stats.roadKm} km of road · ${app.world.stats.stations} CFL stops · ${app.world.stats.trees} trees</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
          <button class="primary" id="resumeBtn" style="margin:0;padding:11px 18px">Resume</button>
          <button class="primary" id="saveBtn" style="margin:0;padding:11px 18px;background:rgba(233,196,106,.15);color:#f4efe3">Save</button>
          <button class="primary" id="mapBtn" style="margin:0;padding:11px 18px;background:rgba(233,196,106,.15);color:#f4efe3">Map</button>
          <button class="primary" id="agentsBtn" style="margin:0;padding:11px 18px;background:rgba(233,196,106,.15);color:#f4efe3">Build agents</button>
        </div>
      </div>
      <div>
        <h3 style="font:600 11px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#e9c46a;margin:0 0 10px">Controls</h3>
        <p style="margin:0">WASD — walk · Shift — sprint · Space — jump<br>E — interact / enter / shop · F — leave car<br>M — map · J — journal · P — build agents<br>Esc — pause · mouse — look · wheel — zoom</p>
        <h3 style="font:600 11px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#e9c46a;margin:18px 0 10px">Audio</h3>
        <input id="volume" type="range" min="0" max="1" step="0.05" value="0.5" style="width:100%" />
      </div>
    </div>`);
  if (document.exitPointerLock) document.exitPointerLock();
  el('resumeBtn').onclick = () => app.ui.closePanel();
  el('saveBtn').onclick = () => saveGame(false);
  el('mapBtn').onclick = () => app.ui.openMap(app.player, app.player.yaw);
  el('agentsBtn').onclick = () => app.ui.agents();
  el('volume').oninput = (e) => app.audio.setVolume(Number(e.target.value));
}

/* ------------------------------------------------------------ agent events */
let lastAgentPoll = 0;
async function pollAgents(force) {
  const now = performance.now();
  if (!force && now - lastAgentPoll < 12000) return;
  lastAgentPoll = now;
  try {
    const res = await fetch('/api/agents/events');
    if (!res.ok) return;
    const data = await res.json();
    for (const ev of data.events || []) {
      if (ev.id > app.lastAlertId) {
        app.lastAlertId = ev.id;
        if (ev.agent && ev.kind === 'done') app.ui.toast(`Build step — ${ev.agent}: ${ev.text}`, 'good');
      }
    }
  } catch (e) { /* server without pipeline */ }
}
