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

### 개인 개발용 push 검증

현재는 개인 개발 단계이므로 E2E를 로컬 `pre-push` 훅에서 실행합니다. 새 체크아웃에서는 아래 설정을 한 번 실행하세요.

```sh
npm run hooks:install
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
```

훅은 push할 커밋을 checkout한 상태에서 빌드 후 E2E를 실행하고, 실패하면 push를 막습니다. 미커밋 변경이나 추적하지 않는 파일이 있으면 먼저 정리해야 합니다. 브랜치·태그 삭제만 하는 push는 검증을 건너뜁니다.

테스트 서버는 개발 서버와 별도로 `5185` 포트에서 실행하며 기존 서버를 재사용하지 않습니다. 해당 포트가 사용 중이면 서버를 종료한 뒤 다시 push하세요. 테스트 전후에 커밋과 소스가 같은지도 확인합니다.

훅 설치는 이 체크아웃의 Git 설정에만 적용됩니다. 다른 사람의 clone이나 GitHub 웹 편집에는 적용되지 않으며 `--no-verify`로 우회할 수 있습니다. **협업을 시작하기 전에 E2E를 GitHub Actions로 되돌립니다.** `ci.yml`에서 `npm test` 다음, 패키지 생성 전에 `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium`과 `npm run test:e2e`를 복원하고 워크플로 테스트도 함께 바꾸세요.

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

PR 없이 `main`에 직접 push합니다. push 전 로컬 훅에서 E2E를 확인하고, `main` CI가 빌드·단위 테스트를 통과하면 배포용 npm 패키지를 보관합니다. `v*` 태그를 push하면 같은 커밋의 CI 검증 패키지를 받아 npm에 배포합니다. npm 인증은 trusted publishing(OIDC)이라 저장소에 토큰이 없습니다.

```sh
npm version patch        # package.json 버전 변경 + 커밋 + v태그 생성
git push origin main --follow-tags   # main 검증 + 버전 태그 배포
```

배포 전에 [CHANGELOG](CHANGELOG.md)의 `Unreleased`를 새 버전 제목으로 바꿔 함께 커밋하세요.

| 워크플로 | 실행 시점 | 내용 |
|---|---|---|
| `.github/workflows/ci.yml` | `main` push | 빌드·단위 → `npm pack --ignore-scripts` → 패키지 보관 |
| `.github/workflows/publish.yml` | `v*` 태그 push | 태그와 package.json 버전 확인 → 같은 커밋의 성공한 CI 패키지 다운로드·확인 → npm 배포 |

`main` CI의 `setup-node`는 lock 파일 기준으로 npm 다운로드 캐시를 사용합니다. 배포 워크플로는 이미 검증한 `.tgz`를 `npm publish --ignore-scripts`로 배포하므로 npm 설치·빌드·테스트를 반복하지 않습니다. 로컬에서 `npm publish`를 실행하면 기존처럼 `prepublishOnly`가 빌드와 단위 테스트를 실행합니다.

`main`과 태그를 함께 push하면 배포가 같은 커밋의 CI 완료를 최대 10분 기다립니다. 다른 커밋이나 PR의 결과는 사용하지 않으며 CI가 실패·취소되면 배포도 중단됩니다. 기능 브랜치에만 있는 커밋의 태그는 배포할 수 없습니다.

패키지 보관 기간은 7일입니다. 패키지가 없거나 만료되면 해당 커밋의 `main` CI를 Re-run 하고, 성공한 뒤 Publish를 Re-run 하세요. CI를 재실행할 때는 해당 실행 시도의 패키지만 사용합니다.

배포가 `npm publish` 단계에서 E404로 실패하면 npmjs.com → 패키지 Settings → Trusted Publisher의 값(`aqwsde321` / `openapi-studio` / `publish.yml`)과 **Allow npm publish** 체크를 확인한 뒤, 실패한 실행을 Re-run 하세요.
