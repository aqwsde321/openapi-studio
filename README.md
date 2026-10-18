# OpenAPI Studio

[![npm 버전](https://img.shields.io/npm/v/openapi-studio.svg)](https://www.npmjs.com/package/openapi-studio)
[![CI](https://github.com/aqwsde321/openapi-studio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aqwsde321/openapi-studio/actions/workflows/ci.yml)
[![라이선스](https://img.shields.io/npm/l/openapi-studio.svg)](LICENSE)

백엔드 페이지에 태그 한 줄로 붙이는 API 문서 + 시나리오 테스트 도구입니다.

OpenAPI 3.0/3.1 명세를 제공한다면 백엔드 프레임워크와 관계없이 사용할 수 있습니다. 기존 Swagger UI와 같은 명세를 연결하면 됩니다.

npm 패키지: [openapi-studio](https://www.npmjs.com/package/openapi-studio)

- OpenAPI 명세로 API 문서를 보여주고, 바로 요청을 보내볼 수 있습니다.
- 로그인 → 토큰 저장 → 생성 → 조회처럼 여러 API를 이어 실행하는 **시나리오**를 만들고 저장합니다.
- 서버 설치나 회원가입이 필요 없습니다. 화면에서 만든 시나리오는 브라우저에 저장하고, 프로젝트의 YAML 파일도 연결해 실행할 수 있습니다.

## 빠른 시작

`api-studio.html` 파일 하나를 만들고 아래 내용을 넣습니다. 백엔드의 정적 파일 경로에 두고 웹에서 열면 됩니다. 별도 npm 설치나 빌드는 필요 없습니다.

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenAPI Studio</title>
</head>
<body style="margin:0">
  <openapi-studio spec-url="/openapi.json"></openapi-studio>
  <script src="https://cdn.jsdelivr.net/npm/openapi-studio@latest/dist/openapi-studio.standalone.js"></script>
</body>
</html>
```

`/openapi.json`은 예시입니다. `spec-url`을 현재 프로젝트의 **OpenAPI 명세(JSON/YAML) 주소**로 바꾸세요. Swagger UI 화면 주소가 아니라 그 화면이 불러오는 명세 주소입니다. `@latest`는 최신 배포 버전을 사용합니다. 운영에서 업데이트 영향을 통제하려면 `@latest` 대신 특정 버전을 지정하세요.

### AI로 설정하기

프로젝트를 읽을 수 있는 AI 코딩 도구에 아래 프롬프트를 전달하면 됩니다.

```text
현재 프로젝트에 OpenAPI Studio와 프로젝트 시나리오 폴더를 추가해줘.

- 프로젝트가 제공하는 OpenAPI 3.0/3.1 명세의 JSON/YAML 주소를 찾아줘.
  Swagger UI가 있다면 그 화면이 불러오는 명세를 사용해줘.
  명세가 없거나 Swagger 2.0만 제공한다면 먼저 알려줘.
- 이 프로젝트에서 정적 HTML을 제공하는 경로에 api-studio.html을 만들어줘.
- 같은 정적 리소스 경로에 api-scenarios/ 폴더와 index.json을 만들어줘.
  목록의 초기 내용은 {"version":1,"scenarios":[]}이야. 기존 파일은 보존해줘.
- HTML에 아래 태그와 스크립트를 넣고, spec-url을 찾은 명세 주소로 바꿔줘.
  scenarios-url은 HTML 기준 상대 경로야. 프로젝트의 실제 제공 URL에 맞춰줘.

  <openapi-studio spec-url="/openapi.json" scenarios-url="./api-scenarios/index.json"></openapi-studio>
  <script src="https://cdn.jsdelivr.net/npm/openapi-studio@latest/dist/openapi-studio.standalone.js"></script>

- OpenAPI Studio의 docs/scenarios.md를 읽고 프로젝트의 docs/api-scenarios.md에
  작성 규칙, 실제 저장 폴더, 목록·페이지 URL, 갱신 방법을 기록해줘.
  원문: https://github.com/aqwsde321/openapi-studio/blob/main/docs/scenarios.md
  npm 패키지에도 docs/scenarios.md와 templates/가 포함돼 있어.
- 프로젝트의 기존 에이전트 지침 파일에 시나리오 작성 전 이 가이드를 읽도록 추가해줘.
  지침 파일이 없다면 루트 AGENTS.md에 참조를 남겨줘. 기존 내용은 보존해줘.
- 실제 명세와 일치하는 안전한 조회 시나리오 하나를 YAML로 만들고 index.json에 등록해줘.
  예제 API 경로를 그대로 사용하거나 토큰·비밀번호·실제 개인정보를 파일에 넣지 마.
  실행은 명시적으로 요청받았을 때만 해줘. 적절한 조회 API가 없으면 목록을 비워둬.
- 페이지는 가능하면 API와 같은 origin에서 제공하고, 기존 인증·접근 권한을 유지해줘.
  YAML과 목록 파일에도 같은 접근 권한을 적용해줘.
- 적용 후 실제 생성 경로, 접속 URL, 시나리오가 목록에 표시되는지 확인한 결과를 알려줘.
```

## 설정

`<openapi-studio>` 태그의 속성으로 설정합니다.

| 속성 | 설명 |
|---|---|
| `spec-url` | **필수.** OpenAPI 명세 주소 |
| `scenarios-url` | 프로젝트 시나리오 목록 JSON 주소. 페이지 URL 기준으로 해석하며, 생략하면 브라우저 시나리오만 사용합니다. |
| `storage-key` | **선택.** 저장 데이터를 구분하는 이름. 생략하면 명세 주소를 사용합니다. 명세 주소가 바뀌어도 같은 저장 데이터를 쓰려면 고정값을 지정합니다. |
| `base-url` | API 요청을 보낼 주소. 없으면 명세의 `servers` 첫 주소, 그것도 없으면 명세를 제공한 서버를 사용합니다. |
| `mermaid` | API 설명의 Mermaid 다이어그램을 그림으로 표시합니다. 아래 참고 |
| `credentials` | 다른 도메인으로 쿠키를 보내야 할 때 `include` |

### Mermaid 다이어그램

API 설명에 ```` ```mermaid ```` 블록을 쓴다면 `mermaid` 속성을 추가합니다.

```html
<openapi-studio spec-url="/openapi.json" mermaid></openapi-studio>
```

다이어그램을 처음 열 때 필요한 파일을 추가로 내려받습니다. 속성이 없으면 다이어그램 원문이 코드로 표시됩니다.

## 사용법

- **API 문서** 탭: API를 검색하고 펼쳐 봅니다. 인증이 필요하면 **Authorize**에 토큰을 넣고 요청을 실행합니다.
- **시나리오** 탭: 왼쪽 목록에서 시나리오를 찾고, 오른쪽에서 실행 흐름과 최근 결과를 확인합니다.
  - **+ 새 시나리오**로 API를 골라 단계를 만들고, 앞 단계 응답값을 다음 요청에 연결합니다.
  - 그룹으로 정리하고, 상세 화면에서 복제·YAML 내보내기·삭제를 합니다.
  - **YAML 가져오기**로 다른 사람이 내보낸 시나리오를 불러옵니다.
- **전역변수**: 토큰처럼 여러 시나리오에서 함께 쓰는 값입니다. 오른쪽 위 `{ } 전역변수`에서 관리합니다.

## 프로젝트 파일로 시나리오 관리하기

에이전트가 YAML을 작성하고 팀이 Git으로 공유하려면 서버가 제공하는 정적 리소스 폴더에 파일을 둡니다. 폴더에 저장한 뒤 서버에서 URL로 읽을 수 있어야 합니다.

```text
<백엔드 정적 리소스 폴더>/
├── api-studio.html
└── api-scenarios/
    ├── index.json
    └── users/list.yaml
docs/
└── api-scenarios.md       # 실제 프로젝트 경로와 YAML 작성 규칙
```

예를 들어 Spring Boot의 기본 정적 리소스 경로를 사용하는 프로젝트라면 `src/main/resources/static/api-scenarios/`에 저장합니다. 다른 프레임워크나 경로를 재설정한 프로젝트는 실제 정적 파일 제공 경로를 사용하세요.

`index.json`은 폴더 자동 탐색 대신 읽을 파일을 명시합니다. `file`은 목록 파일 기준 상대 경로입니다.

```json
{
  "version": 1,
  "scenarios": [
    { "file": "users/list.yaml", "groupPath": ["회원"], "tags": ["조회"] }
  ]
}
```

```html
<openapi-studio spec-url="/openapi.json" scenarios-url="./api-scenarios/index.json"></openapi-studio>
```

- 처음 열 때 등록된 YAML을 불러옵니다. 목록에서 **프로젝트 YAML** 표시로 구분합니다.
- 에이전트가 파일을 수정하면 **프로젝트 다시 불러오기**를 누릅니다. 서버가 빌드 결과를 제공한다면 먼저 리소스 복사·빌드·재시작이 필요할 수 있습니다.
- URL로 불러온 프로젝트 파일은 읽기 전용입니다. 실행·YAML 내보내기가 가능하며, **브라우저 사본 만들기**로 편집 가능한 복사본을 만들 수 있습니다.
- 화면에서 만든 사본을 파일로 반영하려면 아래의 **로컬 폴더 연결**을 사용하거나, 내보낸 YAML을 프로젝트에 복사하고 `index.json`에 등록하세요.
- 불러오기 실패 시 기존 목록을 유지하고 오류를 표시합니다. 전체 파일을 정상적으로 읽은 뒤 목록을 교체하며 브라우저 사본은 보존합니다.

[시나리오 작성 가이드](docs/scenarios.md)에 YAML 규칙과 에이전트 작업 절차가 있습니다. npm 패키지의 `templates/`에는 시작용 HTML·빈 목록·예제 YAML이 포함됩니다. 현재 `npx openapi-studio init`이나 `validate` 명령은 제공하지 않습니다.

### 개인 로컬 폴더와 연결하기

시나리오 탭의 **로컬 폴더 연결**을 누르고 프로젝트의 `api-scenarios` 폴더를 선택해 읽기·쓰기를 허용합니다. 별도 저장 API 없이 브라우저가 파일을 직접 읽고 씁니다. `scenarios-url`이 없어도 사용할 수 있습니다.

1. 연결 중에는 선택한 폴더의 `index.json`에 등록된 YAML과 브라우저 시나리오를 표시합니다. 빈 폴더도 연결할 수 있으며 첫 저장 때 목록을 만듭니다.
2. **로컬 YAML** 항목의 **수정 → 프로젝트에 저장**은 원래 파일과 그룹·태그 정보를 갱신합니다.
3. 브라우저에서 만든 시나리오는 상세의 **프로젝트에 저장**에서 새 파일명을 지정합니다. YAML 생성과 목록 등록을 함께 처리하고 브라우저 사본도 유지합니다. 이후 파일 수정은 로컬 YAML 항목에서 합니다.
4. 에이전트가 파일을 수정했다면 **폴더 다시 불러오기**를 누릅니다. 서버 리소스 빌드 없이 로컬 원본을 읽습니다.
5. 연결은 현재 탭에서 유지됩니다. 새로고침하면 다시 연결하고, **폴더 연결 해제**는 파일을 지우지 않습니다.

지원 브라우저의 localhost 또는 HTTPS 환경에서 사용할 수 있습니다. 폴더 선택 기능이 없는 환경에서는 연결 버튼 대신 지원 안내를 표시하며 YAML 가져오기·내보내기를 계속 사용할 수 있습니다. [브라우저 폴더 선택 API 안내](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

저장 전에 YAML과 목록이 마지막으로 읽은 내용과 같은지 확인합니다. 다른 곳에서 변경됐다면 저장을 중단하므로 편집 중인 YAML을 보관하고 폴더를 다시 불러오세요. 파일 두 개를 하나의 작업으로 확정하는 기능은 브라우저 API에 없으므로, YAML 저장 후 목록 갱신이 실패하면 해당 사실을 표시합니다. 이때 같은 파일을 다시 저장하거나 `index.json`을 직접 수정할 수 있습니다. 자동 감시·자동 덮어쓰기는 하지 않습니다. 공유할 때는 필요한 YAML을 따로 전달하세요.

## 알아둘 점

- **저장 위치**: 화면에서 만든 시나리오와 전역변수는 브라우저에 저장되며 사이트 데이터를 지우면 사라집니다. 연결한 프로젝트 YAML은 서버에서 읽으며 브라우저 저장소에 복사하지 않습니다. 팀 공유는 프로젝트 파일과 Git 또는 YAML 내보내기를 사용하세요.
- **YAML 공유 시**: 전역변수의 실제 값(토큰 등)은 YAML에 들어가지 않습니다. 직접 입력한 요청값은 들어갑니다.
- **실행 결과**: 최근 결과는 새로고침하면 사라집니다.
- **파비콘**: 기존 아이콘 링크가 없으면 스크립트와 같은 경로의 파비콘을 자동으로 사용합니다. 기존 사이트 아이콘은 유지합니다.
- **명세 접근**: 브라우저에서 명세 URL을 읽을 수 있어야 합니다. 기존 브라우저 인증 정보를 사용하며, 서버가 HTTP Basic 인증을 요구하면 Swagger 계정의 아이디·비밀번호 입력 화면을 표시합니다. 인증 실패 시 다시 입력할 수 있으며 계정은 저장하지 않습니다. 명세 접근용 계정은 API 호출용 Authorize와 별개입니다. 별도 Bearer 헤더 설정은 지원하지 않습니다.
- **다른 도메인의 명세 인증**: 서버에서 `Authorization` 요청 헤더를 CORS로 허용해야 합니다. `WWW-Authenticate` 응답 헤더를 노출하지 않는 서버도 401 응답에서 계정을 입력할 수 있습니다.
- **다른 도메인**: Studio 페이지와 명세·API 서버의 도메인이 다르면 해당 서버에 CORS 설정이 필요합니다. 같은 서버에서 제공하는 구성을 권장합니다.
- **CSP**: Content-Security-Policy를 쓴다면 `script-src`에 `https://cdn.jsdelivr.net`을 추가하세요.

## 지원 범위

- OpenAPI 3.0 / 3.1 (Swagger 2.0 명세는 지원하지 않습니다)
- 명세는 5MB 이하의 JSON/YAML 문서 하나로 제공합니다. 외부 `$ref`가 있다면 하나의 문서로 묶어야 합니다.
- 백엔드 서버 1개, JSON 요청 본문 (파일 업로드·form 요청은 아직 실행할 수 없습니다)
- 한 페이지에 Studio 1개

## 더 보기

- [변경 이력](CHANGELOG.md)
- [개발·배포 가이드](CONTRIBUTING.md): 직접 빌드해 서버에 두는 방법, JavaScript 초기화 API 포함

## 라이선스

MIT. 번들에 포함된 서드파티 라이선스는 `dist/*.LICENSES.txt`에 있습니다.
