# 개발·배포 가이드

사용법은 [README](README.md)를 보세요. 이 문서는 코드를 고치거나 직접 빌드·배포하는 사람을 위한 내용입니다.

## 개발 환경

```sh
npm install
npm run dev
```

데모 백엔드(`demo/backend.ts`)가 함께 뜹니다. 로그인, 항목 생성·조회 같은 가짜 API를 제공합니다.

| 주소 | 내용 |
|---|---|
| http://127.0.0.1:5175/ | 소스를 직접 불러오는 개발용 페이지 |
| http://127.0.0.1:5175/standalone.html | 빌드 결과(`dist/`)를 `init()`으로 붙인 페이지. `?mermaid`를 붙이면 Mermaid 켜짐 |
| http://127.0.0.1:5175/element.html | 빌드 결과를 `<openapi-studio>` 태그로 붙인 페이지 |

`standalone.html`과 `element.html`은 `npm run build`를 먼저 해야 합니다.

## 구조

| 위치 | 역할 |
|---|---|
| `src/index.tsx` | 진입점. `init()`과 `<openapi-studio>` 태그 등록 |
| `src/mermaid.ts` | 별도 Mermaid 번들의 진입점 |
| `src/core/` | 화면과 무관한 로직: OpenAPI 파싱, 시나리오 YAML, 실행 엔진 |
| `src/browser/` | 브라우저 연결: 설정 해석, IndexedDB 저장, 파일 다운로드 |
| `src/ui/` | 화면 (pages / features / entities / shared) |
| `public/` | 파비콘. 빌드 시 `dist/`로 복사 |
| `demo/` | 데모 명세·백엔드·시나리오 |
| `tests/` | 단위 테스트(`*.test.ts`)와 E2E(`e2e/`) |

## 검증

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium   # 처음 한 번
npm run test:e2e
```

E2E는 `dist/` 결과물도 검사하므로 `npm run build` 후에 실행합니다.

## 빌드 결과물

`npm run build`는 두 번 빌드해 `dist/`에 아래 파일을 만듭니다.

| 파일 | 설명 |
|---|---|
| `openapi-studio.standalone.js` | 본 스크립트. React·CSS 포함 |
| `openapi-studio.mermaid.js` | Mermaid 엔진. `mermaid` 옵션을 켰을 때만 내려받음 |
| `*.LICENSES.txt` | 각 번들에 포함된 서드파티 라이선스 |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | 파비콘 |

### CDN 없이 직접 제공하기

`dist/`의 파일을 백엔드 정적 경로(예: Spring Boot `src/main/resources/static/studio/`)에 복사하고 스크립트 주소만 바꿉니다. Mermaid를 쓰면 `openapi-studio.mermaid.js`도 같은 폴더에 둡니다.

```html
<script src="/studio/openapi-studio.standalone.js"></script>
```

## JavaScript 초기화 API

태그 대신 코드로 붙일 수 있습니다.

```js
const studio = await OpenAPIStudio.init({
  element: "#openapi-studio",   // 선택자 또는 HTMLElement
  specUrl: "/v3/api-docs",
  storageKey: "my-backend",
  baseUrl: undefined,           // 생략 시 servers[0] → 명세 origin
  serverName: "backend",        // YAML에 쓰이는 서버 이름
  environmentName: "default",   // 시나리오 environments 검사에 쓰이는 이름
  credentials: "same-origin",
  mermaid: false,               // true 또는 Mermaid 파일 주소
});
studio.destroy();
```

태그 속성은 같은 옵션의 kebab-case(`spec-url`, `storage-key`, `base-url`, `server-name`, `environment-name`, `credentials`, `mermaid`)입니다. 태그를 DOM에서 제거하면 `destroy()`가 호출됩니다.

`baseUrl` 해석 규칙:
- 생략하면 OpenAPI `servers`의 첫 주소(변수 기본값 적용)를 쓰고, 없으면 명세를 제공한 서버의 origin을 씁니다. 상대 주소는 명세 URL 기준입니다.
- path·operation 단위 `servers` 재정의가 있으면 `baseUrl`을 반드시 지정해야 합니다.

## 배포

`v*` 태그를 push하면 GitHub Actions가 검증 후 npm에 배포합니다. npm 인증은 trusted publishing(OIDC)이라 저장소에 토큰이 없습니다.

```sh
npm version patch        # package.json 버전 변경 + 커밋 + v태그 생성
git push --follow-tags   # 태그 push → Publish 워크플로 실행
```

배포 전에 [CHANGELOG](CHANGELOG.md)의 `Unreleased`를 새 버전 제목으로 바꿔 함께 커밋하세요.

| 워크플로 | 실행 시점 | 내용 |
|---|---|---|
| `.github/workflows/ci.yml` | `main` push, PR | 빌드·단위·E2E |
| `.github/workflows/publish.yml` | `v*` 태그 push | 태그와 package.json 버전 일치 확인 → 빌드·E2E → `npm publish` |

배포가 `npm publish` 단계에서 E404로 실패하면 npmjs.com → 패키지 Settings → Trusted Publisher의 값(`aqwsde321` / `openapi-studio` / `publish.yml`)과 **Allow npm publish** 체크를 확인한 뒤, 실패한 실행을 Re-run 하세요.
