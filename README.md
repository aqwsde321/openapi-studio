# OpenAPI Studio

[![npm 버전](https://img.shields.io/npm/v/openapi-studio.svg)](https://www.npmjs.com/package/openapi-studio)
[![CI](https://github.com/aqwsde321/openapi-studio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aqwsde321/openapi-studio/actions/workflows/ci.yml)
[![라이선스](https://img.shields.io/npm/l/openapi-studio.svg)](LICENSE)

백엔드 페이지에 태그 한 줄로 붙이는 API 문서 + 시나리오 테스트 도구입니다.

OpenAPI 3.0/3.1 명세를 제공한다면 백엔드 프레임워크와 관계없이 사용할 수 있습니다. 기존 Swagger UI와 같은 명세를 연결하면 됩니다.

npm 패키지: [openapi-studio](https://www.npmjs.com/package/openapi-studio)

- OpenAPI 명세로 API 문서를 보여주고, 바로 요청을 보내볼 수 있습니다.
- 로그인 → 토큰 저장 → 생성 → 조회처럼 여러 API를 이어 실행하는 **시나리오**를 만들고 저장합니다.
- 서버 설치나 회원가입이 필요 없습니다. 데이터는 사용하는 브라우저에 저장됩니다.

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
현재 프로젝트에 OpenAPI Studio를 HTML 파일 하나로 추가해줘.

- 프로젝트가 제공하는 OpenAPI 3.0/3.1 명세의 JSON/YAML 주소를 찾아줘.
  Swagger UI가 있다면 그 화면이 불러오는 명세를 사용해줘.
  명세가 없거나 Swagger 2.0만 제공한다면 먼저 알려줘.
- 이 프로젝트에서 정적 HTML을 제공하는 경로에 api-studio.html을 만들어줘.
- HTML에 아래 태그와 스크립트를 넣고, spec-url을 찾은 명세 주소로 바꿔줘.

  <openapi-studio spec-url="/openapi.json"></openapi-studio>
  <script src="https://cdn.jsdelivr.net/npm/openapi-studio@latest/dist/openapi-studio.standalone.js"></script>

- 페이지는 가능하면 API와 같은 origin에서 제공하고, 기존 인증·접근 권한을 유지해줘.
- 적용 후 HTML 페이지 접속 주소와 명세가 정상 표시되는지 확인한 결과를 알려줘.
```

## 설정

`<openapi-studio>` 태그의 속성으로 설정합니다.

| 속성 | 설명 |
|---|---|
| `spec-url` | **필수.** OpenAPI 명세 주소 |
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

## 알아둘 점

- **저장 위치**: 시나리오와 전역변수는 이 브라우저에만 저장됩니다. 다른 PC나 팀원과 자동으로 공유되지 않으니 YAML 내보내기로 공유하세요. 브라우저 데이터를 지우면 사라집니다.
- **YAML 공유 시**: 전역변수의 실제 값(토큰 등)은 YAML에 들어가지 않습니다. 직접 입력한 요청값은 들어갑니다.
- **실행 결과**: 최근 결과는 새로고침하면 사라집니다.
- **파비콘**: 기존 아이콘 링크가 없으면 스크립트와 같은 경로의 파비콘을 자동으로 사용합니다. 기존 사이트 아이콘은 유지합니다.
- **명세 접근**: 브라우저에서 명세 URL을 읽을 수 있어야 합니다. 명세를 불러올 때는 쿠키 인증을 사용하며, 별도 Bearer 헤더 설정은 지원하지 않습니다.
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
