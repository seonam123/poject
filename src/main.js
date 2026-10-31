import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { buildRoom } from './room.js';
import { Game } from './game.js';

// ---------- 렌더러 / 씬 / 카메라 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f24);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(1.0, 1.6, 2.2); // 출입문 안쪽, 눈높이 1.6m

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.3, 1.0, -1.2);
controls.enableDamping = true;
controls.maxDistance = 4;
controls.update();

// VR 시작 위치(문 안쪽, 바닥 기준)
const XR_START = { x: 1.0, z: 2.2 };
const rig = scene; // 컨트롤러·패널은 월드 좌표에 둡니다

const { interactables } = buildRoom(scene);

// ---------- VR 안 피드백 패널 ----------
const panelCanvas = document.createElement('canvas');
panelCanvas.width = 1024; panelCanvas.height = 512;
const panelTex = new THREE.CanvasTexture(panelCanvas);
panelTex.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true }));
panel.position.set(0, 1.5, -1.2);
panel.visible = false;
rig.add(panel);

function wrap(g, text, x, y, maxW, lh) {
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) { g.fillText(line, x, y); line = ch; y += lh; }
    else line += ch;
  }
  g.fillText(line, x, y);
  return y + lh;
}

function drawPanel({ type, title, desc, rationale }) {
  const g = panelCanvas.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(17,24,39,0.92)'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = type === 'correct' ? '#22c55e' : type === 'wrong' ? '#ef4444' : '#60a5fa';
  g.fillRect(0, 0, 16, 512);
  g.fillStyle = '#ffffff'; g.font = 'bold 48px "Malgun Gothic", sans-serif';
  let y = wrap(g, (type === 'correct' ? '✔ ' : type === 'wrong' ? '✖ ' : '') + title, 48, 80, 930, 56);
  g.font = '34px "Malgun Gothic", sans-serif'; g.fillStyle = '#e5e7eb';
  y = wrap(g, desc || '', 48, y + 10, 930, 44);
  if (rationale) { g.fillStyle = '#fbbf24'; wrap(g, rationale, 48, y + 10, 930, 44); }
  panelTex.needsUpdate = true;
  panel.visible = renderer.xr.isPresenting; // PC에서는 HTML 카드만 사용
}

// ---------- 게임 / HTML 피드백 ----------
const fbEl = document.getElementById('feedback');
let fbTimer;
const game = new Game({
  onFeedback(f) {
    fbEl.className = f.type;
    fbEl.innerHTML = `<h3>${f.type === 'correct' ? '✔' : '✖'} ${f.title}</h3><div>${f.desc}</div>` +
      (f.rationale ? `<div style="margin-top:6px;color:#fbbf24">${f.rationale}</div>` : '') +
      (f.ref ? `<div class="ref">근거: ${f.ref}</div>` : '');
    clearTimeout(fbTimer);
    fbTimer = setTimeout(() => fbEl.classList.add('hidden'), 9000);
    if (renderer.xr.isPresenting) placePanelInView();
    drawPanel(f);
  },
  onFinish(r) {
    const el = document.getElementById('result');
    el.innerHTML = `<div class="card"><h2>결과</h2>
      <p>발견 ${r.found}/${r.total} · 오답 ${r.wrong} · ${r.timeSec}초 · 점수 ${r.score}</p>
      ${r.missed.length ? `<h3>놓친 오류</h3><ol>${r.missed.map((m) => `<li><b>${m.title}</b> — ${m.rationale}</li>`).join('')}</ol>` : '<p>모든 오류를 찾았습니다!</p>'}
      <button onclick="location.reload()">다시 하기</button></div>`;
    el.classList.remove('hidden');
    drawPanel({ type: 'info', title: `결과: ${r.found}/${r.total} 발견`, desc: `오답 ${r.wrong} · ${r.timeSec}초 · 점수 ${r.score}`, rationale: r.missed.length ? '놓친 오류: ' + r.missed.map((m) => m.title).join(', ') : '모든 오류를 찾았습니다!' });
  },
});

function placePanelInView() {
  // 사용자가 보는 방향 1.2m 앞에 패널 배치
  const xrCam = renderer.xr.getCamera();
  const pos = new THREE.Vector3(); const dir = new THREE.Vector3();
  xrCam.getWorldPosition(pos); xrCam.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  const target = pos.clone().addScaledVector(dir, 1.2);
  panel.position.set(target.x, pos.y - 0.1, target.z);
  panel.lookAt(pos);
}

// ---------- 하이라이트 ----------
let hovered = null;
function setHover(obj) {
  if (hovered === obj) return;
  const paint = (o, on) => o?.traverse((m) => {
    if (m.isMesh && m.material.emissive) {
      if (on) { m.userData._em = m.material.emissive.getHex(); m.material.emissive.setHex(0x335577); }
      else if (m.userData._em !== undefined) m.material.emissive.setHex(m.userData._em);
    }
  });
  paint(hovered, false); paint(obj, true);
  hovered = obj;
}
function rootOf(o) {
  while (o && !interactables.includes(o)) o = o.parent;
  return o;
}

// ---------- 레이캐스트: 마우스 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactables, true)[0];
  setHover(hit ? rootOf(hit.object) : null);
  renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // 드래그는 무시
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactables, true)[0];
  if (hit) game.select(hit.object.userData.hotspotId);
});

// ---------- 레이캐스트: XR 컨트롤러 ----------
const controllerFactory = new XRControllerModelFactory();
const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.scale.z = 5; c.add(line);
  c.addEventListener('selectend', () => {
    const hit = intersectFromController(c);
    if (hit) game.select(hit.object.userData.hotspotId);
  });
  rig.add(c);
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerFactory.createControllerModel(grip));
  rig.add(grip);
  return c;
});
const tmpMat = new THREE.Matrix4();
function intersectFromController(c) {
  tmpMat.identity().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
  return raycaster.intersectObjects(interactables, true)[0];
}

renderer.xr.addEventListener('sessionstart', () => {
  // 실제 서 있는 위치를 가상 병실의 문 안쪽으로 옮김
  const base = renderer.xr.getReferenceSpace();
  renderer.xr.setReferenceSpace(base.getOffsetReferenceSpace(new XRRigidTransform({ x: -XR_START.x, y: 0, z: -XR_START.z })));
  document.getElementById('hud').classList.add('hidden');
  panel.visible = true;
  drawPanel({ type: 'info', title: '오류의 방에 오신 것을 환영합니다', desc: 'CRE 보균 + 폐렴(비말주의) 환자의 격리병실입니다. 컨트롤러 트리거로 오류를 지목하세요.' });
  placePanelInView();
});
renderer.xr.addEventListener('sessionend', () => {
  document.getElementById('hud').classList.remove('hidden');
  panel.visible = false;
});

// ---------- 루프 ----------
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let lastTick = 0;
renderer.setAnimationLoop((t) => {
  if (renderer.xr.isPresenting) {
    let h = null;
    for (const c of controllers) { const hit = intersectFromController(c); if (hit) { h = rootOf(hit.object); break; } }
    setHover(h);
  } else {
    controls.update();
  }
  if (t - lastTick > 250) { game.tick(); lastTick = t; }
  renderer.render(scene, camera);
});
