# OpenAPI Studio

백엔드 페이지에 붙이는 OpenAPI 문서·시나리오 실행 도구입니다. 별도 설치나 서버 등록 없이 명세 주소를 초기 설정으로 전달합니다.

## 개발

```sh
npm install
npm run dev
```

데모: http://127.0.0.1:5175

## 백엔드에 붙이기

`npm run build` 후 `dist/openapi-studio.standalone.js`를 백엔드의 정적 파일로 제공합니다. React와 CSS를 포함합니다. Mermaid 다이어그램을 쓰려면 `dist/openapi-studio.mermaid.js`도 같은 경로에 둡니다(아래 참고).

가장 간단한 방법은 태그 하나입니다.

```html
<openapi-studio spec-url="/v3/api-docs" storage-key="my-backend"></openapi-studio>
<script src="/assets/openapi-studio.standalone.js"></script>
```

속성: `spec-url`(필수), `storage-key`, `base-url`, `server-name`, `environment-name`, `credentials`, `mermaid`(값 없이 쓰면 켜짐, 값을 주면 Mermaid 파일 주소). 요소를 DOM에서 제거하면 정리됩니다.

JavaScript로 직접 초기화할 수도 있습니다.

```html
<div id="openapi-studio"></div>
<script src="/assets/openapi-studio.standalone.js"></script>
<script>
  OpenAPIStudio.init({
    element: "#openapi-studio",
    specUrl: "/v3/api-docs",
    storageKey: "my-backend"
  }).catch(console.error);
</script>
```

### Mermaid 다이어그램 (선택)

설명(description)의 ```` ```mermaid ```` 블록이나 `<div class="mermaid">`를 다이어그램으로 그리려면 `mermaid: true`를 지정하고 `dist/openapi-studio.mermaid.js`를 본 스크립트와 같은 경로에 함께 제공합니다. 파일은 다이어그램 버튼을 처음 누를 때 내려받습니다. 다른 경로에 두었다면 `mermaid: "/static/openapi-studio.mermaid.js"`처럼 주소를 지정합니다. 기본값은 꺼짐이며, 이때 다이어그램 원문은 코드 블록으로 표시하고 Mermaid 파일은 요청하지 않습니다.

`baseUrl`은 필요할 때 명시할 수 있습니다. 기본값은 OpenAPI `servers`의 첫 주소(변수 기본값 적용), 없으면 명세를 제공하는 서버의 origin입니다. 상대 servers 주소는 명세 URL 기준으로 해석합니다. 현재 버전은 OpenAPI 3.0/3.1, 한 백엔드, JSON 요청 본문을 지원합니다. 각 operation/path의 servers 재정의가 있으면 `baseUrl`을 지정해야 하며, 이 경우 문서와 모든 요청이 지정한 백엔드 주소를 사용합니다.

## 저장과 실행

- 시나리오와 전역변수는 페이지 origin과 storageKey로 구분한 브라우저 IndexedDB에 저장합니다. 다른 PC·브라우저·팀원에게 자동 공유하지 않습니다. 브라우저 데이터 삭제 시 사라집니다.
- 시나리오는 YAML로 작성합니다. 가져오기는 검토 후 저장하고, 내보내기는 `.yaml` 파일로 다운로드합니다. 전역변수의 실제 값은 YAML에 포함하지 않습니다. 직접 입력한 요청값은 포함됩니다.
- API 요청은 브라우저 fetch로 전송합니다. 동일 backend에서 제공하는 구성을 권장합니다. 다른 origin 요청은 해당 backend의 CORS 설정이 필요합니다.
- 쿠키는 브라우저 세션을 사용합니다. Cookie 헤더·Set-Cookie 읽기·쿠키 직접 설정은 지원하지 않습니다. cross-origin 쿠키가 필요하면 `credentials: "include"`를 설정합니다.
- 실행 결과는 현재 화면에만 보관하고 저장하지 않습니다. 전역변수 값은 브라우저에 저장됩니다.
- `init()`은 준비된 핸들 `{ destroy() }`을 반환합니다. 현재 버전은 한 페이지에 한 Studio만 지원합니다.

## 검증

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
npm run test:e2e
```

## 배포

npm에 올리면 jsDelivr·unpkg CDN으로 바로 사용할 수 있습니다. 운영에서는 버전을 고정하세요.

```html
<openapi-studio spec-url="/v3/api-docs" storage-key="my-backend"></openapi-studio>
<script src="https://cdn.jsdelivr.net/npm/openapi-studio@0.1.0/dist/openapi-studio.standalone.js"></script>
```

Mermaid를 켜면 같은 CDN 경로의 `openapi-studio.mermaid.js`를 자동으로 사용합니다.

```sh
npm login
npm publish   # prepublishOnly가 build와 단위 테스트를 먼저 실행
```

## 라이선스

MIT. 번들에 포함된 서드파티 라이선스는 `dist/*.LICENSES.txt`에 있습니다.
