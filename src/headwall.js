import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// =============================================================
// 침대 머리 위 벽: 의료가스·전원 콘솔(헤드월) + 환자 감시 모니터
// - 콘솔: 의료용 공기(AIR, 노랑)·흡인(VAC, 검정) 아웃렛, 흡인 조절기와 수집통,
//   전원 콘센트, 간호사 호출 버튼, 독서등, 침상 번호표
//   (산소 O₂ 유량계는 room.js의 'oxygen' 그룹을 이 콘솔 위에 배치)
// - 모니터: 벽걸이 암에 달린 환자 감시 모니터, 심전도·맥파·호흡 파형이 실시간으로 움직임
//   HR 96 / SpO₂ 94% / NIBP 128/76 / RR 22 / T 37.9 (산소 2 L/min 적용 중인 폐렴 환자)
// =============================================================

const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });

export const CONSOLE = { x0: -1.6, x1: 0.4, yC: 1.36, h: 0.34, depth: 0.07 };

export function buildHeadwall({ scene, wallZ, textPlane, add, updaters }) {
  const g = new THREE.Group();
  const front = wallZ + CONSOLE.depth; // 콘솔 앞면 z
  const W = CONSOLE.x1 - CONSOLE.x0;
  const cx = (CONSOLE.x0 + CONSOLE.x1) / 2;

  // ---------- 콘솔 몸체 ----------
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, CONSOLE.h, CONSOLE.depth, 3, 0.02), m(0xdfe4ea, { metalness: 0.25, roughness: 0.4 }));
  body.position.set(cx, CONSOLE.yC, wallZ + CONSOLE.depth / 2);
  g.add(body);
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(W - 0.02, 0.035, 0.012, 2, 0.005), m(0x5b8cc4, { roughness: 0.5 }));
  stripe.position.set(cx, CONSOLE.yC - CONSOLE.h / 2 + 0.03, front + 0.002);
  g.add(stripe);
  // 독서등(위쪽 조명 바) — 은은하게 빛남
  const lamp = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.05, 0.08, 3, 0.02), m(0xf1f5f9, { emissive: 0xfff6dd, emissiveIntensity: 0.35 }));
  lamp.position.set(-0.6, 1.98, wallZ + 0.04);
  g.add(lamp);
  const lampLight = new THREE.PointLight(0xfff1d6, 0.25, 1.8);
  lampLight.position.set(-0.6, 1.9, wallZ + 0.3);
  g.add(lampLight);
  // 침상 번호표
  const bedNo = textPlane(['1102호', '김OO 78/M'], { w: 0.2, h: 0.08, bg: '#ffffff', fg: '#1e3a8a', font: 70 });
  bedNo.position.set(-0.6, CONSOLE.yC + CONSOLE.h / 2 - 0.055, front + 0.002);
  g.add(bedNo);

  // ---------- 의료가스 아웃렛 ----------
  const outlet = (x, color, label, fg = '#ffffff') => {
    const o = new THREE.Group();
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.12, 0.015, 2, 0.006), m(color, { roughness: 0.45 }));
    o.add(plate);
    const lbl = textPlane(label, { w: 0.06, h: 0.025, bg: `#${new THREE.Color(color).getHexString()}`, fg, font: 150 });
    lbl.position.set(0, 0.035, 0.0085); o.add(lbl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 10, 24), m(0xc0c7cf, { metalness: 0.7, roughness: 0.3 }));
    ring.position.set(0, -0.012, 0.009); o.add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), m(0x1f2937));
    hole.position.set(0, -0.012, 0.0085); o.add(hole);
    o.position.set(x, CONSOLE.yC - 0.02, front + 0.008);
    g.add(o);
    return o;
  };
  outlet(-1.25, 0xfacc15, 'AIR', '#111827'); // 의료용 공기
  outlet(-0.25, 0x111827, 'VAC'); // 흡인

  // 흡인 조절기(게이지) + 수집통 — VAC 아웃렛에 연결
  const reg = new THREE.Group();
  const regBody = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.08, 0.05, 2, 0.01), m(0xe5e7eb, { metalness: 0.2 }));
  reg.add(regBody);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 28), m(0xf8fafc, { metalness: 0.4, roughness: 0.3 }));
  dial.rotation.x = Math.PI / 2; dial.position.set(0, 0.055, 0.01); reg.add(dial);
  const dialFace = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#111827'; x.lineWidth = 3;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; x.beginPath(); x.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); x.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); x.stroke(); }
    x.fillStyle = '#16a34a'; x.beginPath(); x.arc(64, 64, 44, Math.PI * 0.75, Math.PI * 1.35); x.lineTo(64, 64); x.fill();
    x.strokeStyle = '#dc2626'; x.lineWidth = 4; const a = Math.PI * 0.75 + 0.3 * Math.PI * 1.5;
    x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); x.stroke();
    x.fillStyle = '#111827'; x.font = 'bold 16px sans-serif'; x.textAlign = 'center'; x.fillText('mmHg', 64, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.036, 28), new THREE.MeshBasicMaterial({ map: dialFace }));
  face.position.set(0, 0.055, 0.0231); reg.add(face);
  reg.position.set(-0.13, CONSOLE.yC - 0.03, front + 0.03);
  g.add(reg);
  const canister = new THREE.Group(); // 1 L 흡인 수집통(비어 있음)
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.17, 24), m(0xf1f5f9, { transparent: true, opacity: 0.35, roughness: 0.1 }));
  canister.add(jar);
  const lidC = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.025, 24), m(0x2563eb));
  lidC.position.y = 0.095; canister.add(lidC);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), m(0xa3aab3, { metalness: 0.6 }));
  bracket.position.set(0, 0.03, -0.065); canister.add(bracket);
  canister.position.set(-0.13, CONSOLE.yC - CONSOLE.h / 2 - 0.1, front + 0.07);
  g.add(canister);
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.13, CONSOLE.yC - 0.08, front + 0.03), new THREE.Vector3(-0.08, CONSOLE.yC - 0.14, front + 0.06),
      new THREE.Vector3(-0.12, CONSOLE.yC - CONSOLE.h / 2 - 0.0, front + 0.08),
    ]), 20, 0.004, 8),
    m(0xe2e8f0, { transparent: true, opacity: 0.8 }),
  ));

  // ---------- 전원 콘센트(2구 × 2) ----------
  const socket = (x) => {
    const s = new THREE.Group();
    const p = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.07, 0.012, 2, 0.008), m(0xffffff, { roughness: 0.3 }));
    s.add(p);
    const recess = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 24), m(0xe5e7eb));
    recess.rotation.x = Math.PI / 2; recess.position.z = 0.005; s.add(recess);
    for (const dx of [-0.008, 0.008]) {
      const pin = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 12), m(0x111827));
      pin.position.set(dx, 0, 0.0085); s.add(pin);
    }
    s.position.set(x, CONSOLE.yC - 0.03, front + 0.006);
    g.add(s);
  };
  [-1.5, -1.42, 0.08, 0.16].forEach(socket);

  // ---------- 간호사 호출 ----------
  const call = new THREE.Group();
  const callPlate = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.12, 0.015, 2, 0.008), m(0xffffff));
  call.add(callPlate);
  const callBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24), m(0xdc2626, { emissive: 0x7f1d1d, emissiveIntensity: 0.4 }));
  callBtn.rotation.x = Math.PI / 2; callBtn.position.set(0, -0.012, 0.012); call.add(callBtn);
  const callLbl = textPlane('간호사 호출', { w: 0.08, h: 0.022, bg: '#ffffff', fg: '#dc2626', font: 72 });
  callLbl.position.set(0, 0.038, 0.0085); call.add(callLbl);
  call.position.set(0.31, CONSOLE.yC - 0.02, front + 0.008);
  g.add(call);

  scene.add(g);

  // ---------- 환자 감시 모니터 ----------
  const SW = 768, SH = 512;
  const cvs = document.createElement('canvas'); cvs.width = SW; cvs.height = SH;
  const ctx = cvs.getContext('2d');
  const screenTex = new THREE.CanvasTexture(cvs);
  screenTex.colorSpace = THREE.SRGBColorSpace;

  const mon = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.33, 0.07, 4, 0.02), m(0x374151, { roughness: 0.5 }));
  mon.add(shell);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.405, 0.275, 0.01, 3, 0.008), m(0x111827, { roughness: 0.3 }));
  bezel.position.set(0, 0.012, 0.033); mon.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.385, 0.257), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.012, 0.0385); mon.add(screen);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 20, Math.PI), m(0x4b5563));
  handle.position.set(0, 0.165, 0); mon.add(handle);
  const alarmLed = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  alarmLed.position.set(0.17, 0.155, 0.02); mon.add(alarmLed);
  const brand = textPlane('PATIENT MONITOR', { w: 0.14, h: 0.016, bg: '#374151', fg: '#d1d5db', font: 56 });
  brand.position.set(-0.11, -0.145, 0.0355); mon.add(brand);
  // 벽걸이 암: 콘솔 위 → 꺾인 팔 → 모니터 뒤
  const armMat = m(0x9ca3af, { metalness: 0.6, roughness: 0.35 });
  const armBase = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.12, 0.04, 2, 0.01), armMat);
  armBase.position.set(0.3, 1.78, wallZ + 0.02); g.add(armBase);
  const armA = new THREE.Vector3(0.3, 1.78, wallZ + 0.04), armB = new THREE.Vector3(0.28, 1.79, wallZ + 0.3), armC = new THREE.Vector3(0.18, 1.8, wallZ + 0.42);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([armA, armB]), 4, 0.018, 12), armMat));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([armB, armC]), 4, 0.016, 12), armMat));
  for (const j of [armB, armC]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 16), armMat); k.position.copy(j); g.add(k); }
  mon.position.set(0.18, 1.82, wallZ + 0.47);
  mon.rotation.set(-0.12, 0.2, 0); // 살짝 아래로, 문(학습자) 쪽으로
  add(mon, 'monitor');

  // ---------- 화면 그리기(실시간 파형) ----------
  const HR = 96, RR = 22;
  const beat = 60 / HR, breath = 60 / RR;
  const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
  const ecg = (p) => 0.12 * gauss(p, 0.12, 0.025) - 0.12 * gauss(p, 0.235, 0.008) + 1.0 * gauss(p, 0.25, 0.01) - 0.28 * gauss(p, 0.27, 0.01) + 0.3 * gauss(p, 0.48, 0.045);
  const pleth = (p) => { const q = (p - 0.08 + 1) % 1; return 0.9 * gauss(q, 0.22, 0.07) + 0.35 * gauss(q, 0.45, 0.06) + 0.1; };
  const resp = (tt) => 0.5 + 0.45 * Math.sin((tt / breath) * Math.PI * 2);
  const WAVE_W = 520, SWEEP_SEC = 2.1; // 화면 폭이 약 2초 분량
  const lanes = [
    { label: 'II', color: '#22c55e', y: 70, h: 110, fn: (tt) => ecg((tt / beat) % 1) },
    { label: 'Pleth', color: '#22d3ee', y: 215, h: 90, fn: (tt) => pleth((tt / beat) % 1) },
    { label: 'RESP', color: '#facc15', y: 345, h: 80, fn: (tt) => resp(tt) },
  ];
  const nums = [
    { y: 52, label: 'HR', unit: 'bpm', color: '#22c55e', value: () => String(HR + Math.round(Math.sin(performance.now() / 3700) * 1.4)) },
    { y: 172, label: 'SpO₂', unit: '%', color: '#22d3ee', value: () => '94' },
    { y: 292, label: 'NIBP', unit: 'mmHg', color: '#f8fafc', value: () => '128/76', small: true },
    { y: 382, label: 'RR', unit: 'rpm', color: '#facc15', value: () => String(RR) },
    { y: 452, label: 'Temp', unit: '℃', color: '#fb923c', value: () => '37.9', small: true },
  ];
  let lastDraw = 0;
  const draw = (t) => {
    if (t - lastDraw < 33) return; // 약 30 fps
    lastDraw = t;
    const now = t / 1000;
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, SW, SH);
    // 상단 정보줄
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, SW, 30);
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 18px "Malgun Gothic", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('1102호  김OO 78/M   성인   CRE·비말격리', 12, 15);
    const d = new Date();
    ctx.textAlign = 'right'; ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, SW - 12, 15);
    ctx.textAlign = 'left';
    // 파형 (오른쪽 끝이 현재, 지우개 막대가 왼→오로 지나가는 형태)
    const pxPerSec = WAVE_W / SWEEP_SEC;
    const sweepX = (now * pxPerSec) % WAVE_W;
    for (const L of lanes) {
      ctx.fillStyle = L.color; ctx.font = 'bold 16px sans-serif'; ctx.fillText(L.label, 10, L.y - L.h / 2 + 4);
      ctx.strokeStyle = L.color; ctx.lineWidth = 2.4; ctx.beginPath();
      let pen = false;
      for (let x = 0; x < WAVE_W; x += 2) {
        let dx = sweepX - x; if (dx < 0) dx += WAVE_W;
        if (dx < 14) { pen = false; continue; } // 지우개 간격
        const tt = now - dx / pxPerSec;
        const v = L.fn(tt);
        const yy = L.y + L.h * 0.35 - v * L.h * 0.7;
        if (!pen) { ctx.moveTo(x + 8, yy); pen = true; } else ctx.lineTo(x + 8, yy);
      }
      ctx.stroke();
    }
    // 오른쪽 숫자 패널
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(WAVE_W + 16, 34); ctx.lineTo(WAVE_W + 16, SH - 4); ctx.stroke();
    for (const n of nums) {
      ctx.fillStyle = n.color;
      ctx.font = 'bold 16px sans-serif'; ctx.fillText(n.label, WAVE_W + 26, n.y - 22);
      ctx.font = '13px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(n.unit, SW - 10, n.y - 22); ctx.textAlign = 'left';
      ctx.font = `bold ${n.small ? 40 : 62}px sans-serif`; ctx.fillText(n.value(), WAVE_W + 30, n.y + (n.small ? 14 : 22));
    }
    // 심박 표시 하트(박동에 맞춰 깜빡)
    if (((now / beat) % 1) < 0.18) { ctx.fillStyle = '#ef4444'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('♥', SW - 34, 52); }
    screenTex.needsUpdate = true;
  };
  updaters.push(draw);

  return {
    group: g,
    monitor: mon,
    // 모니터 아래쪽 케이블 연결부(월드 좌표)
    cablePort: () => mon.localToWorld(new THREE.Vector3(-0.12, -0.165, -0.01)),
  };
}
