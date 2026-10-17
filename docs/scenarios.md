# 프로젝트 시나리오 작성 가이드

이 문서는 사람과 에이전트가 함께 사용하는 OpenAPI Studio YAML 규칙입니다. 별도 에이전트 스킬 설치 없이 프로젝트에 복사해 사용할 수 있습니다. npm 패키지에는 이 가이드와 `templates/`가 포함됩니다.

## 설치할 때 결정할 경로

먼저 프로젝트의 실제 정적 리소스 제공 설정과 OpenAPI 명세 URL을 확인합니다. 예를 들어 Spring Boot의 기본 정적 리소스 경로를 사용하는 경우 다음과 같이 배치할 수 있습니다. 설정이 다르면 그 설정을 따릅니다.

```text
src/main/resources/static/
├── api-studio.html
└── api-scenarios/
    ├── index.json
    └── users/list.yaml
docs/
└── api-scenarios.md
```

다른 프레임워크도 `api-studio.html` 옆에 `api-scenarios/`를 두면 같은 구성을 사용할 수 있습니다. 단순히 로컬 폴더에 저장하는 것과 HTTP로 제공되는 것은 다릅니다. URL로 파일을 읽을 수 있도록 서버의 정적 리소스 설정에 연결하세요.

프로젝트 가이드에는 아래 항목을 실제 값으로 채워 기록합니다.

| 항목 | 예시 |
|---|---|
| Studio HTML 파일 | `src/main/resources/static/api-studio.html` |
| YAML 저장 폴더 | `src/main/resources/static/api-scenarios/` |
| 시나리오 목록 파일 | `src/main/resources/static/api-scenarios/index.json` |
| Studio 페이지 URL | `/api-studio.html` |
| 목록 URL | `/api-scenarios/index.json` |
| OpenAPI 명세 URL | `/v3/api-docs` |
| 리소스 갱신 방법 | 개발 서버가 원본을 제공하는지, 빌드·복사·재시작이 필요한지 |

`templates/api-studio.html`과 `templates/api-scenarios/index.json`을 시작점으로 사용합니다. `spec-url`은 실제 명세 URL로 바꾸고, 페이지의 `scenarios-url="./api-scenarios/index.json"`을 유지하거나 실제 목록 URL로 바꿉니다. 기존 파일을 덮어쓰지 않습니다.

프로젝트의 기존 에이전트 지침 파일에 다음 내용을 추가합니다. 지침 파일이 없다면 프로젝트 루트에 `AGENTS.md`를 만들고 참조를 남깁니다.

```text
API 시나리오를 만들거나 수정하기 전에 docs/api-scenarios.md를 읽는다.
실제 OpenAPI 명세를 기준으로 YAML을 작성하고 지정된 api-scenarios 폴더에 저장한다.
새 파일·이름 변경·삭제는 index.json에도 반영한다.
실제 토큰·비밀번호·개인정보를 YAML에 넣지 않는다.
시나리오 작성과 API 실행을 구분하고, 실행은 사용자가 요청한 범위에서만 수행한다.
```

## 파일 목록

`index.json`은 다음 형식을 사용합니다. 아직 시나리오가 없다면 `scenarios`를 빈 배열로 둡니다.

```json
{
  "version": 1,
  "scenarios": [
    { "file": "users/list.yaml", "groupPath": ["회원"], "tags": ["조회"] }
  ]
}
```

- `file`: 필수. `index.json`과 같은 폴더 또는 하위 폴더의 `.yaml` / `.yml` 파일 경로입니다. 목록 파일 기준 상대 경로를 사용하세요.
- `groupPath`: 선택. 화면에 표시할 그룹 경로를 문자열 배열로 씁니다.
- `tags`: 선택. 시나리오 메타데이터입니다.
- 같은 파일은 한 번만 등록합니다. 목록은 최대 100개이며, 목록과 각 YAML은 각각 1MB 이하입니다.
- 다른 origin의 YAML, 상위 폴더, 쿼리·해시가 붙은 파일 주소는 지원하지 않습니다. 목록과 파일 URL은 리다이렉트 없이 직접 내용을 반환해야 합니다.
- 목록·YAML 요청은 `credentials` 설정에 따라 브라우저 인증 정보를 사용합니다. 명세 입력창에서 입력한 Basic 계정이나 API 호출용 Bearer 토큰을 전달하지 않습니다. 인증 오류가 나면 이 파일들의 서버 접근 설정을 확인하세요.

목록은 JSON이고 각 시나리오는 YAML입니다. JSON 목록의 `version: 1`을 YAML에 넣지 마세요.

## 가장 작은 시나리오

아래 `/users`는 설명용입니다. 실제 명세에 있는 경로와 응답 상태로 바꿉니다.

```yaml
name: 회원 목록 조회
server: backend
steps:
  - api: GET /users
    expect:
      - source: status
        operator: equals
        value: 200
```

최상위 필드는 `name`, `description`, `server`, `auth`, `onFailure`, `environments`, `steps`, 선택적 `id`만 지원합니다. 보통 `id`는 생략합니다. 프로젝트 목록의 항목은 파일 URL로 식별되므로 같은 이름의 파일도 서로 덮어쓰지 않습니다. 파일 이름을 바꾸면 새 항목으로 취급합니다.

- `name`: 필수. 목록에서 구분하기 쉬운 업무 흐름 이름입니다.
- `server`: 보통 `backend`를 씁니다. 단계마다 지정할 수도 있지만 Studio는 한 백엔드만 지원합니다.
- `auth`: 선택. `globals.accessToken`처럼 Bearer 토큰을 가진 전역변수 이름입니다.
- `onFailure`: 기본값 `stop`. 실패해도 다음 단계를 실행해야 할 때만 `continue`를 씁니다.
- `environments`: 선택. 초기화의 `environmentName`과 일치하는 이름 목록입니다. 기본 환경 이름은 `default`입니다.
- `steps`: 필수. 실행 순서대로 하나 이상의 단계를 씁니다.

## API와 요청값

각 단계의 `api`는 `POST /items` 같은 **대문자 메서드 + 명세의 경로** 문자열입니다. 절대 URL, `operationId` 객체, 실제 ID가 들어간 경로를 쓰지 않습니다.

```yaml
name: 항목 생성 및 조회
server: backend
steps:
  - name: 생성
    api: POST /items
    body:
      name: 테스트 항목
    expect:
      - { source: status, operator: equals, value: 201 }
  - name: 조회
    api: GET /items/{id}
    pathParams:
      id: "{{steps.1.response.body./id}}"
    query:
      detail: true
    headers:
      Accept: application/json
    expect:
      - { source: body, pointer: /name, operator: equals, value: 테스트 항목 }
```

`pathParams`, `query`, `headers`, `body`는 단계 바로 아래에 둡니다. `request:`로 감싸지 않습니다. 헤더 값은 문자열입니다. JSON 요청 본문만 실행할 수 있고, GET/HEAD에는 본문을 보내지 않습니다. 쿠키는 브라우저가 관리하므로 직접 `cookies`나 `Cookie` 헤더를 작성하지 않습니다. 필수 필드·자료형·경로·응답 구조는 실제 명세를 확인합니다.

## 앞 단계 값 연결

단계 번호는 **1부터 시작**하며 현재 단계보다 앞선 단계만 참조할 수 있습니다. 표현식 전체를 따옴표로 감쌉니다.

| 표현식 | 의미 |
|---|---|
| `"{{steps.1.response.body./data/id}}"` | 1단계 응답 JSON의 `data.id` |
| `"{{steps.1.response.header.X-Request-Id}}"` | 1단계 응답 헤더 |
| `"{{steps.1.request.body./name}}"` | 1단계 요청 JSON의 `name` |
| `"{{steps.1.request.query./page}}"` | 1단계 요청 쿼리의 `page` |
| `"{{globals.accessToken}}"` | 브라우저에 설정한 전역변수 |
| `"{{inputs.username}}"` | 해당 단계나 앞 단계에서 선언한 실행 입력 |

본문 경로는 JSON Pointer입니다. `/data/items/0/id`는 첫 번째 항목의 ID이고, 키에 `/`가 있으면 `~1`, `~`가 있으면 `~0`으로 표기합니다. 표현식 하나만 쓰면 원래 JSON 값의 자료형을 유지합니다. 문자열의 일부로 넣으면 문자열로 치환됩니다.

단계 순서를 바꿀 때는 모든 `steps.N` 참조도 확인합니다. 내부 형식인 `vars`, `valueBindings`, 단계 `id`는 작성하지 않습니다.

## 인증과 실행 입력

파일에는 실제 토큰이나 비밀번호를 저장하지 않습니다. 실행 입력을 선언하거나 브라우저의 전역변수로 설정합니다.

```yaml
name: 로그인 후 내 정보 조회
server: backend
auth: globals.accessToken
steps:
  - name: 로그인
    api: POST /auth/login
    auth: none
    inputs:
      - { name: username, label: 테스트 계정 아이디 }
      - { name: password, label: 테스트 계정 비밀번호 }
    body:
      username: "{{inputs.username}}"
      password: "{{inputs.password}}"
    extract:
      - { pointer: /accessToken, target: globals.accessToken }
  - name: 내 정보
    api: GET /me
    expect:
      - { source: body, pointer: /id, operator: exists }
```

경로·요청 필드·토큰 경로는 설명용이므로 실제 명세에 맞게 변경하세요. 위 로그인 단계는 기본 인증을 `auth: none`으로 해제하고, 추출한 토큰을 다음 단계부터 사용합니다. 토큰 변수에는 `Bearer ` 접두사를 넣지 않습니다. `auth`와 `Authorization` 헤더를 중복 지정하지 않습니다.

단계의 `inputs`는 `name`, 선택적 `label`, `type`, `required`를 지원합니다. `type`은 `string`(기본), `number`, `boolean`, `object`, `array`이고 `required` 기본값은 `true`입니다. 이름은 영문자로 시작하는 영문·숫자·밑줄입니다. 입력은 필요한 단계에서 요청되며, 같은 이름의 기존 값이 있으면 재사용될 수 있습니다. `sensitive`는 마스킹이나 비밀 저장을 보장하는 옵션이 아닙니다.

`extract`는 성공한 응답에서 전역변수로 값을 저장합니다. 본문은 `pointer`, 헤더는 `source: header`와 `header`를 지정하고 `target: globals.이름`을 씁니다. 전역변수는 브라우저에 유지됩니다. 한 시나리오에서만 값을 전달하려면 앞 단계 참조를 사용하세요.

## 응답 검증

`expect`는 검증 항목 목록입니다.

| 필드 | 값 |
|---|---|
| `source` | `status`, `body`, `header` |
| `pointer` | `body`일 때 필수. 전체 본문은 빈 문자열 `""` |
| `header` | `header`일 때 필수. 헤더 이름 |
| `operator` | `equals`, `exists`, `contains` |
| `value` | `equals` / `contains`일 때 필수. JSON 자료형을 유지해서 작성 |

HTTP 상태 검증을 생략하면 기본적으로 2xx를 기대합니다. 실패 상태를 검증하려면 상태 기대값을 직접 씁니다. `equals`는 JSON 값과 자료형을 비교하고, `contains`는 문자열 부분 포함 또는 배열 원소 일치를 확인합니다. `exists`는 값이 존재하는지 확인합니다. 기대값에도 앞 단계 참조를 사용할 수 있습니다.

## 에이전트 작성 절차

1. 이 프로젝트 가이드와 OpenAPI 명세를 읽고 실제 API·필수 입력·응답 구조를 확인합니다.
2. 사용자가 요청한 흐름을 YAML로 작성합니다. 최초 설치 예제는 가능한 경우 안전한 조회 API 하나로 구성하고, 경로를 임의로 만들지 않습니다.
3. YAML을 지정된 `api-scenarios/`에 저장하고 `index.json`의 파일 경로·그룹을 등록합니다. 기존 항목은 보존합니다.
4. 정적 리소스 갱신 방법에 따라 서버에 반영하고 Studio에서 **프로젝트 다시 불러오기**를 누릅니다.
5. 선택한 시나리오의 문법·필수값·API 연결 안내를 확인합니다. 목록 표시는 API 실행 성공을 의미하지 않습니다. 실행 요청이 없으면 API를 호출하지 않습니다.
6. 생성·수정한 경로와 확인 결과, 미확인 항목을 보고합니다.

예제 전체는 npm 패키지의 `templates/api-scenarios/login-and-create.example.yaml`에 있습니다. 예제는 빈 목록에 자동 등록하지 않으며, 실제 프로젝트에 맞게 바꾼 뒤 등록합니다. 현재 `init` / `validate` CLI는 제공하지 않습니다. npm은 Studio·가이드·템플릿의 배포 수단이고 이 문서는 에이전트 종류에 관계없이 사용할 규칙입니다.

## 저장·갱신과 파일 반영

프로젝트 YAML은 읽기 전용으로 로드됩니다. **브라우저 사본 만들기**로 복사한 뒤 수정·실행할 수 있지만 원본 파일에는 자동 저장되지 않습니다. 원본에 반영하려면 사본을 YAML로 내보내서 프로젝트 파일을 교체하고 Git diff를 확인합니다. 새 파일이면 목록에도 추가합니다. 내보내기는 다운로드이며 폴더 동기화가 아닙니다.

**프로젝트 다시 불러오기**는 목록과 YAML을 다시 요청합니다. 파일 하나라도 읽기·문법 오류가 있으면 기존 프로젝트 목록 전체를 유지하고 오류를 표시합니다. 정상 로드 시 삭제된 목록 항목도 화면에서 제거하며 브라우저 사본은 보존합니다. 파일 내용이 바뀌면 이전 실행 결과를 새 내용의 결과로 표시하지 않습니다.

프로젝트 YAML이 가리키는 API 요청은 사용자가 실행 버튼을 눌렀을 때만 전송합니다. YAML과 목록은 서버가 제공하는 파일이므로 문서 페이지와 동일하게 접근 권한을 관리하고 실제 비밀값·개인정보를 넣지 마세요.
