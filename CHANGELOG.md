# 변경 이력

이 프로젝트의 주요 변경 사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [Unreleased]

### 변경
- 시나리오 화면을 검색·그룹 목록과 선택한 항목의 상세 화면으로 구성합니다. 실행 흐름과 최근 결과를 전환하고 시나리오별 최근 결과를 페이지에서 유지합니다.

### 추가
- 시나리오 그룹 지정과 복제 기능을 제공합니다. 수정·YAML 내보내기·삭제는 선택한 항목의 상세 화면에서 실행합니다.

## [0.1.2] - 2026-10-04

### 추가
- 파비콘(`favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`)을 `dist/`에 포함해 CDN으로 제공합니다.

### 변경
- GitHub Actions의 `v*` 태그 배포가 npm trusted publishing으로 동작합니다. 이 버전부터 npm provenance가 붙습니다.

## [0.1.1] - 미배포

버전 번호만 올리고 npm 배포에 실패해 공개되지 않았습니다. 0.1.2에 포함됩니다.

## [0.1.0] - 2026-10-04

최초 공개.

### 추가
- `<openapi-studio spec-url="...">` 태그 또는 `OpenAPIStudio.init()`으로 백엔드 페이지에 적용합니다. React와 CSS를 포함한 단일 스크립트(`openapi-studio.standalone.js`)입니다.
- Swagger UI 기반 API 문서: 검색, 태그 펼치기/접기, Authorize 토큰으로 개별 요청 실행.
- 시나리오 편집·실행: 단계 간 값 연결, 전역변수, 실행 중 값 입력·취소, 응답 검증.
- YAML 시나리오 가져오기(검토 후 저장)와 `.yaml` 다운로드.
- 시나리오·전역변수를 페이지 origin과 `storage-key`로 구분해 브라우저 IndexedDB에 저장합니다.
- 설명의 Mermaid 다이어그램 렌더링(선택). `mermaid` 옵션을 켜면 별도 파일 `openapi-studio.mermaid.js`를 처음 필요할 때 내려받습니다. 기본값은 꺼짐입니다.
- 번들에 포함된 서드파티 라이선스 고지(`dist/*.LICENSES.txt`).
- CI(빌드·단위·E2E)와 `v*` 태그 push 시 npm 자동 배포 워크플로.

### 제한
- OpenAPI 3.0/3.1, 백엔드 1개, JSON 요청 본문만 지원합니다.
- 한 페이지에 Studio 하나만 사용할 수 있습니다.

[Unreleased]: https://github.com/aqwsde321/openapi-studio/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/aqwsde321/openapi-studio/compare/bd5a044...v0.1.2
[0.1.0]: https://github.com/aqwsde321/openapi-studio/tree/bd5a044
