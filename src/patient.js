import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildBlanket } from './blanket.js';

// =============================================================
// 환자: 실제 인체 3D 모델(리깅된 GLB)을 불러와 반좌위로 자세를 잡습니다.
// - 모델: public/models/patient.glb (Ready Player Me 아바타, three.js 예제 모델)
//   → 다른 인체 모델로 바꾸려면 Mixamo식 뼈 이름(Hips, Spine, LeftArm…)을 가진 GLB로 교체
// - 모자 제거, 머리·수염 회색 처리, 상의를 병원 환의 줄무늬로 변경
// - 비강 캐뉼라(nasal prong)와 말초정맥 카테터를 실제 코·팔 위치에 맞춰 부착
// 좌표: 침대 매트리스(다리 쪽) 윗면 중앙이 원점, 머리는 -z, 발은 +z
// =============================================================

export const HINGE_Z = -0.25; // 등받이 경첩(room.js 침대와 동일)
const MODEL_URL = `${import.meta.env.BASE_URL}models/patient.glb`;
const PATIENT_SCALE = 0.92; // 원본 1.87 m → 약 1.72 m

const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const tube = (pts, r, material, seg) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg ?? Math.max(16, pts.length * 16), r, 8), material);

// ---------- 모델 손질 ----------

// 이미지 텍스처를 회색조로 바꿔 밝게(백발)
function grayTexture(tex, lift = 0.55) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const l = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
    const v = Math.min(255, l + (255 - l) * lift);
    d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v * 0.98;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = tex.flipY;
  return t;
}

// 지오메트리에서 조건에 맞는 삼각형 제거 (모자 지우기)
function removeTriangles(geo, shouldRemove) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const keep = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    if (!shouldRemove(a, b, c)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geo.setIndex(keep);
}

// 병원 환의: 몸 둘레 방향으로 세로 줄무늬를 그리는 셰이더 (원래 옷 UV와 무관하게 줄무늬 유지)
function gownMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRestPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRestPos;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ang = atan(vRestPos.x, vRestPos.z + 0.02);
        float f = fract(ang * 9.0);
        vec3 base = vec3(0.90, 0.94, 0.98);
        vec3 stripe = vec3(0.47, 0.64, 0.84);
        vec3 thin = vec3(0.70, 0.80, 0.91);
        vec3 col = mix(base, stripe, step(f, 0.28));
        col = mix(col, thin, step(0.55, f) * step(f, 0.62));
        float weave = 0.97 + 0.03 * step(0.5, fract(vRestPos.y * 220.0));
        diffuseColor.rgb = col * weave;`);
  };
  return mat;
}

// ---------- 뼈대 자세 ----------

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();
// 월드 기준 회전을 뼈에 적용
function rotateBoneWorld(bone, qWorld) {
  bone.parent.getWorldQuaternion(_pq);
  const local = _pq.clone().invert().multiply(qWorld).multiply(_pq);
  bone.quaternion.premultiply(local);
  bone.updateMatrixWorld(true);
}
function rotateAxis(bone, axis, deg) {
  rotateBoneWorld(bone, _q.clone().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg)));
}
// bone→child 방향을 목표 방향(월드)으로 돌림
function aimBone(bone, child, dir) {
  const a = bone.getWorldPosition(V(0, 0, 0));
  const b = child.getWorldPosition(V(0, 0, 0));
  const cur = b.sub(a).normalize();
  rotateBoneWorld(bone, new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()));
}

// 서 있는 자세(정면 +z, 왼쪽 +x)에서 반좌위 자세 만들기
function poseSemiFowler(bones, backrestDeg) {
  const X = V(1, 0, 0);
  const b = (n) => bones[n];
  // 고관절 굴곡: 등받이 각도만큼 다리를 앞으로 → 눕히면 다리가 수평
  for (const s of ['Left', 'Right']) {
    rotateAxis(b(`${s}UpLeg`), X, -backrestDeg);
    rotateAxis(b(`${s}Leg`), X, 8); // 무릎 살짝 굽힘
    rotateAxis(b(`${s}Foot`), X, 22); // 누운 자세에서 발끝이 살짝 발치 쪽으로 (자연스러운 족저굴곡)
  }
  // 머리를 베개에 기댄 채 살짝 앞으로
  rotateAxis(b('Neck'), X, 6);
  rotateAxis(b('Head'), X, 8);
  // 다리 방향(서 있는 기준) — 아래팔을 무릎 쪽으로 놓을 때 사용
  const rad = THREE.MathUtils.degToRad(backrestDeg);
  const legDir = V(0, -Math.cos(rad), Math.sin(rad));
  // 위팔: 몸통 옆으로 내림
  aimBone(b('LeftArm'), b('LeftForeArm'), V(0.3, -1, 0.08));
  aimBone(b('RightArm'), b('RightForeArm'), V(-0.22, -1, 0.14));
  // 최종(침대) 좌표 방향 → 서 있는 자세 좌표로 변환: +x 환자 왼쪽, +y 천장, +z 발치
  const fromBed = (x, y, z) => V(x, y, z).applyAxisAngle(V(1, 0, 0), Math.PI / 2 - rad);
  // 아래팔: 왼팔(수액 쪽, 거치대 방향)은 몸 옆 이불 위에 놓고, 오른팔은 배 위로
  aimBone(b('LeftForeArm'), b('LeftHand'), fromBed(0.36, -0.03, 0.93));
  aimBone(b('RightForeArm'), b('RightHand'), legDir.clone().multiplyScalar(0.75).add(V(0.38, 0.4, 0)));
  // 손: 아래팔 방향으로 펴고 손가락을 살짝 굽힘
  aimBone(b('LeftHand'), b('LeftHandMiddle1'), fromBed(0.22, -0.12, 0.97));
  aimBone(b('RightHand'), b('RightHandMiddle1'), legDir.clone().multiplyScalar(0.75).add(V(0.5, 0.25, 0)));
  for (const s of ['Left', 'Right']) {
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
      for (let i = 1; i <= 3; i++) {
        const bone = b(`${s}Hand${f}${i}`);
        if (bone) bone.rotateX(THREE.MathUtils.degToRad(i === 1 ? 12 : 18));
      }
    }
  }
}

// =============================================================
export function buildPatient({ backrestDeg = 45 } = {}) {
  const group = new THREE.Group();

  // 베개 (등받이를 따라 기울어짐)
  const upper = new THREE.Group();
  upper.position.set(0, 0, HINGE_Z);
  upper.rotation.x = THREE.MathUtils.degToRad(backrestDeg);
  group.add(upper);
  const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.12, 0.4, 4, 0.05), m(0xffffff, { roughness: 0.95 }));
  pillow.position.set(0, 0.05, -0.62);
  upper.add(pillow);

  // 지목 영역/부착 지점 (모델 로드 후 위치가 정해짐)
  const ivArm = new THREE.Group(); // 수액 맞는 팔 = 팔찌 미착용 오류 지목 영역
  group.add(ivArm);
  const ivSite = new THREE.Object3D();
  const o2Port = new THREE.Object3D();
  group.add(ivSite, o2Port);

  const ready = new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
    const model = gltf.scene;
    const bones = {};
    const meshes = {};
    model.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isMesh) { meshes[o.name] = o; o.frustumCulled = false; }
    });

    // --- 외형 손질 ---
    // 모자 제거(머리카락은 남김) → 정수리가 드러난 고령 남성 모습
    const hw = meshes.Wolf3D_Headwear;
    if (hw) {
      removeTriangles(hw.geometry, (...vs) => vs.some((v) => v.y > 1.79 || (v.y > 1.745 && Math.hypot(v.x, v.z) > 0.118)));
      hw.material.map = grayTexture(hw.material.map, 0.6);
    }
    const beard = meshes.Wolf3D_Beard;
    if (beard?.material.map) beard.material.map = grayTexture(beard.material.map, 0.5);
    // 상의 → 병원 환의 줄무늬, 장식(꽃·나비넥타이)은 옷 표면으로 눌러 평평하게
    const top = meshes.Wolf3D_Outfit_Top;
    if (top) {
      const bowtie = (v) => Math.abs(v.x) < 0.075 && v.y > 1.52 && v.y < 1.615 && v.z > 0.105;
      const rose = (v) => v.x < -0.05 && v.x > -0.2 && v.y > 1.36 && v.y < 1.52 && v.z > 0.115;
      const tails = (v) => v.y < 0.93;
      removeTriangles(top.geometry, (a, b, c) => [a, b, c].every((v) => bowtie(v) || rose(v)) || [a, b, c].some(tails));
      top.material = gownMaterial();
    }
    // 신발은 이불 밖으로 튀어나오므로 숨김
    if (meshes.Wolf3D_Outfit_Footwear) meshes.Wolf3D_Outfit_Footwear.visible = false;

    // --- 자세 ---
    model.updateMatrixWorld(true);
    const restHead = bones.Head.matrixWorld.clone(); // 서 있는 자세의 머리 행렬(부착물 계산용)
    poseSemiFowler(bones, backrestDeg);

    // 눕히기: 서 있는 몸을 등받이 각도로 기울임 (얼굴이 천장·발치 쪽을 봄)
    const root = new THREE.Group();
    root.add(model);
    root.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(backrestDeg);
    root.scale.setScalar(PATIENT_SCALE);
    group.add(root);
    group.updateMatrixWorld(true);
    // 골반 위치를 경첩 바로 앞, 매트리스 위로 맞춤
    const hips = group.worldToLocal(bones.Hips.getWorldPosition(V(0, 0, 0)));
    root.position.add(V(0, 0.11, HINGE_Z + 0.1).sub(hips));
    group.updateMatrixWorld(true);

    const toLocal = (wv) => group.worldToLocal(wv.clone());
    const boneLocal = (n) => toLocal(bones[n].getWorldPosition(V(0, 0, 0)));

    // --- 푹신한 천 이불: 다리·발·골반 뼈 위치에 맞춰 덮기 ---
    const segs = [];
    const hipsP = boneLocal('Hips');
    segs.push({ a: hipsP.clone().add(V(-0.1, -0.01, 0.02)), b: hipsP.clone().add(V(0.1, -0.01, 0.02)), r: 0.1 }); // 골반
    for (const s of ['Left', 'Right']) {
      const up = boneLocal(`${s}UpLeg`), knee = boneLocal(`${s}Leg`), ankle = boneLocal(`${s}Foot`);
      const toe = boneLocal(`${s}ToeBase`), toeEnd = boneLocal(`${s}Toe_End`);
      segs.push({ a: up, b: knee, r: 0.085 }); // 허벅지
      segs.push({ a: knee, b: ankle, r: 0.062 }); // 종아리
      segs.push({ a: ankle, b: toe, r: 0.055 }); // 발등
      segs.push({ a: toe, b: toeEnd, r: 0.04 });
    }
    const blanket = buildBlanket(segs, -0.32);
    group.add(blanket.group);

    // --- 비강 캐뉼라: 서 있는 자세 기준 얼굴 좌표 → 현재 머리 위치로 변환 ---
    // (모델 좌표의 Head 행렬 변화량 × 바깥 root 변환)
    const headNow = bones.Head.matrixWorld.clone();
    const rootXf = model.parent.matrixWorld; // root(눕힘·크기·위치)
    const headXf = new THREE.Matrix4().multiplyMatrices(headNow, new THREE.Matrix4().multiplyMatrices(rootXf, restHead).invert());
    const F = (x, y, z) => toLocal(V(x, y, z).applyMatrix4(rootXf).applyMatrix4(headXf)); // 서 있는 자세 모델 좌표(m)
    const cannulaMat = m(0xcdeff5, { transparent: true, opacity: 0.92, roughness: 0.25 });
    group.add(tube([F(-0.03, 1.676, 0.118), F(-0.012, 1.678, 0.134), F(0.012, 1.678, 0.134), F(0.03, 1.676, 0.118)], 0.0032, cannulaMat));
    for (const sx of [-1, 1]) {
      group.add(tube([F(sx * 0.011, 1.678, 0.135), F(sx * 0.011, 1.684, 0.134), F(sx * 0.011, 1.69, 0.128)], 0.0021, cannulaMat, 12));
      // 볼 → 귀 위 → 귀 뒤 → 턱 아래로
      group.add(tube([
        F(sx * 0.03, 1.676, 0.118), F(sx * 0.06, 1.68, 0.09), F(sx * 0.085, 1.7, 0.04),
        F(sx * 0.093, 1.735, -0.005), F(sx * 0.09, 1.71, -0.035), F(sx * 0.08, 1.665, -0.02),
        F(sx * 0.06, 1.615, 0.03), F(sx * 0.03, 1.59, 0.07), F(sx * 0.006, 1.585, 0.085),
      ], 0.0026, cannulaMat));
    }
    const slider = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.016, 16), m(0x9ad7e4, { transparent: true, opacity: 0.95 }));
    const sA = F(0, 1.583, 0.09), sB = F(0, 1.57, 0.1);
    slider.position.copy(sA); slider.quaternion.setFromUnitVectors(V(0, 1, 0), sB.clone().sub(sA).normalize());
    group.add(slider);
    o2Port.position.copy(F(0, 1.55, 0.12));
    group.add(tube([sA, sB, o2Port.position.clone()], 0.0032, cannulaMat, 12));

    // --- 말초정맥 카테터(왼 아래팔 위쪽 면, 수액 거치대 쪽) ---
    const el = boneLocal('LeftForeArm'), wr = boneLocal('LeftHand');
    const axis = wr.clone().sub(el).normalize();
    const up = V(0, 1, 0).addScaledVector(axis, -axis.y).normalize(); // 팔 축에 수직인 위쪽
    const side = new THREE.Vector3().crossVectors(axis, up).normalize();
    const R = 0.034; // 아래팔 반지름(대략)
    const at = (t, u = 0, s = 0) => el.clone().lerp(wr, t).addScaledVector(up, R + u).addScaledVector(side, s);
    const basis = new THREE.Matrix4().makeBasis(side, up, axis.clone().negate());
    const orient = (obj) => { obj.quaternion.setFromRotationMatrix(basis); return obj; };
    const ivParts = new THREE.Group();
    const dressing = orient(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.003, 0.065, 2, 0.0012), m(0xf8fafc, { transparent: true, opacity: 0.45, roughness: 0.2 })));
    dressing.position.copy(at(0.62, 0.0)); ivParts.add(dressing);
    const hub = orient(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.024, 16), m(0x3b82f6, { roughness: 0.4 })));
    hub.rotateX(Math.PI / 2); hub.position.copy(at(0.68, 0.006)); ivParts.add(hub);
    const wings = orient(new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.002, 0.01, 2, 0.0008), m(0x93c5fd)));
    wings.position.copy(at(0.6, 0.003)); ivParts.add(wings);
    ivSite.position.copy(at(0.2, 0.006, 0.012));
    ivParts.add(tube([at(0.73, 0.006), at(0.86, 0.006, 0.004), at(0.9, 0.005, 0.02), at(0.8, 0.005, 0.028), at(0.5, 0.005, 0.02), ivSite.position.clone()], 0.0033, m(0xeef6fb, { transparent: true, opacity: 0.85, roughness: 0.3 })));
    for (const t of [0.84, 0.42]) {
      const tape = orient(new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.003, 0.016, 2, 0.001), m(0xffffff, { roughness: 0.95 })));
      tape.position.copy(at(t, 0.005, 0.01)); ivParts.add(tape);
    }
    ivArm.add(ivParts);
    // 팔찌 미착용 지목 영역: 아래팔~손목을 감싸는 보이지 않는 상자
    const hit = orient(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, el.distanceTo(wr) + 0.12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
    hit.position.copy(el.clone().lerp(wr, 0.6));
    ivArm.add(hit);

    return { model, bones };
  });

  return { group, ivArm, ivSite, o2Port, ready };
}
