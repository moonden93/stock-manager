# 문치과병원 재고관리 시스템

치과병원 재고/입출고/요청 관리 웹 앱입니다. 브라우저에서 바로 동작하며, 모든 데이터는 사용자의 브라우저(localStorage)에 자동 저장됩니다.

## 폴더 구조

```
dental-management/
├── index.html          ← 시작 파일 (이 파일을 브라우저로 열면 앱 실행)
├── README.md           ← 이 문서
├── vercel.json         ← Vercel 배포 설정
├── .gitignore          ← Git 무시 파일 목록
└── js/                 ← JavaScript 모듈들
    ├── 1-config.js                초기 팀 설정
    ├── 2-data-items.js             초기 품목 (시트 26년4월5주차 568개)
    ├── 3-data-history.js           누적 입출고 1,481건
    ├── 4-utils.js                  유틸리티 (금액/이스케이프/주차)
    ├── 5-storage.js                전역 상태 + localStorage/Firebase 저장
    ├── 7-release.js                📤 반출 요청 화면
    ├── 8-manage.js                 📋 반출관리 화면
    ├── 9-inbound.js                📥 입고 화면
    ├── 10-inventory.js             📦 재고 화면
    ├── 11-stats.js                 📊 통계 + AI 분석 화면
    ├── 13-settings.js              ⚙️ 설정 화면
    ├── 14-export.js                Excel 내보내기 + 도움말
    ├── 15-backup.js                자동 백업 + mcFullResetToSheet
    ├── 16-audit-log.js             변경 이력 (Firestore events/)
    ├── 17-requests-collection.js   Phase 2 요청 컬렉션 listener
    └── 99-main.js                  메인 진입점 (탭전환/토스트/모달)
```

## 사용 방법

### 1) 로컬에서 테스트
1. 폴더 전체를 다운로드
2. `index.html`을 더블클릭해서 브라우저로 엽니다
3. 6개 탭(요청/통계/반출관리/입고/재고/설정)이 모두 정상 동작해야 합니다

### 2) GitHub + Vercel 배포
1. 이 폴더를 GitHub에 새 저장소로 업로드
2. [vercel.com](https://vercel.com) → New Project → GitHub 저장소 연결
3. 빌드 설정 없이 바로 배포 (정적 HTML이라 자동 인식)
4. 배포된 URL에 접속하면 어디서든 사용 가능

## 파일별 역할

| 파일 | 역할 | 어떤 화면? |
|------|------|----------|
| `1-config.js` | 초기 팀 목록 | 처음 사용자에게만 적용 |
| `2-data-items.js` | 초기 품목 568개 | 처음 사용자에게만 적용 |
| `3-data-history.js` | 누적 이력 1,432건 | 처음 사용자에게만 적용 |
| `4-utils.js` | 금액 표시, HTML 이스케이프 | 모든 화면 |
| `5-storage.js` | localStorage + Firebase 저장/로드 | 데이터 영속성 |
| `7-release.js` | 반출 요청 (사진 첨부 포함) | 요청 탭 |
| `8-manage.js` | 반출 처리 | 반출관리 탭 |
| `9-inbound.js` | 입고 처리 | 입고 탭 |
| `10-inventory.js` | 재고 조회/수정 | 재고 탭 |
| `11-stats.js` | 팀별/업체별/주차별 통계 + AI 분석 | 통계 탭 |
| `13-settings.js` | 팀/담당자/품목 관리 | 설정 탭 |
| `14-export.js` | Excel/CSV 내보내기 + 도움말 | 통계, 헤더 도움말 |
| `99-main.js` | 탭 전환, 모달, 토스트, 시작점 | 모든 화면 |

## ⚠️ 중요: localStorage 저장 방식

이 앱은 **사용자의 브라우저에 데이터를 저장**합니다. 즉:

- ✅ 사용자가 추가/수정한 데이터는 **그 사용자의 브라우저**에만 저장됨
- ✅ 인터넷 없어도 동작, 다음에 열어도 그대로
- ⚠️ **`2-data-items.js`나 `3-data-history.js`를 수정해도 이미 사용 중인 사용자에게는 반영되지 않습니다** (처음 시작할 때만 사용되는 초기 데이터이기 때문)
- ⚠️ 브라우저를 바꾸거나 시크릿 모드로 열면 데이터가 보이지 않음
- ✅ 설정 탭에서 "엑셀 누적 데이터 다시 불러오기"로 강제 재로드 가능
- ✅ 통계 탭에서 Excel/CSV로 내보내기 가능 (백업용)

## Claude에게 도움 요청할 때

GitHub에 올린 후 특정 화면에 문제가 생기면:

> "GitHub URL: https://github.com/내계정/dental-management
> `js/7-release.js` 파일에서 반출 화면의 장바구니가 표시되지 않습니다."

이렇게 **파일명을 명확히** 알려주면 Claude가 해당 파일만 읽고 수정안을 알려줍니다.

## 화면 안내

- **📤 요청** - 팀별로 자재를 꺼내달라고 요청 (장바구니 방식)
- **🔒 반출관리** - 요청 처리 / 취소 / 되돌리기
- **🔒 입고** - 자재가 들어왔을 때 재고 추가
- **🔒 재고** - 현재 재고 조회/수정 (검색/필터/페이지네이션)
- **📊 통계** - 팀별/업체별/주차별 사용량 통계 + AI 분석 + Excel 내보내기
- **🔒 설정** - 팀/담당자 추가, 품목 추가/수정/삭제

> 첨부 문서(계약서/거래명세서 등)는 PWA 외부 — Google Drive에서 직접 관리합니다.

이 프로젝트는 문치과병원 운영자가 관리합니다.
