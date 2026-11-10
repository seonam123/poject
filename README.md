# 오류의 방 · CRE 호흡기감염 격리환자 (WebXR 프로토타입)

CRE(카바페넴 내성 장내세균) 보균과 호흡기감염(비말주의)이 함께 있는 격리환자 병실을 배경으로 한 **"오류의 방(Room of Errors)"** 교육용 WebXR 프로토타입입니다.
학습자는 가상 병실을 둘러보며 감염관리·환자안전 오류를 찾아냅니다.

- 기술 스택: **Three.js 0.169** + **WebXR** (`VRButton`, XR 컨트롤러) + **Vite 5**
- 실행 환경: PC 브라우저(마우스), Meta Quest 등 WebXR 헤드셋(컨트롤러)
- 배포: **GitHub Pages** (GitHub Actions 자동 배포)

## 1. 처음 설정

필요한 것: [Node.js 20 LTS 이상](https://nodejs.org/), Git

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열면 됩니다.

## 2. VR 헤드셋 테스트

WebXR은 **HTTPS**(또는 localhost)에서만 동작합니다.

| 방법 | 명령 / 절차 | 비고 |
|---|---|---|
| PC에서 VR 흉내 내기 | Chrome에 [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) 확장 설치 → `npm run dev` | 헤드셋 없이 개발할 때 |
| 같은 Wi-Fi의 Quest | `npm run dev:https` → Quest 브라우저에서 `https://<PC의 IP>:5173` 접속 → 인증서 경고 "계속" | 자체 서명 인증서 사용 |
| 배포본 | `https://seonam123.github.io/poject/` | push 후 자동 배포 |

## 3. GitHub Pages 배포 (최초 1회)

1. 이 폴더의 변경 사항을 commit 후 `git push origin main`
2. GitHub 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** 선택
3. **Actions** 탭에서 "Deploy to GitHub Pages"가 끝나면 위 주소로 접속

이후에는 `main`에 push할 때마다 자동으로 배포됩니다.

## 4. 폴더 구조

```
├─ index.html              # 진입점 + HTML HUD
├─ vite.config.js          # 개발 서버 / HTTPS / 빌드 설정
├─ src/
│  ├─ main.js              # 렌더러·카메라·WebXR·입력(마우스/컨트롤러)·VR 패널
│  ├─ room.js              # 격리병실 3D 구성(오브젝트별 hotspot id)
│  ├─ patient.js           # 환자: 인체 GLB 모델 로드·반좌위 자세·환의·캐뉼라·수액 카테터
│  ├─ blanket.js           # 다리 모양에 맞춰 덮이는 푹신한 누빔 이불 + 접어 넘긴 시트
│  ├─ headwall.js          # 침대 머리 위 의료가스·전원 콘솔 + 환자 감시 모니터(실시간 파형)
│  ├─ scenario.js          # ★ 시나리오 데이터: 오류 목록·해설·근거, 정상 물품
│  ├─ game.js              # 발견/오답/시간/점수, 결과 로그
│  └─ style.css
├─ public/models/patient.glb # 환자 인체 모델(Ready Player Me 아바타, three.js 예제에서 가져옴)
├─ docs/scenario-design.md # 시나리오 설계서(중간보고서 초안)
├─ start-server.bat        # 더블클릭하면 로컬 서버 실행 + 브라우저 열기 (Windows)
└─ .github/workflows/deploy.yml
```

## 5. 시나리오 수정 방법

- **오류 추가·수정**: `src/scenario.js`의 `errors` 배열에 항목을 추가하고, `src/room.js`에서 같은 `id`로 오브젝트를 만들어 `add(obj, 'id')`로 등록합니다.
- **정상 물품(오답 유도)**: `distractors`에 추가합니다.
- **3D 모델 교체**: `public/models/`에 `.glb`를 넣고 `GLTFLoader`로 불러와, 기존 도형 대신 같은 id로 등록합니다.

## 6. 현재 포함된 오류 (9개)

| # | 분류 | 오류 |
|---|---|---|
| 1 | 감염관리 | 격리 표지 누락 (접촉주의만 있고 비말주의 없음) |
| 2 | 감염관리 | PPE 카트가 병실 안에 있음 |
| 3 | 손위생 | 손소독제 비어 있음 |
| 4 | 감염관리 | 공용 청진기 사용 |
| 5 | 감염관리 | 투약 카트 격리실 반입 |
| 6 | 환경관리 | 의료폐기물 용기 뚜껑 열림·넘침 |
| 7 | 환자안전 | 침상 난간 내림 |
| 8 | 환자안전 | 환자 확인 팔찌 미착용 |
| 9 | 투약안전 | 수액(항생제) 라벨 미부착 |

> 해설 속 근거 문구는 초안입니다. 최신 질병관리청 지침과 소속 기관 규정으로 검토한 뒤 확정하세요.

## 7. 환자 3D 모델

- `public/models/patient.glb`는 three.js 예제에 포함된 Ready Player Me 아바타입니다. 코드에서 모자를 지우고, 백발·회색 수염으로 바꾸고, 상의를 환의 줄무늬로 바꾼 뒤 반좌위로 자세를 잡습니다.
- **라이선스**: Ready Player Me 아바타 이용 약관을 따릅니다. 교육용 비상업 프로토타입 외로 배포하려면 약관을 확인하거나, Mixamo·MakeHuman 등 사용 조건이 명확한 모델로 교체하세요.
- **교체 방법**: Mixamo식 뼈 이름(`Hips`, `Spine`, `LeftArm`, `LeftForeArm`, `LeftHand`, `Head` 등)을 가진 GLB를 같은 이름으로 넣으면 자세 코드가 그대로 적용됩니다. 옷·머리 메시 이름이 다르면 `patient.js`의 "외형 손질" 부분을 맞춰 주세요.
- 침대 등받이 각도는 `src/room.js`의 `BACKREST_DEG`로 바꿉니다.
