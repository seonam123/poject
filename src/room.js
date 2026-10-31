import * as THREE from 'three';

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
  const mattress = box(0.95, 0.15, 2.0, 0x93c5fd); mattress.position.y = 0.67; bed.add(mattress);
  const head = box(1.0, 0.6, 0.05, 0x9aa3ad); head.position.set(0, 0.9, -1.05); bed.add(head);
  bed.position.set(-0.6, 0, -1.2);
  scene.add(bed);

  // 오른쪽 난간(정상, 올림)
  const railR = box(0.04, 0.3, 1.0, 0xd1d5db); railR.position.set(-0.6 + 0.5, 0.9, -1.4);
  scene.add(railR);
  // [오류] 왼쪽 난간 내림
  const railL = box(0.04, 0.3, 1.0, 0xd1d5db); railL.position.set(-0.6 - 0.5, 0.45, -1.4);
  add(railL, 'bedRail');

  // 환자 (단순 형태)
  const patient = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 12), mat(0x60a5fa));
  body.rotation.x = Math.PI / 2; body.position.set(0, 0.95, 0.05); patient.add(body);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat(0xf1c7a5));
  headM.position.set(0, 0.95, -0.75); patient.add(headM);
  patient.position.set(-0.6, 0, -1.2);
  scene.add(patient);
  // [오류] 팔찌 없는 손목 (지목 영역)
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 10), mat(0xf1c7a5));
  arm.rotation.x = Math.PI / 2; arm.position.set(-0.6 + 0.3, 0.9, -0.9);
  add(arm, 'wristband');

  // [오류] 수액 거치대 + 라벨 없는 수액백
  const pole = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9), mat(0x9ca3af, { metalness: 0.6 }));
  stick.position.y = 0.95; pole.add(stick);
  const bag = box(0.14, 0.22, 0.04, 0xe0f2fe, { transparent: true, opacity: 0.85 });
  bag.position.set(0.08, 1.75, 0); pole.add(bag);
  pole.position.set(0.15, 0, -2.0);
  scene.add(pole);
  tag(bag, 'ivBag'); interactables.push(bag);

  // 침상 옆 테이블 (정상) + [오류] 공용 청진기
  const table = box(0.5, 0.75, 0.4, 0xc8a27a); table.position.set(-1.6, 0.375, -2.0);
  add(table, 'tableOk');
  const steth = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), mat(0x111827));
  tube.rotation.x = Math.PI / 2; steth.add(tube);
  const lbl = textPlane('공용', { w: 0.12, h: 0.06, bg: '#ef4444', fg: '#ffffff', font: 120 });
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.002, 0.14); steth.add(lbl);
  steth.position.set(-1.6, 0.765, -2.0);
  add(steth, 'stethoscope');

  // [오류] PPE 카트가 병실 안에 있음
  const cart = new THREE.Group();
  const cartBody = box(0.6, 0.9, 0.45, 0x94a3b8); cartBody.position.y = 0.45; cart.add(cartBody);
  const gowns = box(0.5, 0.1, 0.35, 0xfacc15); gowns.position.y = 0.95; cart.add(gowns);
  const gloves = box(0.25, 0.1, 0.15, 0x60a5fa); gloves.position.set(-0.1, 1.05, 0); cart.add(gloves);
  const masks = box(0.2, 0.08, 0.15, 0x86efac); masks.position.set(0.15, 1.04, 0); cart.add(masks);
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

  // 정상 물품(오답 유도)
  const win = box(1.4, 1.0, 0.03, 0xbfdbfe, { transparent: true, opacity: 0.6 });
  win.position.set(-ROOM.w / 2 + 0.02, 1.5, -0.5); win.rotation.y = Math.PI / 2;
  add(win, 'window');
  const o2 = box(0.25, 0.15, 0.08, 0x22c55e); o2.position.set(-0.6, 1.3, -ROOM.d / 2 + 0.05);
  add(o2, 'oxygen');
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), mat(0xffffff));
  clock.rotation.x = Math.PI / 2; clock.position.set(1.2, 2.2, -ROOM.d / 2 + 0.03);
  add(clock, 'clock');

  return { interactables, room: ROOM };
}
