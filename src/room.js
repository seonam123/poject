import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildPatient, HINGE_Z } from './patient.js';

// 침대 등받이 각도(도). 30~45° 정도의 반좌위(semi-Fowler)
export const BACKREST_DEG = 45;

// 격리병실(1인실) 씬 구성. 단순 도형으로 만든 프로토타입이며,
// 나중에 GLTF 모델(public/models/*.glb)로 바꿔 넣을 수 있게 id 단위로 나눠 두었습니다.
// 반환값: interactables — 지목할 수 있는 오브젝트(userData.hotspotId 포함)

const ROOM = { w: 5, d: 6, h: 2.8 };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...opts });
}

function box(w, h, d, color, opts) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
}

export function textPlane(lines, { w = 0.5, h = 0.3, bg = '#ffffff', fg = '#111111', font = 48 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${font}px "Malgun Gothic", sans-serif`;
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((t, i) => g.fillText(t, c.width / 2, (c.height / (arr.length + 1)) * (i + 1)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

function tag(obj, id) {
  obj.userData.hotspotId = id;
  obj.traverse((o) => { if (o.isMesh) o.userData.hotspotId = id; });
  return obj;
}

export function buildRoom(scene) {
  const interactables = [];
  const updaters = []; // 매 프레임 호출되는 애니메이션 함수 (점적, 기포 등)
  const add = (obj, id) => { scene.add(id ? tag(obj, id) : obj); if (id) interactables.push(obj); return obj; };

  // 조명
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(2, 4, 1);
  scene.add(sun);

  // 바닥·천장·벽
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), mat(0xd9d4c7));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceil = floor.clone(); ceil.material = mat(0xf5f5f5); ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.h;
  scene.add(ceil);
  const wallMat = mat(0xe8eef0, { side: THREE.DoubleSide });
  const walls = [
    [ROOM.w, [0, ROOM.h / 2, -ROOM.d / 2], 0],
    [ROOM.w, [0, ROOM.h / 2, ROOM.d / 2], Math.PI],
    [ROOM.d, [-ROOM.w / 2, ROOM.h / 2, 0], Math.PI / 2],
    [ROOM.d, [ROOM.w / 2, ROOM.h / 2, 0], -Math.PI / 2],
  ];
  walls.forEach(([len, p, ry]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, ROOM.h), wallMat);
    m.position.set(...p); m.rotation.y = ry; scene.add(m);
  });

  // 출입문 (앞쪽 벽, z=+3) — 학습자는 문 안쪽에서 시작
  const door = box(1.0, 2.1, 0.05, 0x8fa3b8);
  door.position.set(1.4, 1.05, ROOM.d / 2 - 0.03);
  scene.add(door);

  // [오류] 격리 표지: 접촉주의만 부착
  const sign = textPlane(['접촉주의', 'CONTACT'], { w: 0.4, h: 0.3, bg: '#fde047', font: 64 });
  sign.position.set(1.4, 1.6, ROOM.d / 2 - 0.06); sign.rotation.y = Math.PI;
  add(sign, 'doorSign');

  // [오류] 손소독제 디스펜서 (비어 있음, 빨간 표시등)
  const disp = new THREE.Group();
  disp.add(box(0.12, 0.25, 0.1, 0xffffff));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.015), mat(0xff0000, { emissive: 0xff0000, emissiveIntensity: 1 }));
  led.position.set(0, 0.08, -0.055); disp.add(led);
  disp.position.set(0.7, 1.2, ROOM.d / 2 - 0.06);
  add(disp, 'sanitizer');

  // 침대
  const bed = new THREE.Group();
  const frame = box(1.0, 0.5, 2.1, 0xbfc5cc); frame.position.y = 0.35; bed.add(frame);
  // 매트리스: 다리 쪽은 고정, 머리 쪽 등받이는 경첩(z=-0.25)에서 BACKREST_DEG만큼 올림
  const mattress = box(0.95, 0.15, 1.25, 0x93c5fd); mattress.position.set(0, 0.67, 0.375); bed.add(mattress);
  const backrest = new THREE.Group();
  backrest.position.set(0, 0.745, HINGE_Z);
  backrest.rotation.x = THREE.MathUtils.degToRad(BACKREST_DEG);
  const backMat = box(0.95, 0.15, 0.75, 0x93c5fd); backMat.position.set(0, -0.075, -0.375); backrest.add(backMat);
  const backFrame = box(0.97, 0.03, 0.75, 0x9aa3ad); backFrame.position.set(0, -0.165, -0.375); backrest.add(backFrame);
  bed.add(backrest);
  // 등받이 받침대(경첩 아래 지지 막대)
  const strut = box(0.04, 0.04, 0.5, 0x9aa3ad);
  strut.position.set(0, 0.62, -0.5); strut.rotation.x = -0.9; bed.add(strut);
  const head = box(1.0, 0.6, 0.05, 0x9aa3ad); head.position.set(0, 0.9, -1.05); bed.add(head);
  bed.position.set(-0.6, 0, -1.2);
  scene.add(bed);

  // 오른쪽 난간(정상, 올림)
  const railR = box(0.04, 0.3, 1.0, 0xd1d5db); railR.position.set(-0.6 + 0.54, 0.9, -1.4);
  scene.add(railR);
  // [오류] 왼쪽 난간 내림
  const railL = box(0.04, 0.3, 1.0, 0xd1d5db); railL.position.set(-0.6 - 0.54, 0.45, -1.4);
  add(railL, 'bedRail');

  // 환자 (patient.js) — 매트리스 윗면(y=0.745)에 눕힘
  const patient = buildPatient({ backrestDeg: BACKREST_DEG });
  patient.group.position.set(-0.6, 0.745, -1.2);
  scene.add(patient.group);
  // [오류] 팔찌 없는 손목 (수액 맞는 팔, 지목 영역)
  // 인체 모델은 비동기로 불러오므로, 로드 후 팔 위치가 정해지면 지목 영역 등록
  patient.ready.then(() => tag(patient.ivArm, 'wristband')).catch((e) => console.error('환자 모델 로드 실패', e));
  interactables.push(patient.ivArm);

  // [오류] 수액 거치대 + 라벨 없는 수액백 (항생제 혼합 수액을 맞는 중)
  const metal = mat(0xa3aab3, { metalness: 0.6, roughness: 0.35 });
  const clear = (o = 0.35) => mat(0xf1f8fd, { transparent: true, opacity: o, roughness: 0.15 });
  const pole = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.95, 16), metal);
  stick.position.y = 0.975; pole.add(stick);
  for (let i = 0; i < 5; i++) { // 바퀴 달린 받침
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.025), metal);
    leg.rotation.y = (i / 5) * Math.PI * 2; leg.position.set(Math.cos(-leg.rotation.y) * 0.14, 0.06, Math.sin(-leg.rotation.y) * 0.14);
    pole.add(leg);
  }
  const hookArm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), metal);
  hookArm.rotation.z = Math.PI / 2; hookArm.position.set(0.06, 1.94, 0); pole.add(hookArm);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 16, Math.PI * 1.5), metal);
  hook.position.set(0.08, 1.925, 0); pole.add(hook);
  // 수액백: 반투명 백 + 안의 수액 + 아래 포트 (라벨 없음 = 오류)
  const bag = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.22, 0.035, 3, 0.012), clear(0.45));
  const fluid = new THREE.Mesh(new RoundedBoxGeometry(0.125, 0.15, 0.025, 3, 0.01), mat(0xfef9c3, { transparent: true, opacity: 0.6 }));
  fluid.position.y = -0.03; bag.add(fluid);
  const portL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10), clear(0.8));
  portL.position.set(-0.025, -0.125, 0); bag.add(portL);
  const portR = portL.clone(); portR.position.x = 0.025; portR.material = mat(0x60a5fa); bag.add(portR);
  bag.position.set(0.08, 1.8, 0); pole.add(bag);
  pole.position.set(0.15, 0, -2.0);
  scene.add(pole);
  tag(bag, 'ivBag'); interactables.push(bag);

  // 점적통(drip chamber): 스파이크 + 투명 통 + 아래 고인 수액 + 떨어지는 방울(애니메이션)
  scene.updateMatrixWorld(true);
  const spikeTop = new THREE.Vector3(-0.025, -0.14, 0).applyMatrix4(bag.matrixWorld);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10), mat(0xffffff));
  spike.position.copy(spikeTop).add(new THREE.Vector3(0, -0.015, 0)); scene.add(spike);
  const chamberTop = spikeTop.clone().add(new THREE.Vector3(0, -0.03, 0));
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.07, 16), clear(0.4));
  chamber.position.copy(chamberTop).add(new THREE.Vector3(0, -0.035, 0)); scene.add(chamber);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.022, 16), mat(0xfef3a0, { transparent: true, opacity: 0.7 }));
  pool.position.copy(chamberTop).add(new THREE.Vector3(0, -0.058, 0)); scene.add(pool);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), mat(0xfde68a, { transparent: true, opacity: 0.9 }));
  scene.add(drop);
  updaters.push((t) => { // 약 1초에 1방울
    const k = (t / 1000) % 1;
    drop.position.copy(chamberTop).add(new THREE.Vector3(0, -0.008 - Math.min(1, k * 1.6) * 0.038, 0));
    drop.visible = k < 0.62;
  });

  // (환자 모델이 로드된 뒤 카테터 위치에 맞춰 연결)
  patient.ready.then(() => {
    // 수액 줄: 점적통 → (롤러 클램프) → 침상 난간 위 → (Y 주입구) → 오른팔 카테터
    scene.updateMatrixWorld(true);
    const site = patient.ivSite.getWorldPosition(new THREE.Vector3());
    const ivCurve = new THREE.CatmullRomCurve3([
      chamberTop.clone().add(new THREE.Vector3(0, -0.07, 0)),
      chamberTop.clone().add(new THREE.Vector3(0.01, -0.35, 0.05)),
      new THREE.Vector3(0.1, 1.2, -1.8),
      new THREE.Vector3(-0.05, 1.1, -1.5),
      new THREE.Vector3(-0.22, 0.98, -1.38),
      site,
    ]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(ivCurve, 120, 0.0035, 8), clear(0.75)));
    const alongCurve = (obj, u) => {
      obj.position.copy(ivCurve.getPointAt(u));
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ivCurve.getTangentAt(u));
      scene.add(obj);
    };
    const clamp = new THREE.Group(); // 롤러 클램프(유량 조절기)
    clamp.add(new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.06, 0.016, 2, 0.004), mat(0xffffff, { roughness: 0.5 })));
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 16), mat(0x2563eb));
    roller.rotation.z = Math.PI / 2; roller.position.set(0, 0.005, 0.009); clamp.add(roller);
    alongCurve(clamp, 0.12);
    const yPort = new THREE.Group(); // Y자 주입구
    yPort.add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 10), clear(0.9)));
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 10), clear(0.9));
    branch.rotation.z = 0.6; branch.position.set(-0.008, 0.005, 0); yPort.add(branch);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 10), mat(0xffffff));
    cap.position.set(-0.016, 0.016, 0); yPort.add(cap);
    alongCurve(yPort, 0.9);
  });

  // 침상 옆 테이블 (정상) + [오류] 공용 청진기
  // 침상 옆 협탁(환자 오른쪽): 위 서랍 + 가운데 열린 선반 + 아래 수납장. 앞면이 침대(+x)를 향함
  const table = new THREE.Group();
  const laminate = mat(0xece7dc, { roughness: 0.6 });
  const wood = mat(0xc9a77c, { roughness: 0.55 });
  const sideL = box(0.42, 0.72, 0.02, 0xece7dc); sideL.position.set(0, 0.38, -0.24); table.add(sideL);
  const sideR = sideL.clone(); sideR.position.z = 0.24; table.add(sideR);
  const back = box(0.02, 0.72, 0.5, 0xe2ddd0); back.position.set(-0.2, 0.38, 0); table.add(back);
  const topBoard = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.03, 0.54, 2, 0.008), wood); topBoard.position.y = 0.755; table.add(topBoard);
  for (const y of [0.04, 0.33, 0.56]) { const sh = box(0.42, 0.02, 0.48, 0xe2ddd0); sh.position.set(0, y, 0); table.add(sh); }
  const drawer = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.15, 0.46, 2, 0.006), laminate); drawer.position.set(0.21, 0.655, 0); table.add(drawer);
  const doorC = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.27, 0.46, 2, 0.006), laminate); doorC.position.set(0.21, 0.185, 0); table.add(doorC);
  for (const [y, w] of [[0.67, 0.14], [0.27, 0.1]]) {
    const hd = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.018, w, 2, 0.006), mat(0x9ca3af, { metalness: 0.5, roughness: 0.3 }));
    hd.position.set(0.225, y, 0); table.add(hd);
  }
  // 열린 선반 위: 티슈 상자, 물컵
  const tissue = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.24, 2, 0.01), mat(0x93c5fd, { roughness: 0.7 }));
  tissue.position.set(0.0, 0.38, -0.08); table.add(tissue);
  const tissuePaper = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(0xffffff, { roughness: 1 }));
  tissuePaper.scale.set(1, 0.6, 1.4); tissuePaper.position.set(0.0, 0.425, -0.08); table.add(tissuePaper);
  const waterCup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 20), mat(0xe0f2fe, { transparent: true, opacity: 0.6, roughness: 0.1 }));
  waterCup.position.set(0.05, 0.39, 0.13); table.add(waterCup);
  table.position.set(-1.6, 0, -2.0);
  add(table, 'tableOk');

  // 고막 체온계(환자 전용) + 거치대 + 일회용 프로브 커버 상자 — 협탁 위 (정상 물품)
  const thermo = new THREE.Group();
  const white = mat(0xf8fafc, { roughness: 0.35 });
  const accent = mat(0x2563eb, { roughness: 0.4 });
  const cradle = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.03, 0.1, 3, 0.012), mat(0xe5e7eb, { roughness: 0.4 }));
  cradle.position.y = 0.015; thermo.add(cradle);
  const unit = new THREE.Group(); // 체온계 본체: 손잡이 + 머리(프로브)
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.085, 6, 18), white);
  grip.scale.set(1.15, 1, 0.85); grip.position.y = 0.06; unit.add(grip);
  const gripBand = new THREE.Mesh(new THREE.CapsuleGeometry(0.0165, 0.05, 6, 18), mat(0x93c5fd, { roughness: 0.6 }));
  gripBand.scale.set(1.16, 1, 0.86); gripBand.position.y = 0.045; unit.add(gripBand);
  const headT = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.048, 0.06, 4, 0.016), white);
  headT.position.set(0, 0.125, 0.012); unit.add(headT);
  const probeT = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.01, 0.028, 20), white);
  probeT.rotation.x = Math.PI / 2; probeT.position.set(0, 0.13, 0.055); unit.add(probeT);
  const probeTip = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 12, 8), mat(0xcbd5e1, { metalness: 0.4, roughness: 0.2 }));
  probeTip.position.set(0, 0.13, 0.069); unit.add(probeTip);
  const probeCover = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0108, 0.03, 20, 1, true), mat(0xffffff, { transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide }));
  probeCover.rotation.x = Math.PI / 2; probeCover.position.set(0, 0.13, 0.056); unit.add(probeCover);
  const lcd = textPlane('36.8℃', { w: 0.03, h: 0.016, bg: '#c7d9c2', fg: '#1f2937', font: 150 });
  lcd.position.set(0, 0.128, -0.0185); lcd.rotation.y = Math.PI; unit.add(lcd);
  const scanBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 16), accent);
  scanBtn.rotation.x = Math.PI / 2; scanBtn.position.set(0, 0.085, -0.016); unit.add(scanBtn);
  const sticker = textPlane('환자전용', { w: 0.024, h: 0.012, bg: '#16a34a', fg: '#ffffff', font: 110 });
  sticker.position.set(0.0195, 0.06, 0); sticker.rotation.y = Math.PI / 2; unit.add(sticker);
  unit.position.set(0, 0.02, -0.01); unit.rotation.x = -0.18; thermo.add(unit);
  // 일회용 프로브 커버 상자
  const coverBox = new THREE.Group();
  const cbBody = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.045, 0.1, 2, 0.004), mat(0xffffff, { roughness: 0.8 }));
  cbBody.position.y = 0.0225; coverBox.add(cbBody);
  const cbLbl = textPlane(['PROBE', 'COVERS'], { w: 0.06, h: 0.03, bg: '#ffffff', fg: '#1d4ed8', font: 120 });
  cbLbl.position.set(0, 0.024, -0.0505); cbLbl.rotation.y = Math.PI; coverBox.add(cbLbl);
  coverBox.position.set(0.11, 0, 0); thermo.add(coverBox);
  thermo.position.set(-1.47, 0.77, -2.1);
  thermo.rotation.y = -Math.PI / 2 + 0.3; // 체온계 화면(뒷면)이 침대·학습자 쪽을 향하도록
  add(thermo, 'thermometer');
  const steth = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), mat(0x111827));
  tube.rotation.x = Math.PI / 2; steth.add(tube);
  const lbl = textPlane('공용', { w: 0.12, h: 0.06, bg: '#ef4444', fg: '#ffffff', font: 120 });
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.002, 0.14); steth.add(lbl);
  steth.position.set(-1.62, 0.782, -1.95);
  add(steth, 'stethoscope');

  // [오류] PPE 카트가 병실 안에 있음
  const cart = new THREE.Group();
  const cartBody = box(0.6, 0.9, 0.45, 0x94a3b8); cartBody.position.y = 0.45; cart.add(cartBody);
  const gowns = box(0.5, 0.1, 0.35, 0xfacc15); gowns.position.y = 0.95; cart.add(gowns);
  const gloves = box(0.25, 0.1, 0.15, 0x60a5fa); gloves.position.set(-0.1, 1.05, 0); cart.add(gloves);
  const masks = box(0.2, 0.08, 0.15, 0x86efac); masks.position.set(0.15, 1.04, 0); cart.add(masks);
  // 품목 라벨: 앞면(+z, 학습자 시작 방향)과 윗면에 크게 표시
  const ppeLabel = (text, w, h, font) => textPlane(text, { w, h, bg: '#ffffff', fg: '#111827', font });
  const gownFront = ppeLabel('일회용가운', 0.46, 0.08, 64);
  gownFront.position.set(0, 0.95, 0.1765); cart.add(gownFront);
  const gownTop = ppeLabel('일회용가운', 0.4, 0.085, 70);
  gownTop.rotation.x = -Math.PI / 2; gownTop.position.set(0, 1.0015, 0.125); cart.add(gownTop);
  const gloveFront = ppeLabel('일회용 장갑', 0.24, 0.08, 72);
  gloveFront.position.set(-0.1, 1.05, 0.0765); cart.add(gloveFront);
  const gloveTop = ppeLabel('일회용 장갑', 0.23, 0.13, 78);
  gloveTop.rotation.x = -Math.PI / 2; gloveTop.position.set(-0.1, 1.1015, 0); cart.add(gloveTop);
  const maskFront = ppeLabel('일회용 마스크', 0.19, 0.065, 62);
  maskFront.position.set(0.15, 1.04, 0.0765); cart.add(maskFront);
  const maskTop = ppeLabel('일회용 마스크', 0.185, 0.13, 66);
  maskTop.rotation.x = -Math.PI / 2; maskTop.position.set(0.15, 1.0815, 0); cart.add(maskTop);
  cart.position.set(0.8, 0, -0.6);
  add(cart, 'ppeCart');

  // [오류] 뚜껑 열린 의료폐기물 용기
  const bin = new THREE.Group();
  const binBody = box(0.4, 0.55, 0.4, 0xfde68a); binBody.position.y = 0.275; bin.add(binBody);
  const lid = box(0.42, 0.03, 0.42, 0xf59e0b); lid.position.set(0, 0.55, -0.2); lid.rotation.x = -1.2; lid.position.z = -0.25; lid.position.y = 0.72; bin.add(lid);
  const over = box(0.3, 0.12, 0.3, 0xffffff); over.position.y = 0.6; bin.add(over);
  const binLbl = textPlane(['격리', '의료폐기물'], { w: 0.3, h: 0.2, bg: '#f59e0b', font: 72 });
  binLbl.position.set(0, 0.3, 0.205); bin.add(binLbl);
  bin.position.set(1.9, 0, -2.4);
  add(bin, 'wasteBin');

  // [오류] 투약 카트가 격리실 안에 있음 (서랍형 카트 + 상판 위 투약 준비 물품 + 기록용 노트북)
  const med = new THREE.Group();
  const medBody = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.86, 0.48, 3, 0.02), mat(0xe5e7eb, { roughness: 0.6 }));
  medBody.position.y = 0.52; med.add(medBody);
  const drawerColors = [0x60a5fa, 0x60a5fa, 0x3b82f6, 0x3b82f6, 0x1d4ed8];
  drawerColors.forEach((c, i) => {
    const h = i < 2 ? 0.11 : 0.15;
    const y = [0.86, 0.74, 0.6, 0.44, 0.28][i];
    const front = new THREE.Mesh(new RoundedBoxGeometry(0.56, h, 0.02, 2, 0.006), mat(c, { roughness: 0.5 }));
    front.position.set(0, y, 0.245); med.add(front);
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.018, 0.022, 2, 0.006), mat(0xf3f4f6, { metalness: 0.3, roughness: 0.3 }));
    handle.position.set(0, y + h / 2 - 0.03, 0.262); med.add(handle);
  });
  const medTop = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.035, 0.52, 3, 0.012), mat(0x9ca3af, { roughness: 0.5 }));
  medTop.position.y = 0.97; med.add(medTop);
  const pushBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 12), metal);
  pushBar.rotation.x = Math.PI / 2; pushBar.position.set(-0.36, 0.95, 0); med.add(pushBar);
  for (const [x, z] of [[-0.26, -0.19], [0.26, -0.19], [-0.26, 0.19], [0.26, 0.19]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), mat(0x374151));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.04, z); med.add(wheel);
  }
  const medLbl = textPlane('투약카트', { w: 0.22, h: 0.06, bg: '#1e3a8a', fg: '#ffffff', font: 80 });
  medLbl.position.set(0, 0.965, 0.262); med.add(medLbl);
  // 상판 위: 투약 트레이(약컵·주사기), 알코올 솜, 손상성 폐기물 용기, 기록용 노트북
  const tray = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.03, 0.2, 2, 0.01), mat(0xffffff, { roughness: 0.4 }));
  tray.position.set(-0.12, 1.003, 0.1); med.add(tray);
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.03, 12), mat(0xf8fafc, { transparent: true, opacity: 0.8 }));
    cup.position.set(-0.22 + i * 0.05, 1.03, 0.05); med.add(cup);
    const pill = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), mat([0xfca5a5, 0xfde68a, 0xffffff][i]));
    pill.position.set(-0.22 + i * 0.05, 1.025, 0.05); med.add(pill);
  }
  for (let i = 0; i < 2; i++) {
    const syr = new THREE.Group();
    syr.add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 10), mat(0xf8fafc, { transparent: true, opacity: 0.85 })));
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 10), mat(0xffffff)); plunger.position.y = 0.05; syr.add(plunger);
    const capN = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 8), mat([0xf97316, 0x3b82f6][i])); capN.position.y = -0.065; syr.add(capN);
    syr.rotation.z = Math.PI / 2; syr.position.set(-0.1, 1.027, 0.13 + i * 0.03); med.add(syr);
  }
  const swabs = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.04, 0.06, 2, 0.006), mat(0xffffff));
  swabs.position.set(0.06, 1.007, 0.15); med.add(swabs);
  const sharps = new THREE.Group(); // 손상성 폐기물 용기(노랑 몸체·빨강 뚜껑)
  const sb = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.16, 0.12, 2, 0.01), mat(0xfacc15)); sb.position.y = 0.08; sharps.add(sb);
  const sl = new THREE.Mesh(new RoundedBoxGeometry(0.145, 0.025, 0.125, 2, 0.008), mat(0xdc2626)); sl.position.y = 0.17; sharps.add(sl);
  sharps.position.set(0.22, 0.99, 0.13); med.add(sharps);
  const laptop = new THREE.Group();
  const lBase = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.015, 0.21, 2, 0.005), mat(0x4b5563, { metalness: 0.3 })); laptop.add(lBase);
  const screen = textPlane(['투약기록(MAR)', '김OO 78/M', 'Meropenem 1g IV q8h'], { w: 0.28, h: 0.18, bg: '#eff6ff', fg: '#1e3a8a', font: 34 });
  screen.position.set(0, 0.095, -0.1); screen.rotation.x = -0.25; laptop.add(screen);
  const lapLid = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.2, 0.01, 2, 0.004), mat(0x4b5563, { metalness: 0.3 }));
  lapLid.position.set(0, 0.095, -0.106); lapLid.rotation.x = -0.25; laptop.add(lapLid);
  laptop.position.set(0.05, 0.995, -0.1); med.add(laptop);
  med.position.set(1.95, 0, -1.0);
  med.rotation.y = -Math.PI / 2; // 앞면(서랍)이 병실 가운데를 향함
  add(med, 'medCart');

  // 정상 물품(오답 유도)
  const win = box(1.4, 1.0, 0.03, 0xbfdbfe, { transparent: true, opacity: 0.6 });
  win.position.set(-ROOM.w / 2 + 0.02, 1.5, -0.5); win.rotation.y = Math.PI / 2;
  add(win, 'window');
  // 벽면 산소 공급장치: 아웃렛 + 유량계(부유구 2 L/min) + 가습병 → 비강 캐뉼라로 연결 (정상)
  const o2 = new THREE.Group();
  const wallZ = -ROOM.d / 2;
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.14, 0.02, 2, 0.006), mat(0x16a34a));
  plate.position.set(0, 0.1, 0.01); o2.add(plate);
  const plateLbl = textPlane('O₂', { w: 0.06, h: 0.03, bg: '#16a34a', fg: '#ffffff', font: 160 });
  plateLbl.position.set(0, 0.15, 0.021); o2.add(plateLbl);
  const fmBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 20), clear(0.35));
  fmBody.position.set(0, 0.07, 0.06); o2.add(fmBody);
  for (const y of [-0.015, 0.155]) {
    const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 20), metal);
    capM.position.set(0, y, 0.06); o2.add(capM);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), mat(0xffffff, { roughness: 0.3 }));
  ball.position.set(0, 0.04, 0.06); o2.add(ball);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), mat(0x16a34a));
  knob.position.set(0, 0.175, 0.06); o2.add(knob);
  const flowLbl = textPlane('2 L/min', { w: 0.07, h: 0.025, bg: '#ffffff', fg: '#166534', font: 110 });
  flowLbl.position.set(0.065, 0.04, 0.06); o2.add(flowLbl);
  const humid = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.035, 0.13, 20), clear(0.35));
  humid.position.set(0, -0.11, 0.06); o2.add(humid);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.032, 0.075, 20), mat(0xbae6fd, { transparent: true, opacity: 0.6 }));
  water.position.set(0, -0.135, 0.06); o2.add(water);
  const humidCap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), mat(0xffffff));
  humidCap.position.set(0, -0.035, 0.06); o2.add(humidCap);
  const nipple = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.03, 10), mat(0x16a34a));
  nipple.rotation.z = Math.PI / 2; nipple.position.set(0.05, -0.035, 0.06); o2.add(nipple);
  o2.position.set(-0.9, 1.25, wallZ);
  add(o2, 'oxygen');
  // 가습병 기포(애니메이션)
  const bubbles = [0, 1, 2].map(() => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), clear(0.8)); o2.add(b); return b; });
  updaters.push((t) => bubbles.forEach((b, i) => {
    const k = ((t / 900) + i / 3) % 1;
    b.position.set(Math.sin(i * 2.1) * 0.012, -0.17 + k * 0.07, 0.06);
  }));
  patient.ready.then(() => {
    // 산소 줄: 가습병 출구 → 침대 머리판 바깥쪽 → 베개 옆 → 턱 아래 캐뉼라 슬라이더
    const o2Out = new THREE.Vector3(0.065, -0.035, 0.06).add(o2.position);
    scene.updateMatrixWorld(true);
    const o2In = patient.o2Port.getWorldPosition(new THREE.Vector3());
    const o2Curve = new THREE.CatmullRomCurve3([
      o2Out, new THREE.Vector3(-0.98, 1.08, -2.75), new THREE.Vector3(-1.2, 1.02, -2.35),
      new THREE.Vector3(-1.17, 1.06, -1.95), new THREE.Vector3(-0.88, 1.12, -1.62), o2In,
    ]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(o2Curve, 120, 0.0032, 8), mat(0xcdeff5, { transparent: true, opacity: 0.9, roughness: 0.25 })));
  });
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), mat(0xffffff));
  clock.rotation.x = Math.PI / 2; clock.position.set(1.2, 2.2, -ROOM.d / 2 + 0.03);
  add(clock, 'clock');

  return { interactables, updaters, room: ROOM };
}
