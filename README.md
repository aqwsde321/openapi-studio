# OpenAPI Studio

백엔드 페이지에 태그 한 줄로 붙이는 API 문서 + 시나리오 테스트 도구입니다.

- OpenAPI 명세로 API 문서를 보여주고, 바로 요청을 보내볼 수 있습니다.
- 로그인 → 토큰 저장 → 생성 → 조회처럼 여러 API를 이어 실행하는 **시나리오**를 만들고 저장합니다.
- 서버 설치나 회원가입이 필요 없습니다. 데이터는 사용하는 브라우저에 저장됩니다.

## 빠른 시작

HTML 파일 하나를 만들고 아래 내용을 넣습니다.

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Studio</title>
</head>
<body style="margin:0">
  <openapi-studio spec-url="/v3/api-docs" storage-key="my-backend"></openapi-studio>
  <script src="https://cdn.jsdelivr.net/npm/openapi-studio@0.1.3/dist/openapi-studio.standalone.js"></script>
</body>
</html>
```

`spec-url`에는 OpenAPI 명세 주소를 넣습니다. 운영에서는 위처럼 버전(`@0.1.3`)을 고정하세요.

### Spring Boot

1. springdoc 등으로 `/v3/api-docs`가 열리는지 확인합니다.
2. 위 HTML을 `src/main/resources/static/api-studio.html`로 저장합니다.
3. `http://localhost:8080/api-studio.html`에 접속합니다.

Spring Security를 쓴다면 두 경로를 열어 주세요.

```java
.requestMatchers("/api-studio.html", "/v3/api-docs/**").permitAll()
```

## 설정

`<openapi-studio>` 태그의 속성으로 설정합니다.

| 속성 | 설명 |
|---|---|
| `spec-url` | **필수.** OpenAPI 명세 주소 |
| `storage-key` | 저장 데이터를 구분하는 이름. 서비스 이름처럼 고정값을 권장합니다. 없으면 명세 주소를 사용합니다. |
| `base-url` | API 요청을 보낼 주소. 없으면 명세의 `servers` 첫 주소, 그것도 없으면 명세를 제공한 서버를 사용합니다. |
| `mermaid` | API 설명의 Mermaid 다이어그램을 그림으로 표시합니다. 아래 참고 |
| `credentials` | 다른 도메인으로 쿠키를 보내야 할 때 `include` |

### Mermaid 다이어그램

API 설명에 ```` ```mermaid ```` 블록을 쓴다면 `mermaid` 속성을 추가합니다.

```html
<openapi-studio spec-url="/v3/api-docs" mermaid></openapi-studio>
```

다이어그램을 처음 열 때 필요한 파일을 추가로 내려받습니다. 속성이 없으면 다이어그램 원문이 코드로 표시됩니다.

### 파비콘

```html
<link rel="icon" href="https://cdn.jsdelivr.net/npm/openapi-studio@0.1.3/dist/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="https://cdn.jsdelivr.net/npm/openapi-studio@0.1.3/dist/apple-touch-icon.png">
```

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
- **다른 도메인 API**: Studio 페이지와 API 서버의 도메인이 다르면 API 서버에 CORS 설정이 필요합니다. 같은 서버에서 제공하는 구성을 권장합니다.
- **CSP**: Content-Security-Policy를 쓴다면 `script-src`에 `https://cdn.jsdelivr.net`을 추가하세요.

## 지원 범위

- OpenAPI 3.0 / 3.1
- 백엔드 서버 1개, JSON 요청 본문 (파일 업로드·form 요청은 아직 실행할 수 없습니다)
- 한 페이지에 Studio 1개

## 더 보기

- [변경 이력](CHANGELOG.md)
- [개발·배포 가이드](CONTRIBUTING.md): 직접 빌드해 서버에 두는 방법, JavaScript 초기화 API 포함

## 라이선스

MIT. 번들에 포함된 서드파티 라이선스는 `dist/*.LICENSES.txt`에 있습니다.
