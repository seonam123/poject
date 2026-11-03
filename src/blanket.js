import * as THREE from 'three';

// =============================================================
// 병실 침대용 푹신한 천 이불(누빔 이불)
// - 환자 다리·발 위치(뼈 좌표)에 맞춰 이불 높이를 계산 → 몸 위로 자연스럽게 덮임
// - 다리 사이·발목 쪽은 천이 팽팽하게 이어지도록 높이 맵을 부드럽게(blur) 처리
// - 누빔(퀼팅) 칸마다 도톰하게 부풀고, 바느질선 텍스처·천 광택(sheen) 적용
// - 침대 양옆·발치로 늘어지며 세로 주름, 머리 쪽은 흰 시트를 접어 넘긴 단
// 좌표: 매트리스(다리 쪽) 윗면 중앙이 원점, +z 발치
// =============================================================

const MAT_HALF_W = 0.475; // 매트리스 반폭
const MAT_END_Z = 1.0; // 매트리스 발치 끝
const EDGE_R = 0.035; // 모서리에서 접히는 반경
const SIDE_HANG = 0.13; // 옆으로 늘어지는 길이
const FOOT_HANG = 0.12; // 발치로 늘어지는 길이
const THICK = 0.035; // 이불 두께(몸 위로 떠 있는 정도)
const QUILT = 0.16; // 누빔 칸 크기(m)

function stitchTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f5ef';
  g.fillRect(0, 0, S, S);
  // 면직물 결
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = (i / 4);
    const x = p % S, y = Math.floor(p / S);
    const n = (Math.random() - 0.5) * 10 + ((x + y) % 3 === 0 ? -3 : 0);
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 누빔 바느질선(점선): 타일당 2줄 → QUILT 간격
  g.strokeStyle = 'rgba(150,140,120,0.55)';
  g.lineWidth = 3;
  g.setLineDash([10, 7]);
  for (const t of [1, S / 2]) {
    g.beginPath(); g.moveTo(t, 0); g.lineTo(t, S); g.stroke();
    g.beginPath(); g.moveTo(0, t); g.lineTo(S, t); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// 모서리에서 아래로 접히는 좌표: a(펼친 좌표)가 e를 넘으면 반원으로 꺾여 수직으로 내려감
function fold(a, e) {
  if (a <= e) return [a, 0, 0];
  const d = a - e;
  const arc = (EDGE_R * Math.PI) / 2;
  if (d <= arc) {
    const ang = d / EDGE_R;
    return [e + EDGE_R * Math.sin(ang), -EDGE_R * (1 - Math.cos(ang)), 0];
  }
  return [e + EDGE_R, -EDGE_R - (d - arc), d - arc]; // 마지막 값: 늘어진 길이
}

/**
 * @param {Array<{a:THREE.Vector3,b:THREE.Vector3,r:number}>} segments 몸(다리·발·골반) 캡슐 목록(로컬 좌표)
 * @param {number} z0 이불 머리 쪽 끝(z)
 */
export function buildBlanket(segments, z0 = -0.32) {
  const group = new THREE.Group();

  // ---------- 1) 몸 위 높이 맵 ----------
  const CELL = 0.01;
  const nx = Math.round((2 * MAT_HALF_W) / CELL) + 1;
  const nz = Math.round((MAT_END_Z - z0) / CELL) + 1;
  const raw = new Float32Array(nx * nz);
  const ab = new THREE.Vector2(), ap = new THREE.Vector2();
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * CELL;
    for (let i = 0; i < nx; i++) {
      const x = -MAT_HALF_W + i * CELL;
      let h = THICK;
      for (const { a, b, r } of segments) {
        ab.set(b.x - a.x, b.z - a.z);
        ap.set(x - a.x, z - a.z);
        const t = THREE.MathUtils.clamp(ap.dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
        const px = a.x + ab.x * t, pz = a.z + ab.y * t, py = a.y + (b.y - a.y) * t;
        const d = Math.hypot(x - px, z - pz);
        const R = r * 1.35; // 천이 몸보다 넓게 덮임
        if (d < R) h = Math.max(h, py + r * Math.sqrt(1 - (d / R) ** 2) + THICK);
      }
      raw[j * nx + i] = h;
    }
  }
  // 천의 팽팽함: 흐리게 한 뒤 원래 몸 높이 아래로는 내려가지 않게(다리 사이가 다리처럼 이어짐)
  let hmap = raw.slice();
  const tmp = new Float32Array(hmap.length);
  const K = 4;
  for (let pass = 0; pass < 5; pass++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let k = -K; k <= K; k++) { const ii = i + k; if (ii >= 0 && ii < nx) { s += hmap[j * nx + ii]; n++; } }
      tmp[j * nx + i] = s / n;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let k = -K; k <= K; k++) { const jj = j + k; if (jj >= 0 && jj < nz) { s += tmp[jj * nx + i]; n++; } }
      hmap[j * nx + i] = Math.max(raw[j * nx + i], s / n);
    }
  }
  const H = (x, z) => {
    const fi = THREE.MathUtils.clamp((x + MAT_HALF_W) / CELL, 0, nx - 1.001);
    const fj = THREE.MathUtils.clamp((z - z0) / CELL, 0, nz - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const h00 = hmap[j * nx + i], h10 = hmap[j * nx + i + 1], h01 = hmap[(j + 1) * nx + i], h11 = hmap[(j + 1) * nx + i + 1];
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  };

  // ---------- 2) 펼친 천 → 3D 위치 ----------
  const arc = (EDGE_R * Math.PI) / 2;
  const halfW = MAT_HALF_W + arc + SIDE_HANG;
  const zMax = MAT_END_Z + arc + FOOT_HANG;
  const surf = (su, sz, puffOn = true) => {
    const [fx, dyx, hangX] = fold(Math.abs(su), MAT_HALF_W);
    const [fz, dyz, hangZ] = fold(sz, MAT_END_Z);
    let x = Math.sign(su) * fx;
    let z = fz;
    const top = H(THREE.MathUtils.clamp(x, -MAT_HALF_W, MAT_HALF_W), THREE.MathUtils.clamp(z, z0, MAT_END_Z));
    // 모서리(옆+발치가 겹치는 곳)는 두 방향 중 더 처진 쪽을 따르고 살짝 더 늘어짐
    let y = top + Math.min(dyx, dyz) + 0.25 * Math.max(dyx, dyz);
    // 누빔 칸 부풀기 (윗면에서만)
    if (puffOn) {
      const flat = Math.max(0, 1 - Math.max(-dyx, -dyz) / 0.02);
      const fu = ((su / QUILT) % 1 + 1) % 1, fv = (((sz - z0) / QUILT) % 1 + 1) % 1;
      y += 0.012 * Math.sqrt(Math.sin(Math.PI * fu) * Math.sin(Math.PI * fv)) * flat;
    }
    // 늘어진 부분의 세로 주름과 들쭉날쭉한 단
    if (hangX > 0) {
      const k = Math.min(1, hangX / SIDE_HANG);
      x += Math.sign(su) * 0.012 * k * (0.6 + 0.4 * Math.sin(z * 9)) * (0.5 + 0.5 * Math.sin(z * 31 + su * 3));
      y += 0.006 * k * Math.sin(z * 17);
    }
    if (hangZ > 0) {
      const k = Math.min(1, hangZ / FOOT_HANG);
      z += 0.012 * k * (0.5 + 0.5 * Math.sin(x * 33 + 1.3));
      y += 0.006 * k * Math.sin(x * 19);
    }
    return new THREE.Vector3(x, y, z);
  };

  function surface(uMin, uMax, vMin, vMax, nu, nv, fn) {
    const geo = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) {
      const sv = vMin + ((vMax - vMin) * j) / nv;
      for (let i = 0; i <= nu; i++) {
        const su = uMin + ((uMax - uMin) * i) / nu;
        const p = fn(su, sv);
        pos.push(p.x, p.y, p.z);
        uv.push(su / (QUILT * 2), (sv - z0) / (QUILT * 2));
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  }

  const stitch = stitchTexture();
  const duvetMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: stitch, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xfffcf2), side: THREE.DoubleSide,
  });
  const sheetMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xeef4ff), side: THREE.DoubleSide,
  });

  // 이불 윗면
  const NU = 150, NV = 190;
  const top = new THREE.Mesh(surface(-halfW, halfW, z0, zMax, NU, NV, (u, v) => surf(u, v)), duvetMat);
  group.add(top);
  // 이불 아랫면(두께감) — 윗면을 노멀 반대로 밀어 만든 면
  const underGeo = top.geometry.clone();
  {
    const p = underGeo.attributes.position, n = underGeo.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * 0.03, p.getY(i) - n.getY(i) * 0.03, p.getZ(i) - n.getZ(i) * 0.03);
    underGeo.computeVertexNormals();
  }
  group.add(new THREE.Mesh(underGeo, new THREE.MeshStandardMaterial({ color: 0xe9e5da, roughness: 1, side: THREE.DoubleSide })));
  // 둥근 테두리(가장자리 솔기)
  const rim = (pts) => group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.016, 10), duvetMat));
  const edgeOffset = (p, q) => p.clone().addScaledVector(q, 1);
  const nrm = top.geometry.attributes.normal, tpos = top.geometry.attributes.position;
  const at = (i, j) => {
    const k = j * (NU + 1) + i;
    const p = new THREE.Vector3().fromBufferAttribute(tpos, k);
    const n = new THREE.Vector3().fromBufferAttribute(nrm, k);
    return edgeOffset(p, n.multiplyScalar(-0.015));
  };
  rim(Array.from({ length: NU + 1 }, (_, i) => at(i, NV))); // 발치 단
  rim(Array.from({ length: NV + 1 }, (_, j) => at(0, j))); // 오른쪽 단
  rim(Array.from({ length: NV + 1 }, (_, j) => at(NU, j))); // 왼쪽 단

  // 머리 쪽: 흰 시트를 이불 위로 접어 넘긴 단 (폭 20 cm)
  const CUFF = 0.2;
  const cuff = new THREE.Mesh(
    surface(-halfW, halfW, z0, z0 + CUFF, NU, 24, (u, v) => {
      const p = surf(u, v, true);
      const k = 1 - (v - z0) / CUFF; // 접힌 쪽(머리)이 더 도톰
      return p.add(new THREE.Vector3(0, 0.03 + 0.012 * k, 0));
    }),
    sheetMat,
  );
  group.add(cuff);
  // 접힌 선(둥글게 말린 부분)
  const roll = Array.from({ length: NU + 1 }, (_, i) => {
    const u = -halfW + (2 * halfW * i) / NU;
    return surf(u, z0, true).add(new THREE.Vector3(0, 0.012, -0.004));
  });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(roll), NU, 0.026, 12), sheetMat));
  // 시트 끝단의 얇은 파란 줄(병원 침구)
  const band = Array.from({ length: NU + 1 }, (_, i) => {
    const u = -halfW + (2 * halfW * i) / NU;
    return surf(u, z0 + CUFF - 0.02, true).add(new THREE.Vector3(0, 0.033, 0));
  });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band), NU, 0.003, 6), new THREE.MeshStandardMaterial({ color: 0x7aa7d8, roughness: 0.8 })));

  return { group, heightAt: H };
}
