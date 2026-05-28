# 문치과병원 재고관리 — 프로젝트 컨텍스트

> 이 파일은 Claude Code가 자동으로 읽어 컨텍스트를 파악합니다.
> **기기가 바뀌어도 새 Claude Code 세션이 매끄럽게 이어가도록** 핵심 정보를 정리합니다.
> 의미 있는 변경이 있을 때마다 갱신합니다.

---

## 1. 프로젝트 한 줄 요약

**문치과병원 재고관리 PWA**: 직원이 폰에서 재료 반출을 요청 → 관리자가 PC에서 처리 → 모든 데이터 Firebase로 다중기기 동기화. 정적 PWA(Vercel 배포) + Firestore + Apps Script + GitHub Actions 백업.

- 배포: https://moondentalstock.vercel.app/
- GitHub: https://github.com/moonden93/stock-manager
- Firebase project: `moon-dental-stock` (Spark 무료 플랜)
- 사용자(원장): moonden93@gmail.com

---

## 2. 핵심 아키텍처

### 데이터 저장 흐름
```
사용자 액션 → 메모리 변수 → saveAll()
                              ├→ saveToLocalStorage()  (오프라인 백업)
                              └→ saveToFirebase()      (다중기기 동기화)
```

### Firestore 단일 문서: `appData/main`
필드: `inventory`, `history`, `requests`, `teams`, `teamMembers`, `lastUpdated`
(과거에는 `documents` 필드도 있었지만 2026-05-07 문서함 기능 제거됨. 옛 데이터는 Firestore에 그대로 남아있어도 코드에서 안 읽어 무해.)

### 데이터 보호 패턴 (절대 깨면 안 됨 — 과거 wipe 사고로 학습)
1. **`setDoc(ref, payload, { merge: true })`** 항상 사용. setDoc 통째로 X
2. **빈 필드는 payload에서 제외** — `if (teams.length > 0) payload.teams = teams`
3. **`isDataSuspicious(d)` 체크** — inventory + teams 둘 다 비어있으면 저장 거부
4. **자가 복원** — loadFromFirebase가 cloudIncomplete 감지하면 로컬 데이터 자동 푸시
5. **requests/history는 ID 머지** — 클라우드 우선이지만 로컬 항목 보존 (`mergeByIdPreserveLocal`)
6. **teamMembers 특별 보호** — 클라우드 빈 값으로 로컬을 덮지 않음

상세: [js/5-storage.js](js/5-storage.js)

### Firebase 상태 가시성
헤더에 🟢/🟡/🔴 배지 ([js/99-main.js:setFirebaseStatus](js/99-main.js)).
사용자가 동기화 상태를 항상 볼 수 있음.

---

## 3. 디렉토리 구조

```
/
├── index.html              # 진입점, Firebase SDK + Tailwind CDN
├── manifest.webmanifest    # PWA 매니페스트
├── service-worker.js       # network-first, 외부 리소스 통과
├── js/
│   ├── 1-config.js         # 상수, INITIAL_TEAMS, PREBUILT_TEAMS
│   ├── 2-data-items.js     # INITIAL_ITEMS (시트 26년4월5주차 기준 568개)
│   ├── 3-data-history.js   # PREBUILT_HISTORY (시트 25주차 통합 1481건)
│   ├── 4-utils.js          # escapeHtml, getWeekKey, formatWon, matchesSearch
│   ├── 5-storage.js        # 전역 상태 + load/save (위 보호 패턴 구현)
│   ├── 7-release.js        # 요청 탭 (장바구니, 직접 입력 수량 가능, 사진 첨부)
│   ├── 8-manage.js         # 반출관리 탭 (releasedBy 기록)
│   ├── 9-inbound.js
│   ├── 10-inventory.js
│   ├── 11-stats.js         # 통계 + AI 분석 탭 (월 선택, 코멘트, 코스트 영향)
│   ├── 13-settings.js      # 팀/담당자/품목 관리
│   ├── 14-export.js        # Excel export (수동)
│   ├── 15-backup.js        # 자동 백업 + Excel 생성 + 콘솔 함수
│   └── 99-main.js          # initApp, switchTab, showToast, askConfirm
├── scripts/                # GitHub Actions용 Node.js 백업 스크립트
│   ├── package.json        # xlsx, nodemailer
│   ├── lib-monthly.js      # 월별 Excel 생성 + 코멘트 헬퍼 (공유 모듈)
│   ├── weekly-backup.js    # 매주 토요일 12시 KST
│   ├── monthly-report.js   # 수동 트리거 (과거 월)
│   ├── import-sheets.js    # 시트 → JSON 변환 (1회 실행)
│   ├── sheet-history.json
│   └── sheet-inventory.json
├── apps-script/
│   ├── Code.gs             # Drive 백업 (월별보고 포함, 첫째 토요일 자동 검출)
│   └── SETUP.md            # 셋업 가이드 (클릭 단위 상세)
└── .github/workflows/
    ├── weekly-backup.yml   # cron '0 3 * * 6' (토요일 12 KST)
    └── monthly-report.yml  # workflow_dispatch만 (수동 일회성)
```

---

## 4. 자동 백업 시스템

### 채널 두 개 동시 운영
| 채널 | 시간 | 결과물 |
|---|---|---|
| **GitHub Actions** | 매주 토요일 12:00 KST | Gmail 받은편지함 (Excel 첨부) |
| **Apps Script** | **매일** 12:00 KST | Drive `재고관리 백업/` 폴더 (같은 이름 파일은 휴지통으로 자동 교체) |

### 두 채널 cadence 다른 이유
Drive는 매일 갱신해도 같은 주차 파일은 1개로 유지됨 (덮어쓰기). 이메일은 매일 받으면 스팸이 되니 주간 유지.

### 첨부물 (양쪽 모두 동일)
- `2026년 5월 1주차_재고관리_주차별보고.xlsx` (4시트, AI 코멘트 포함)
- `2026년 5월 1주차_재고관리_재난백업용.xlsx` (6시트)
- **첫째 주 토요일에는** + `월별보고_2026년 4월.xlsx` (6시트, 직전월)
- Apps Script만: **누적 마스터 시트** `2026년 5월 1주차_클로드연동 기존시트` (원본 시트 형식 유지, 매주 직전주 파일 복사 + 새 탭 맨 앞)

### 파일 중복 방지
모든 weekly 파일(주차별보고/재난백업용/누적 마스터/월별보고)은 생성 전에 같은 이름 파일을 휴지통으로 옮김. 같은 주차 재실행 시 항상 새 파일 1개만 남음.

### 누적 마스터 시트 (`..._클로드연동 기존시트`)
- **원본 시트(`1i7SUPAR...`)는 절대 건드리지 않음** — 사용자가 수동으로 시드 파일 `2026년 4월 5주차_클로드연동 기존시트` (원본 전체 탭 복사본)을 `재고관리 백업` 폴더에 넣어둠
- 매주 토요일: `appendToMasterSheet()` 가
  1. 같은 이름 파일이 있으면 휴지통 (재실행 안전)
  2. 폴더에서 가장 최근 `..._클로드연동 기존시트` 파일 탐색
  3. 그 파일을 복사 → 이번 주차 이름으로 변경 (예: `2026년 5월 1주차_클로드연동 기존시트`)
  4. 이번 주차 탭 (예: `26년5월1주차`) 추가 — 컬럼은 원본과 동일 (업체명/종류/품명/규격/단가/현 재고량/기준 재고량/입고량/팀별 출고)
  5. 모든 탭을 newest first로 정렬
- 수동 테스트: `runMasterSheetNow()` (Apps Script 편집기에서 ▶ 실행)

### 사용자 셋업 필요사항 (이미 했거나 진행 중)
- Gmail 앱 비밀번호 + GitHub Secrets (`GMAIL_USER`, `GMAIL_APP_PASSWORD`)
- Apps Script 프로젝트 (script.google.com) → 코드 복붙 → 트리거 등록

### Apps Script는 GitHub 자동 sync 안 됨
코드 변경 후 사용자가 직접 [apps-script/Code.gs](apps-script/Code.gs) raw 내용을 script.google.com에 복붙해야 적용됨. 변경 시 사용자에게 안내 필수.

---

## 5. 데이터 (현재 상태)

### Firebase Firestore 현재
- **inventory**: 568개 (시트 26년4월5주차 스냅샷)
- **history**: 1481건 (시트 2025-10 ~ 2026-04)
- **requests**: 0건 (mcResetToSheetData로 정리됨)
- **teams**: 사용자 설정 그대로 보존
- **teamMembers**: 사용자 설정 그대로 보존

### 시트 import 방식
- 출처: Google Sheets (gid 25개, 11월1주차 ~ 26년4월5주차)
- 변환: `scripts/import-sheets.js` 실행 → `sheet-history.json` + `sheet-inventory.json`
- 적용: 결과를 `js/3-data-history.js` (PREBUILT_HISTORY) + `js/2-data-items.js` (INITIAL_ITEMS)에 박아넣음
- 사용자 콘솔 함수 `mcReimportFromSheets()` / `mcResetToSheetData()`로 1회 재적용

### 팀 매핑 주의사항
- "Dr. 이상민팀"은 **퇴사자**지만 history와 requests는 보존 (옛 기록 분석용)
- 팀 목록(`teams`)과 담당자(`teamMembers`)에서만 제거됨
- 마이그레이션 플래그: `mc_remove_isangmin_v2`

---

## 6. AI 분석 탭 (이상치 명칭 변경됨)

### 핵심 로직 ([js/11-stats.js:renderStatsByAnomaly](js/11-stats.js))
- **진행 중인 달** (예: 5월) → **주평균** vs 직전 3개월 주평균 (공평)
- **완료된 달** (예: 4월) → **월총량** vs 직전 3개월 월평균 (직관적)
- 자동으로 `isIncomplete` 검출 후 단위 전환

### 분석 출력
- 팀별 카드: KPI 미니 그리드 (이번/지난) + 변동률 + 동료 팀 순위
- 자동 코멘트: 환자 수 시그널, 시술 변화, 신규/중단, 비용 영향 정량화
- 비용 영향 TOP 3: 임계치 무관, 절대값 정렬

### 명칭
- **모든 UI/Excel 텍스트는 "AI 분석"** ("이상치"는 팀원이 봤을 때 부정적 → 변경됨)
- 코드 주석/변수는 `anomaly` 그대로 (개발자만 봄)

---

## 7. 콘솔 함수 (디버깅/관리용)

```js
// 백업
mcDownloadReportNow()           // 주차별보고 즉시 다운로드
mcDownloadRecoveryNow()         // 재난백업용 즉시 다운로드
mcDownloadMonthlyReportNow('2026-04')  // 월별보고 (인자 없으면 직전월)
mcSendBackupNow()               // 메일 백업 강제 발송 (5분 쿨다운)
mcResetBackupCooldown()         // 쿨다운 초기화

// 데이터 관리
mcReimportFromSheets()          // history만 시트 데이터로 교체
mcResetToSheetData()            // history + requests 리셋 (담당자/품목 보존)
mcRestoreFromBackup()           // 사고 시 직전 teamMembers 복구

// 진단
mcGetThisWeek()                 // 현재 ISO 주차
```

---

## 8. 진행 중 / 추후 작업

### 우선순위 1: 덴트웹 (DentWeb) 통합
사용자 요청: 환자 데이터 받으면 진짜 검증 가능. 덴트웹 사용 가능해지면 진행.

**제안된 통합 아이디어** (사용자가 제시한 우선순위):
1. **시술별 마진 + 환자 1인당 재료비** ← 가장 즉각적인 경영 효과
2. **예약 기반 발주 권고** ("다음 주 임플란트 8건 → 재료 N개 확보")
3. **자동 재고 차감** (시술 등록 시 재료 자동 출고)

**기타 가능한 통합**:
- 재료비/매출 비율 (업계 평균 ~15-20% 대비)
- Lot 추적성 (의료사고 대비)
- 보험 청구 코드 ↔ 사용 재료 자동 매칭
- 의사별 재료 효율 (같은 시술 다른 사용량)
- 계절성/추세 기반 예측

**필요한 덴트웹 데이터**:
- 의사별 주별/월별 환자수
- 진료 코드별 통계
- 일별 매출

### 우선순위 2: AI 분석 Phase 2
- KPI 대시보드 (재고 회전율, DOH, 안전재고 미만)
- ABC 분류 (A=70%/B=20%/C=10%)
- Slow-moving (3개월 미사용)
- Dead stock (6개월 미사용 + 평가액)
- Stockout risk (현재 < 안전재고)

### 우선순위 3: 검증 필요 항목
- 5/9 토요일 자동 백업 정상 작동 확인
- 6/6 토요일 5월 월별보고 자동 첨부 확인
- Apps Script 코드를 script.google.com에 복붙했는지 확인 필요 (GitHub push 자동 sync 안 됨)
- 4월 월별보고 수동 트리거 (Monthly Report (one-off) workflow, year=2026 month=4) 했는지

### 알려진 이슈/주의
- **5월 첫째 주 토요일(5/2)이 이미 지남** → 4월 자동 월별보고 못 받음 → 수동 트리거 필요
- **Apps Script는 git 자동 sync 안 됨** → 코드 변경 시 사용자에게 복붙 안내 필수
- **2026-02 출고 0건은 시트 자체가 그렇게 적혀있는 것** (운영 안 했거나 누락). 데이터 수정 시 사용자 확인

---

## 9. 사용자 협업 메모

### 결정 패턴
- 빠른 옵션 비교 후 결정 → 즉시 실행 선호
- 디버깅 길어지면 "코드로 해결해줘" — 그땐 가시성 + 방어로직 다층 추가
- 셋업 가이드는 클릭 단위 상세하게 (어디 메뉴, 어느 버튼, 어떤 글자가 보여야)

### 명칭/용어 선호
- "이상치" 같은 부정 표현 회피 → "AI 분석"
- 한국식 파일명 ("2026년 5월 1주차" 형식)

### 데이터 정책
- Dr. 이상민팀 history 보존 (퇴사자지만 분석용)
- 진행 중인 달은 주평균, 완료된 달은 월평균
- 테스트 데이터는 분석에서 제거 (mcResetToSheetData 활용)

---

## 10. 새 PC에서 작업 이어가는 법

1. `git clone https://github.com/moonden93/stock-manager`
2. 새 Claude Code 세션 시작 — 이 파일이 자동으로 읽힘
3. (옵션) Apps Script 셋업 가이드: [apps-script/SETUP.md](apps-script/SETUP.md)
4. (옵션) 시트 재import: `cd scripts && node import-sheets.js`

이 파일이 컨텍스트 단일 진실 원천(SSOT). 새 세션은 여기서부터 시작.

---

_마지막 갱신: 2026-05-05 (사고 + Phase 1 안전 기반 + 요청자 수정/취소)_

---

## 11. 2026-05-05 작업 요약 (사고 + 재설계 시작)

### 사고
- 20:02 KST: 5/3 유현영 5건 production 요청 데이터 wipe됨
- 원인: 시간 기반 머지(commit f26c6f7)가 stale local + 일시적 빈 cloud 상황에서
  옛 로컬 항목 드롭 → ensureStandardTeams_ 자동 saveAll → 클라우드 영구 wipe
- 즉시 revert (commit c50dde7). 데이터는 어디에도 남아있지 않아 복구 불가
- 본질 원인: 단일 문서 구조 + 변경 이력 부재. Phase 1 안전 기반 도입함

### Phase 1 안전 기반 (완료)
- [REDESIGN.md](REDESIGN.md) — 50명 동시접속 안전 운영 5단계 계획
- [js/16-audit-log.js](js/16-audit-log.js) — Firestore `events/` 컬렉션 append-only 변경 이력
  - `logEvent(type, action, payload)` — 카테고리별 기록
  - device id + label + 클라이언트 시간 자동 포함
  - `mcViewRecentEvents()` / `mcViewEventsByType('request')` 콘솔 진단
- saveToFirebase 대량 감소 가드: 30%+ 감소 시 차단 (`_allowMassDecrease=true`로 1회 우회)
- 위험 콘솔 함수 잠금: `mcUnlockDanger("...")` 5분 일시 해제
- 요청 생성/처리/삭제 모두 audit log 자동 기록

### 요청자 본인 수정/취소 + 메모 + 이력 보존 (완료)
- 요청 등록 confirm 모달에 메모 입력 (placeholder "예: 문치과 화이팅")
- 요청 탭 Step 2 직후 "요청관리" 섹션 (같은 팀 대기 요청 ✏️ 수정 / 🗑️ 취소)
- 비밀번호 없이 직원 본인 책임으로 가능
- 취소 = 소프트 취소 (`status='cancelled'`, 데이터 보존)
- 수정 = `editHistory` 배열에 영구 추가 (qtyFrom/To, memoFrom/To, by, at)
- 반출관리 표시:
  - 취소 그룹: 회색 + ❌ 취소 배지 + 취소자/날짜
  - 수정된 항목: `✏️ <s>5</s>→10` 인라인 표시
- 반출관리 상태 탭 3개: 대기 / 완료 / 취소
- 완료/취소 탭은 **주차별 collapsible 그룹** (`toggleManageWeek(wk)`)

### Phase 2 시작 (병렬 쓰기, 비파괴 마이그레이션)
- [js/17-requests-collection.js](js/17-requests-collection.js) — 요청 per-document 컬렉션
- 매 saveAll에 디바운스(1.5초) 후 자동 병렬 upsert
- 단일 문서는 그대로, requests/{id} 컬렉션이 같이 채워짐
- 사고로 단일 문서 wipe돼도 requests/ 컬렉션에 백업 자동 존재
- 콘솔 함수:
  - `mcBackfillRequestsCollection()` — 현재 메모리 → 컬렉션 백필 (1회)
  - `mcCheckRequestsCollection()` — 컬렉션 vs 단일 문서 동기화 확인
- **다음 단계**: 1~2주 검증 후 읽기를 컬렉션으로 cutover (race condition 완전 해소)

### 4탭 + 주차별 그룹 (반출관리)
- 상태 탭: 대기 / 완료 / 취소 / 전체 (NEW)
- 모든 탭에서 주차별 collapsible 그룹
- 현재 주차만 자동 펼침, 과거 주차는 접힘 (탭하면 펼침)
- `_manageExpandedWeeks` 객체로 사용자 토글 상태 보존

### Phase 2 cutover 완료 (race condition 본질 해결)
- requests/ 컬렉션의 onSnapshot listener가 source of truth
- 단일 문서 appData/main.requests는 backup으로 계속 쓰기 (안전망)
- applyCloudData는 컬렉션 listener 활성화되면 단일 문서 requests 무시
- 입력 중일 때 sync 보류 + focusout 후 적용 (입력 깨짐 방지)
- 디바운스 1500ms → 300ms 단축 (실시간성 향상)
- 새 요청 생성 시 즉시 upsertRequestDoc (디바운스 우회로 즉시 반영)
- 효과: 두 기기가 동시에 다른 요청 만들어도 충돌 0 (다른 문서)

### 기기간 실시간 동기화 (3중 안전망)
폰마다 listener 활성도 다름 (브라우저/OS/배터리/메모리/네트워크) — 일관된 동작을 위해:
1. **realtime listener** — 즉시 반영 (이상적)
2. **이벤트 핸들러** — 탭 복귀/포커스/온라인 시 forceFetchRequestsCollection
   - `visibilitychange → visible`
   - `focus`
   - `online`
3. **5초 폴링** — 위 둘 다 실패해도 최대 5초 안에 따라잡음
   (탭이 visible할 때만 동작)

→ 어떤 기기든 변경 후 최대 5초 안에 동기화 보장

### 완료 → 대기 되돌리기 (취소 단어 분리)
사용자 명확한 요구로 단어 분리:
- **대기 탭 [❌ 취소]** — 요청 자체 취소, [취소] 탭으로 영구 이동
- **완료 탭 [↩ 되돌리기]** — 반출 처리 되돌림 (재고 복원 + 대기 상태 복귀)
  - statusHistory 배열에 처리 정보 (이전 처리자/완료일/반출일) 보존
  - history는 cancelled 플래그만 (통계에서 자동 제외)
  - audit: revert_completed_to_pending

### 통계에서 cancelled history 자동 제외
js/11-stats.js, 14-export.js, 15-backup.js, scripts/lib-monthly.js,
scripts/weekly-backup.js, apps-script/Code.gs 모두:
`history.filter(h => h.type === 'out' && !h.cancelled)`

### mcFullResetToSheet — 종합 초기화 함수 (단일 진실 원천)
시트 4월 5주차 스냅샷으로 모든 운영 데이터 되돌림 (테스트 정리용):
- inventory: 568개로 교체 (재고/단가 모두) — `{keepInventory:true}`로 보존 가능
- history: 1481건으로 교체
- requests: 비움 + requests/ 컬렉션 docs 모두 삭제 (Phase 2 listener 대비)
- 보존: teams, teamMembers
- mcUnlockDanger 필요. audit 'full_reset_to_sheet' 기록.

#### 안전 메커니즘 (필수, 빠지면 즉시 부활 버그)
1. Phase 2 listener / 폴링 중단 + `_resetInProgress=true` (echo 차단)
2. requests/ 컬렉션 모든 docs 삭제 (안 하면 listener가 옛 docs 다시 가져옴)
3. 메모리 reset → saveAll → 단일 문서 비움
4. 2.5초 대기 후 컬렉션 잔여 doc 재확인 (다른 기기가 그 사이 push했을 수도)
5. listener / 폴링 재개

#### `mcResetToSheetData` (옛 호환)
`mcFullResetToSheet({keepInventory:true})` 의 별칭. 과거에는 단일 문서만 비우고
컬렉션을 안 비워서 옛 docs가 listener로 즉시 부활하던 버그 있었음 (2026-05-06 수정).
지금은 안전 메커니즘 모두 공유.

### 다음 진행 우선순위 (사용자 결정)
1. **검증 (1주 정도)** — Phase 2 + 5초 폴링 + 양방향 sync 안정성
2. **Apps Script 코드 갱신** — GitHub 자동 sync 안 됨. 사용자가 직접 복붙 필요
   (취소 통계 제외 등 새 코드 적용 안 하면 토요일 백업이 옛 로직)
3. **Phase 4: Google 로그인** ⭐ — 50명 동시접속 운영 강력 권장 (1일 작업)
4. **Phase 3: inventory/history 컬렉션화** — 1MB 한도 영구 해소 (2~3일)
5. **덴트웹 통합** — 환자 데이터 받으면 진행
6. **Audit log 조회 UI** — 화면에서 변경 이력 보기 (반나절)

### 알려진 제약 / 미해결
- **Phase 2 검증 중** — 1주 정도 모니터링 후 단일문서 requests 필드 deprecated 가능
- **인증 없음** — device 단위만 추적 (Phase 4에서 해결 예정)
- **5/3 유현영 5건** — 복구 불가. 유현영 선생님 확인 후 재입력 필요
- **Apps Script GitHub 자동 sync 안 됨** — 변경 시 사용자가 코드 복붙 필요
- **mcFullResetToSheet으로 테스트 데이터 정리됨** (2026-05-05)

### 콘솔 함수 레퍼런스
```js
// 변경 이력 조회 (Firestore events/ 컬렉션)
mcViewRecentEvents()              // 최근 50건
mcViewEventsByType('request')     // 요청 관련만
mcViewEventsByType('system')      // 시스템 액션 (wipe, sync, full_reset)

// 기기 식별 (audit log에 표시될 라벨 — 한 번 설정)
setDeviceLabel('원장님 PC')
setDeviceLabel('9층 데스크 폰')

// Phase 2 진단
mcCheckPhase2Status()             // listener/hook 상태 확인
mcCheckRequestsCollection()       // 컬렉션 vs 단일문서 동기화 확인
mcBackfillRequestsCollection()    // 메모리 → 컬렉션 백필 (1회)

// 위험 함수 (5분 일시 해제 후 사용)
mcUnlockDanger("잘못 누르면 모두 다 사라짐을 이해합니다")
mcFullResetToSheet()                          // 모든 운영 데이터 시트 스냅샷으로
mcFullResetToSheet({keepInventory:true})      // history+requests만, inventory 보존
mcResetToSheetData()                          // 위와 동일 (옛 호환 alias)
mcForceSyncFromCloud()                        // 로컬을 클라우드 데이터로 완전 교체

// 백업
mcDownloadReportNow()             // 주차별보고 즉시 다운로드
mcDownloadRecoveryNow()           // 재난백업용 즉시 다운로드
mcDownloadMonthlyReportNow('2026-04')   // 월별보고
mcSendBackupNow()                 // 메일 강제 발송 (5분 쿨다운)
mcResetBackupCooldown()           // 쿨다운 초기화

// 진단
mcGetThisWeek()                   // 현재 ISO 주차
```

---

_마지막 갱신: 2026-05-07 (문서함 기능 제거 — 구글 드라이브로 직접 관리)_

---

## 12. 2026-05-07 작업: 문서함 기능 제거

사용자가 첨부 문서를 구글 드라이브에서 직접 관리하기로 결정. PWA 내 문서함 기능 완전 삭제.

### 제거된 것
- `js/12-documents.js` (271줄, 통째 삭제)
- `js/6-utils-file.js` (76줄, 통째 삭제 — `readFileAsBase64`만 [js/7-release.js](js/7-release.js)로 인라인)
- index.html: 🔒 문서함 탭 버튼 + script 태그
- 99-main.js: documents 탭 라우팅
- 5-storage.js: `documents` 변수 / localStorage `mc_documents` / Firestore payload `documents` 필드 / mcForceSyncFromCloud의 documents 처리
- 14-export.js: 도움말의 📁 문서함 항목
- 15-backup.js: 재난백업의 `문서_메타` 시트 / 메타 시트의 `문서 수` / docsLite / 월별보고의 첨부 문서 섹션
- scripts/lib-monthly.js + weekly-backup.js: 같은 항목들 + 메일 본문의 문서 줄
- apps-script/Code.gs: `syncDocuments` 함수 + `monthLabelFromDate_` + 메타 시트 문서 카운트 + 월별보고 + 재난백업 시트
- apps-script/SETUP.md: 문서 폴더 / sync 로그 안내

### 남아있는 것 (의도적)
- **Firestore의 `documents` 필드** — 그대로 보존. `setDoc(merge:true)`라 코드에서 안 보내면 손대지 않음. 사고 시 옛 첨부물 복구용 데이터 소스.
- **사용자 Drive의 `재고관리 백업/문서/` 폴더** — Apps Script가 이미 sync해온 것. 사용자가 직접 관리.
- **localStorage의 `mc_documents` 키** — 무해. 다음 데이터 정리 때 제거 가능.

### Apps Script 갱신 필요 (사용자 액션)
GitHub auto sync 안 됨. 사용자가 [apps-script/Code.gs](apps-script/Code.gs) raw 내용을 script.google.com에 복붙해야 적용됨. 안 하면 매일 12시 옛 코드가 실행되어 documents 시트를 빈 채로 만들지만 에러는 안 나고 무해.

---

## 13. 2026-05-07 작업: Phase 3 — inventory + history 컬렉션화

외부 의견에 응해 단일 문서 한도(1MB) + race condition 본질 해결. Phase 2(requests)와 동일한 비파괴 패턴.

### 추가된 파일
- [js/18-history-collection.js](js/18-history-collection.js) — `history/{id}` per-doc 컬렉션
- [js/19-inventory-collection.js](js/19-inventory-collection.js) — `inventory/{id}` per-doc 컬렉션

### 수정된 파일
- index.html: `writeBatch` 임포트 + 두 스크립트 로드 + 탭 5등분(`grid-cols-5` + 각 버튼 `w-full`)
- js/5-storage.js: `applyCloudData`가 listener 활성 시 단일 문서 history/inventory 무시 / `saveToFirebase`가 `_disableSingleDoc*Sync` 플래그 존중
- js/15-backup.js: `mcFullResetToSheet`가 history/inventory 컬렉션도 정리 + 새 데이터 백필 + 잔여 확인

### 핵심 설계 (Phase 2와 동일 패턴)
1. **컬렉션 listener를 source of truth로** — onSnapshot으로 메모리 in-place 교체
2. **단일 문서 병렬 쓰기 (안전망)** — 토글 OFF 동안 계속 (옛 클라이언트 호환 + 사고 시 백업)
3. **변경분만 추적 (hash diff)** — `Map<id, JSON.stringify>` 캐시. 1481건 매번 다시 안 씀
4. **writeBatch 백필** — 450 ops/batch (Firestore 500 한도 여유). 1481건 = 4 commits, 568개 = 2 commits
5. **listener 메모리 보호** — 빈 컬렉션 + 메모리 데이터 있으면 sync 무시 (백필 전 wipe 방지)
6. **타이핑 보호** — Phase 2와 동일. focusout까지 sync 보류

### 1MB 영구 해소 토글
**전제:** 컬렉션 백필 + 1주 검증 후 활성화. 컬렉션이 정상 작동 중인지 `mcCheckPhase3Status()` 로 확인.

```js
mcDisableSingleDocHistorySync()    // saveToFirebase payload에서 history 빠짐
mcDisableSingleDocInventorySync()  // saveToFirebase payload에서 inventory 빠짐
```

토글 ON 후: 단일 문서의 기존 필드는 그대로 (덮어쓰지 않음). 새 변경은 컬렉션에만. localStorage에 토글 상태 영구 저장.

되돌리기: `mcEnableSingleDocHistorySync()` / `mcEnableSingleDocInventorySync()`

### 잔존 한계
- **같은 inventory 품목 동시변경** — last-write-wins. 다른 품목 충돌은 0이지만 같은 품목은 여전히 race.
- **해결책 (Phase 3.1, 추후):** `FieldValue.increment(qtyDelta)` 으로 qty 가산 처리. 코드 전반의 직접 대입(`it.qty -= n`)을 increment로 바꿔야 함. 반나절 작업. 빈도 낮아 우선순위 낮음.

### 마이그레이션 절차 (사용자 1회 수동 실행)
```js
// 1. 백필 (현재 메모리 → 컬렉션) — 멱등, 데이터 손실 없음
mcBackfillHistoryCollection()    // 1481건, ~4 batch commit
mcBackfillInventoryCollection()  // 568개, ~2 batch commit

// 2. 일치 확인
mcCheckHistoryCollection()
mcCheckInventoryCollection()
mcCheckPhase3Status()            // 종합 진단

// 3. 1주 운영 모니터링 후 1MB 해소 토글
mcDisableSingleDocHistorySync()
mcDisableSingleDocInventorySync()
```

### Phase 3 콘솔 함수 추가
```js
// 백필 / 확인
mcBackfillHistoryCollection()
mcBackfillInventoryCollection()
mcCheckHistoryCollection()
mcCheckInventoryCollection()
mcCheckPhase3Status()                 // 종합 (listener / hook / 토글 / 카운트)

// 1MB 해소 토글
mcDisableSingleDocHistorySync()
mcEnableSingleDocHistorySync()
mcDisableSingleDocInventorySync()
mcEnableSingleDocInventorySync()
```

---

_마지막 갱신: 2026-05-07 (Phase 3 — inventory + history 컬렉션화 완료, 5등분 탭 정리)_

---

## 14. 2026-05-08 작업: 대규모 안정화 + UX 정리 (한 세션)

15+ commits에 걸친 대규모 세션. Phase 3 후속 안전 강화 + 운영 기능 추가 + UI 통합.

### 14.1 Phase 3 후속 안전 (race condition 영구 차단)

**버그 1: window.X 침묵 실패** (큰 hidden 버그였음)
- `let history = []` 등은 script-scoped — `window.history`는 브라우저 내장 History API
- 모든 `window.history` / `window.inventory` / `window.requests` 참조가 침묵 실패
- `Array.isArray(window.history)` → false → 가드/forEach/listener 모두 무력화
- Phase 2 컬렉션화도 사실 cutover 미실효 상태였음 (단일 doc listener fallback 덕분에 사용자 체감은 정상)
- 수정: 모든 `window.X` → bare `X` (script-scoped lexical binding)

**버그 2: snapshot 덮어쓰기**
- 단일 문서 listener의 `_applySyncData`가 snapshot.requestsCount 등을 단일 문서 카운트로 덮음
- 컬렉션 listener가 갱신해놓은 값 무효화 → 다음 saveToFirebase에서 false alarm "대량 감소 감지"
- 수정: 컬렉션 listener 활성인 필드는 snapshot 보존

**버그 3: 쓰기 경로의 listener echo race**
- cancel 등이 status='cancelled' 메모리 적용 → saveAll → Phase 2 hook 300ms debounce
- 그 사이 listener echo가 옛 collection 상태로 메모리 덮음 → cancel 사라짐
- 수정: 6개 쓰기 경로에 **즉시 upsert** 추가 (debounce 우회)
  - cancelRequestGroup (반출관리 취소/되돌리기)
  - cancelMyRequest (요청 본인 취소)
  - editRequest (요청 수정)
  - executeCompleteRequest (반출 완료): inventory + history + request 3종
  - confirmInbound (입고): inventory + history
  - revertInboundEntry (입고 되돌리기): inventory + history

### 14.2 1MB 한도 영구 해소 토글 ON
- `mcDisableSingleDocHistorySync()` + `mcDisableSingleDocInventorySync()` 활성화
- 이제 단일 문서 `appData/main`에 history/inventory 안 쓰여 몇 년 누적 안전
- 단일 문서 기존 필드는 백업으로 유지 (덮어쓰지 않음)

### 14.3 운영 기능 추가
- **입고 내역 주차별 collapsible** (`9-inbound.js`)
  - 전체 섹션 collapsible (기본 접힘) + 주차별 collapsible 이중 구조
  - 단위(unit) 표시 제거 — 수량만 (+12 같은 식)
- **3종 되돌리기 버튼** (반출 되돌리기와 동일 1단계 패턴)
  - 입고 되돌리기 (`revertInboundEntry`) — 재고 차감 + history.cancelled=true
  - 요청 수정 되돌리기 (`revertLastEditMyRequest`) — editHistory 마지막 entry pop
  - 반출 완료 되돌리기 (기존)
- **취소/되돌리기 사유 입력** (`askConfirmWithReason`)
  - 99-main.js에 새 모달 함수 (textarea + auto-focus, 비워두기 OK)
  - 4개 경로 적용: cancelRequestGroup / cancelMyRequest / removeMyRequestItem / revertInboundEntry
  - audit log + 화면 표시 (취소 그룹 카드 / 입고 entry 아래)
- **요청 수정 모달 항목별 ❌ 취소** — 수량 0 막혀있어 항목 자체 빼는 방법 없던 문제 해결
  - `removeMyRequestItem(itemId, groupId)` — soft cancel + 즉시 upsert + 모달 재오픈

### 14.4 UI 통합 (설정 탭 제거)
- **하단 설정 탭 행 제거** — 5탭 단일 행 (요청·통계·반출관리·입고·재고)
- **팀/담당자 관리는 요청 탭** ⚙️ 관리 버튼 → 모달
  - openTeamMemberModal / closeTeamMemberModal / `_inTeamMemberModal` 플래그
  - sub-dialog 닫힘 시 closeModal이 자동 모달 복귀
  - `_afterTeamMemberChange` 헬퍼 — 모달 모드는 즉시 saveAll + 모달 재렌더, settings 탭은 legacy batched
- **품목 관리는 재고 탭으로**
  - 재고 탭 상단에 + 품목 추가 / 📥 Excel 다운로드 버튼
  - **빠른 수정 + 전체 수정 통합** — 행 클릭 한 번에 업체/품명/단위/단가/재고/기준 + 🙈 숨김 + 🗑️ 삭제 다 됨
  - **Excel 업로드 제거** (실수 위험성)
  - `_applyItemChangeAndRender` 헬퍼 — 재고 탭은 즉시 저장 + renderInventory, settings는 legacy

### 14.5 토요일~금요일 주차 기준 (4-utils.js getWeekKey)
- 반출일이 금요일이라 토요일이 새 주차 시작
- 5/1(금) → 4월 마지막주, 5/2(토)~5/8(금) → 5월 1주차, 5/9(토)~5/15(금) → 5월 2주차
- 그 주의 토요일이 속한 달의 N번째 토요일이 W1, W2, ...
- stats.js에서 PREBUILT의 옛 ISO format weekKey 무시하고 항상 date에서 재계산

### 14.6 데이터 정리
- **9층 공통 5월 orphan history 2건** — 5/3 wipe 사고 잔재 (request 사라지고 history만 남음)
  - h.cancelled=true 마킹으로 통계 제외 + 데이터 보존
- **inventory 중복 18개 정리** — Excel 업로드 시 update 안 하고 새로 추가됐던 사고
  - 11그룹 (Denture bur 6종, Apron 2종, F02/F10 A3.5)
  - 사용자 reference 이미지 기반 정확한 항목 keep + reference 값으로 stock/min override
  - 코니컬튜브는 raw 자체 중복이라 사용자 직접 처리 (스크립트 건너뜀)

### 14.7 cancelled IN history 자동 제외
- js/15-backup.js + scripts/weekly-backup.js의 `thisInHist` 필터에 `!h.cancelled` 추가
- Apps Script (apps-script/Code.gs)는 사용자 수동 복붙 필요 (GitHub auto sync 안 됨)

### 14.8 Phase 3.1 atomic stock increment (인프라만 추가, wiring 미완료)
- index.html에 firebase `increment` 임포트 + `window.firebaseIncrement` 노출
- `adjustInventoryStock(itemId, delta)` 함수 (`19-inventory-collection.js`)
  - 메모리 낙관적 업데이트 + hash 캐시 즉시 갱신 (hook 중복 push 차단)
  - Firestore `setDoc(merge:true, {stock: increment(delta)})` 원자 가산
- 다음 세션에서 wiring 필요:
  - 8-manage.js executeCompleteRequest: `item.stock -= releaseQty` → `adjustInventoryStock(item.id, -releaseQty)`
  - 8-manage.js cancelRequestGroup (revert): `item.stock += it.qty` → `adjustInventoryStock(item.id, it.qty)`
  - 9-inbound.js confirmInbound: `item.stock += qty` → `adjustInventoryStock(item.id, qty)`
  - Phase 3 inventory hook: stock 필드 제외 (atomic 결과를 절대값으로 덮지 않게)

### 14.9 사용자 액션 (다음 세션에서 안내)
- **Apps Script 코드 복붙** — [apps-script/Code.gs](apps-script/Code.gs) raw → script.google.com (cancelled IN 제외 등 새 코드 적용)
- **5/9 토요일 자동백업 결과 확인** — Gmail + Drive
- **Phase 4 Google 로그인** ⭐ (1일) — 50명 운영 강력 권장
- **Phase 3.1 wiring 마무리** (반나절) — 같은 품목 동시변경 완벽 처리
- **덴트웹 통합** — 환자 데이터 받으면

### 14.10 다음 세션이 알아야 할 것
- 모든 쓰기 경로가 즉시 upsert + race-proof — 새 기능 추가 시 같은 패턴 적용
- 1MB 토글 ON 상태 — 단일 문서 history/inventory에 안 써짐 (`_disableSingleDoc*Sync` localStorage)
- 설정 탭은 코드만 남고 UI 진입점 없음 — switchTab('settings') 직접 호출 시에만
- script-scoped 변수(`history`, `inventory`, `requests`)는 `window.X` 절대 X — 항상 bare 식별자

---

_마지막 갱신: 2026-05-08 (대규모 안정화 + UX 정리 — Phase 3 race 차단 + 사유 입력 + 설정 통합 + 토요일 주차)_

---

## 15. 2026-05-08 후속 작업 (인벤토리 정비 + UX 폴리싱)

같은 날 추가 5+ commits — 인벤토리 데이터 정리 + UI 디테일.

### 15.1 인벤토리 중복 정리 + reference 기반 일괄 import

**중복 정리 (사용자 reference 이미지 기반)**
- 11개 그룹의 18개 중복 (Excel 업로드 시 update 안 하고 새로 추가됐던 것)
- 사용자가 제공한 reference price+stock+min과 일치하는 항목 keep, 나머지 삭제
- 코니컬튜브는 raw 데이터 자체 중복이라 사용자 직접 처리 (스크립트 건너뜀)

**기준수량 file 일괄 import** (콘솔 스크립트 1회 실행)
- 5중 안전 메커니즘으로 대기 78건 보존
  1. BEFORE 스냅샷 + ID set 저장
  2. pending itemId는 절대 삭제 X (CSV에 없어도 hidden=true 강제)
  3. 삭제 직전 violation check — 대기 itemId가 삭제 대상에 포함되면 즉시 중단
  4. request 배열은 안 건드림
  5. AFTER 검증 — 사라진 ID 콘솔에 🛑 표시
- 결과: inventory 562개 (visible 494 / hidden 68), 대기 78개 100% 보존
- CUSTOM_ itemId (직접요청)는 isCustom=true이라 inventory 매칭 검증 제외

### 15.2 UX 폴리싱

**KPI 4-button 그리드 (재고 탭)**
- 전체 / 부족 / 품절 / 숨김 — mutually exclusive 필터
- grid-cols-2 sm:grid-cols-4 (모바일 2x2, 데스크톱 4행)
- 검색창 옆 🙈 토글 버튼 제거 — KPI에 통합
- 전체 카운트는 inventory.length (hidden 포함 — 560)
- 전체 모드에서 visible+hidden 같이 표시

**상태별 배경색**
- 🟢 정상: bg-emerald-50 (연한 초록)
- 🟡 부족: bg-amber-50 (연한 노랑)
- 🔴 품절: bg-red-50 (연한 빨강)
- 🙈 숨김: bg-slate-100 (연한 회색) + opacity-60

**부족 기준 변경**: `stock <= minStock` → `stock < minStock`
- minStock=3, stock=3 → 정상 (이전: 부족)
- 6개 파일 + Apps Script 일괄 적용

**품목 리스트 정렬**
- 1순위: 숨김 항목 하단 (재고 탭만)
- 2순위: vendor 한글 가나다순
- 3순위: name 자연 정렬 (`numeric: true` — `#08` < `#10` < `#80`)
- 적용: 재고 / 요청 / 입고 3개 탭 모두

### 15.3 알아야 할 것

- inventory 562개 중 vendor 중복 같은 이름 = Protaper GOLD만 (의도적 — 새한치재 메인 + 동우아이엔씨 백업)
- 숨김 항목 처리: 재고 탭 = 하단 정렬 + 회색 배경 / 요청·입고 탭 = 그대로 보임 (원 디자인 의도)
- 부족 기준 < 비교 연산자 (= 포함 X) — 통계/주간보고/Apps Script까지 일관
- 인벤토리 일괄 import 스크립트 패턴 (대기 보존 5중 안전망) — 향후 reference 변경 시 재사용 가능

---

_마지막 갱신: 2026-05-08 (인벤토리 정비 + UX 폴리싱 — 중복 정리, reference import, KPI 4-button, 배경색, 부족 기준 변경, 자연 정렬)_

---

## 16. 2026-05-09 작업 (백업 시간 + 통계/입고 UX + 가격 버그 + 분류 정리)

### 16.1 자동 백업 일정 변경
- GitHub Actions + Apps Script 둘 다 토요일 18:00 KST로 통일
- 18시 선택 이유: Firestore Spark 일일 quota는 자정 PT (≈17시 KST) 리셋 → 그 이후로 잡아야 quota exceeded 안 남
- Apps Script setupDailyTrigger 1회 재실행 필수 (사용자 액션)

### 16.2 가격 데이터 버그 (큰 발견)
**증상**: 어제/오늘 처리한 78건 출고가 통계에 모두 0원.
**원인**: executeCompleteRequest / confirmInbound가 history record 만들 때 `price` 필드 누락. stats는 `h.qty * (h.price || 0)`로 계산 → 0원.
**수정**:
- 8-manage.js / 9-inbound.js: histRec에 `price = item.price || 0` + `weekKey = getWeekKey(date)` 추가
- 콘솔 마이그레이션 스크립트: 기존 entries 118건에 inventory의 현재 price 일괄 보정

### 16.3 history.date 사용자 입력일자 우선
**증상**: 5/8 반출일자로 처리했는데 통계에 5/9(처리 시각)로 잡힘.
**원인**: 반출 완료 시 `completeDate = new Date()` 사용 → 사용자 입력 releasedDate 무시.
**수정**: `completeDate = releasedDate || new Date()` — 입력값 우선. 처리 시각은 `processedAt` 별도 보존.
- 입고는 원래부터 사용자 입력 일자 사용 → 두 채널 일관성 확보

### 16.4 입고 내역 금액 표시 + 단가 + 년도/월 필터
- 각 entry: `+20 × 25,000원 = 500,000원` 3단 표시
- 주차 헤더: `4건 · 27개 · 500,000원`
- 전체 헤더: `총 568건 · 75,056,370원 (2026 5월)`
- 년도/월 dropdown 필터 — default: 현재 년도+월
- 가격 lookup: `h.price` 있으면 사용, 없으면 inventory에서

### 16.5 통계 — 주차별 → 항목별 + 검색
- 주차별 탭 제거 (renderStatsByWeekly는 코드만 남김)
- 새 **항목별 탭**: 각 품목별 vendor + 품명 + 총금액 + 개당단가 + 팀별 사용 분포
- 검색창 (품목/업체) — 부분 갱신으로 한글 IME 안전 (`renderStatsItemList()`)
- 개당 단가는 가중평균 (cost / qty)

### 16.6 통계 '전체' → '이번 년도'
- `statsPeriod === 'all'` 의미 변경: 모든 history → 올해 1/1 ~ 오늘
- 라벨 '전체' → '이번 년도'
- openTeamStatsDetail (팀 상세 모달)도 같이 변경

### 16.7 분류 lookup 강화 + AI 분석 분류 섹션 제거
- catOfHistory_ 우선순위: `h.category` → inventory 정확매칭 → inventory 대소문자/공백 무시 매칭 → '(분류 없음)'
- 'k File' vs 'K File' 같은 표기 차이 자동 흡수
- 사용자 요청으로 **AI 분석 탭의 '분류별 변동' 섹션 UI 제거** (catThis/catPast 집계 + 카드 UI 모두 삭제)
- 과거 분류 없음 history는 콘솔 스크립트로 `h.category='치과재료'` 일괄 마킹 (사용자 1회 실행)

### 16.8 단일 문서 backup 필드 영구 삭제
**증상**: 1MB 토글 ON 했는데 클라우드 저장 실패 (1.05MB exceeds limit).
**원인**: 토글은 앞으로 안 쓰기만 했고, 단일 문서의 옛 inventory/history backup 필드(stale)가 그대로 남아있어 doc 크기 ~1MB.
**수정**: 콘솔 스크립트로 `updateDoc(deleteField())` — inventory/history/documents 3개 필드 영구 삭제. 단일 doc 크기 1MB → ~50KB. 클라우드 저장 정상화.

### 16.9 다음 세션이 알아야 할 것
- 모든 history record는 이제 price + weekKey + (반출의 경우 사용자 입력 date) 자동 포함 — 새 처리분은 항상 정상
- 분류별 변동 섹션은 완전 제거 (코드 + UI). AI 분석에는 팀별만 남음
- 통계 '이번 년도' = YTD (올해 한정)
- 자동 백업: 매주 토요일 18시 KST (GitHub Actions + Apps Script 둘 다)
- 단일 문서엔 history/inventory/documents 필드 없음 (다 삭제됨). 컬렉션이 유일한 source
- 입고 내역 default 필터: 현재 년도+월 (전체 보려면 dropdown에서 '전체' 선택)

---

_마지막 갱신: 2026-05-09 (백업 시간 + 가격 버그 + 통계 항목별 + 분류 섹션 제거 + 단일문서 backup 정리)_

---

## 17. 2026-05-12 작업: 입고 주문/입고완료 기능 추가

기존 "요청 → 반출" 흐름과 동일한 패턴으로 입고 탭에 "주문 → 입고 완료" 추가.

### 17.1 데이터 모델: `orders/{id}` (새 컬렉션, 기존 4개 안 건드림)
```js
{
  id: 'O' + Date.now(),
  date: ISO,
  status: 'pending' | 'received' | 'cancelled',
  orderedBy: deviceLabel,
  memo: '',
  items: [{
    itemId, vendor, name, unit, qty, price, memo,
    // received 시 추가:
    actualQty, actualPrice, historyId, skipped
  }],
  receivedDate: ISO,
  receivedBy: deviceLabel,
  cancelReason, cancelledDate, cancelledBy,
  editHistory: [{ at, by, changes: [...] }],
  statusHistory: [{ revertedAt, revertedBy, prevReceivedDate, prevReceivedBy, reason }]
}
```

### 17.2 새 파일 / 변경 파일
- **NEW** [js/20-orders-collection.js](js/20-orders-collection.js) — Phase 2 패턴 그대로 (per-doc collection, listener as source of truth, hash diff은 안 씀 — orders는 모두 즉시 upsert)
- [js/5-storage.js](js/5-storage.js) — `let orders = [], let orderCart = []` 추가 + localStorage (`mc_orders`) load/save
- [index.html](index.html) — `<script src="js/20-orders-collection.js"></script>` 추가
- [js/9-inbound.js](js/9-inbound.js) — 본격 재구성:
  - `_inboundItemRowHtml` 버튼: 기존 "입고" → "+ 담기" (장바구니 추가), 이미 담긴 경우 "✓ 담김 (N)" 표시
  - 새 섹션 순서: 📋 주문 내역 (대기/완료/취소 탭) → 🛒 장바구니 → 📋 입고 내역 → 품목 리스트
  - `_renderOrderCard(o)` — 카드 1개 (상태별 색상 + 액션 버튼)
  - `openOrderItemDialog(itemId)` / `saveOrderCartItem` / `removeOrderCartItem` / `removeOrderCartItemById` / `clearOrderCart` — 장바구니 관리
  - `confirmOrder()` → `submitOrder()` — 주문 등록 (메모 + 일자 입력 모달)
  - `openReceiveOrderModal(orderId)` → `confirmReceiveOrder()` — 입고 완료 (per-item 실제 수량/단가 + 일자, actualQty=0이면 skip)
  - `cancelOrder(orderId)` — soft cancel (askConfirmWithReason)
  - `editOrder(orderId)` → `saveOrderEdit()` — 수량 0이면 항목 제거, editHistory 보존
  - `revertReceivedOrder(orderId)` — received → pending, 재고 차감, history.cancelled=true

### 17.3 race-proof 패턴 (Phase 2와 동일)
모든 쓰기 경로에서:
1. 메모리 변경
2. **즉시** `upsertOrderDoc(o)` (listener echo 차단)
3. inventory 변경 시 atomic `adjustInventoryStock(itemId, ±delta)` 우선
4. history record 만들 때 `upsertHistoryDoc` + hashCache.set (Phase 3 hook 중복 push 차단)
5. `logEvent('order', action, payload)` audit
6. `saveAll()` + `renderInbound()`

### 17.4 입고 완료 처리 동작
- 입고 모달에서 항목별 실제 수량/단가 편집 가능 (기본값 = 주문 수량/단가)
- 실제 수량 0 → 해당 항목 skip (재고/history 변동 X, items에 `skipped=true` 보존)
- 실제 단가가 inventory.price와 다르면 inventory.price도 갱신 (정확한 단가 추적)
- 각 입고 항목마다 history record 'in' 생성 (orderId 링크 포함)
- 부분 입고는 지원되지만 "10 주문 → 7 입고 → 나머지 3은 자동 분할" 같은 자동화는 없음. 사용자가 수동으로 두 번째 주문 추가하거나 메모로 처리.

### 17.5 안전망 (사용자 요구 — "기존 데이터 사라지면 절대 안 됨")
- 기존 4개 컬렉션 (inventory/history/requests/events) 코드 한 줄도 안 건드림
- 단일 문서 1MB 토글 상태 유지 (orders는 처음부터 컬렉션, 단일 문서엔 안 씀)
- `orderCart`는 localStorage만 (Firestore 안 씀, 디바이스별 임시 장바구니)
- 사용자 시작 전 `mcDownloadRecoveryNow()` Excel 백업 받음 (BEFORE: inv=563, hist=1568, req=122/pending=6, teams=15, members=15)
- AFTER 검증은 사용자 실사용 후 콘솔에서 직접 카운트 확인

### 17.6 audit 이벤트 타입
- `order/create` — 주문 등록
- `order/receive` — 입고 완료
- `order/cancel` — 주문 취소
- `order/edit` — 주문 수정
- `order/revert` — 입고 완료 되돌리기

### 17.7 콘솔 함수
```js
mcCheckOrdersCollection()    // 컬렉션 doc 수 vs 메모리 orders.length
forceFetchOrdersCollection() // 강제 fetch (visibility/focus에도 자동 호출됨)
```

### 17.8 알려진 제약 / 미해결
- **자동 발주 권고** 없음 — 재고 부족이면 사용자가 직접 ⓘ 보고 주문 등록
- **공급사 정보** — 별도 vendor master 없음 (inventory.vendor 그대로 사용). 새 vendor는 inventory 추가 시 따라옴
- **예상 도착일** — 별도 필드 X, 메모로만
- **부분 입고 분할** — 자동화 안 함 (위 17.4)
- **Excel 보고서** — 주문 정보는 backup/주차별보고에 안 들어감 (history.in으로 입고분만 잡힘). 향후 보고서 추가 필요 시 `orders` 별도 시트 추가 가능

### 17.9 다음 세션 우선순위
1. 1주 운영 + 사용자 피드백 후 UX 조정
2. **Phase 4 Google 로그인** ⭐ (1일) — 50명 동시 운영 + audit log에 진짜 사용자명
3. **Phase 3.1 atomic stock wiring** (반나절) — 입고/반출 stock 변경을 increment로 (현 코드는 `adjustInventoryStock` 있으면 사용)
4. **덴트웹 통합** — 환자 데이터 받으면

### 17.10 같은 날 후속 UX 작업 (2026-05-12)
주문/입고 기능 첫날 사용자 피드백 → 즉시 반영:

- **주문 모달 업체 표시 강화** — `openOrderItemDialog`에서 vendor를 🏢 아이콘 + 본문 크기로 강조. 주문 등록 확인 모달은 업체별 그룹핑된 항목 리스트.
- **입고 탭 분류 필터** — 요청/재고 탭과 동일하게 vendor 필터 아래 `구강위생용품/치과재료` 분류 필터 추가 (`inboundSelectedCategory`).
- **품목 수정 모달 vendor dropdown** — 기존 text input → dropdown 선택 + 새 업체 직접 입력. 오타로 중복 vendor 생기는 사고 방지. `edit-item-vendor-select` + `edit-item-vendor-new` (품목 추가와 동일 패턴).
- **주문 담당자 선택** — 주문 등록 확인 모달에 반출 담당자와 동일한 `[이충현] [주경심]` 두 버튼 + 직접 입력. `_pendingOrderer` 플래그, 선택 안 하면 등록 버튼 비활성. order.orderedBy로 저장 (deviceLabel 대체). 카드에 👤 담당자 표시.
- **부분 입고 처리** (반출 부분처리와 동일 패턴):
  - 입고 모달에서 항목별 실제 수량 줄여 입력
  - 받은 분량 → 새 완료 주문 doc로 분리 (`status='received'`, `parentOrderId` 링크)
  - 잔여 = (주문 - 실제) → 원래 주문에 그대로 남아 [대기] 유지
  - 카드에 `🟢 부분 입고됨: N회 · 총 X개 (잔여 표시 중)` 라벨
  - `partialReceiveHistory` 배열로 분할 이력 보존
- **모바일 ghost tap-through 가드** — 99-main.js에 `closeModalFromBackdrop()` + `markModalOpened()` 추가. 모달 연 직후 300ms는 backdrop 클릭 무시. 모든 inbound 모달의 backdrop이 이 새 함수 사용. 명시적 [취소] 버튼은 즉시 닫힘.
  - 원인: 버튼 탭 → 모달 열림 → touchend 시각에 같은 좌표가 backdrop이라 synthetic click이 즉시 닫음 → "한번 누르면 안 가" 증상
- **주문 내역 주차별 collapsible** — 입고 내역과 동일 패턴. 탭별로 (대기=주문일, 완료=입고일, 취소=취소일) 기준 주차 그룹핑. 탭별 독립 펼침 상태 (`_orderExpandedWeeks` key=`tab:weekKey`). 년도/월 필터는 의도적으로 추가 안 함 (현재 6건, 누적 후 6개월쯤 뒤 필요 시 입고 내역 패턴 복붙).
- **탭 이름** — `입고` → `주문/입고` (5번째 탭).

---

## 18. 2026-05-14 작업: 배지 시스템 + 직접요청 처리 + 카테고리 dropdown

주문/입고 기능 첫 일주일 사용 후 누락된 부분 보완.

### 18.1 주문 상태 인지 배지 (3단계)
모든 탭(요청·반출관리·주문/입고·재고)의 품목 행에 표시 — 운영자가 한눈에 상황 파악.

| 배지 | 조건 | 색상 |
|---|---|---|
| **🛒 주문중 N** | pending order에 itemId 존재 (재고 상태 무관) | 파랑 |
| **📝 주문필요** | 요청 들어옴 + 부족·품절 + 주문 없음 | 오렌지 |
| (배지 없음) | 그 외 | — |

- `getPendingOrderMap()` + `getPendingRequestItemIdSet()` (4-utils.js)
- 각 탭의 render 함수에서 호출 → window 변수에 캐시
- 처음엔 "부족·품절일 때만" 으로 제한했다가 사용자 피드백으로 항상 표시로 변경 (정상 재고여도 발주 정보는 중요)

### 18.2 📝 주문 필요 섹션 (주문/입고 탭 상단)
별도 highlight 박스로 "요청 들어왔는데 부족·품절 + 주문 안 됨" 품목 모음.

- 직접요청도 포함 (재고 미등록 — 무조건 주문 필요)
- 정렬: 직접요청(미등록) > 품절 > 부족, 같은 등급은 요청수량 큰 순
- 일반 inventory 항목 → `+ 주문 담기` 버튼
- 직접요청 → `📦 품목 추가` 버튼 → 검색 picker

### 18.3 직접요청 → inventory 등록 흐름 (재설계)
이전: 항상 새 inventory 생성 → 같은 항목 또 추가하면 중복

신규 picker 모달 (`_renderProcessCustomModal`):
- 검색창 (vendor 자동 prefill)
- 매칭 결과 클릭 → `linkCustomReqToInventoryItem` 으로 기존 항목 연결
- 또는 `+ 새 품목으로 추가` → 기존 add 모달 (vendor/name/unit prefill, 저장 시 자동 link)
- 연결 시: `r.itemId = item.id`, `r.isCustom = false`, `r.vendor/name/unit` 동기화

⚠️ 함수 이름 충돌 버그 (`linkCustomToInventory`) 있어서 `linkCustomReqToInventoryItem`으로 rename.
data-attr + addEventListener 패턴으로 변경 (inline onclick의 이름 충돌/캐시 영향 제거).

### 18.4 품목 추가/수정 모달 — 분류 dropdown
업체와 동일 패턴: 기존 분류 dropdown + 새 분류 직접 입력.
- `new-item-category-select` + `new-item-category-new`
- `edit-item-category-select` + `edit-item-category-new`
- 새 분류로 저장하면 다음 품목 추가 시 dropdown 옵션으로 등장

### 18.5 입고 내역 수정 + 음수 재고 허용
- 입고 entry 행에 `📝 수정` 버튼 — vendor/품명/수량/단가/일자 모두 수정
- 수량 변경 시 재고 자동 조정 (atomic delta)
- 되돌리기: `Math.max(0, ...)` 제거 → 음수 허용 (109 - 130 = -21 가능)
  - 이미 일부 출고된 후 되돌림 시 음수가 정확한 회계 상태
  - 모달에 ⚠️ 경고 표시

### 18.6 품목 수정에 📝 메모 필드 (주문 링크 저장)
- 거래처 연락처, 쿠팡 링크 등 자유 텍스트
- 메모에 URL 있으면 textarea 위에 파란색 박스에 클릭 가능 링크로 렌더 (`linkifyText`)
- 품목 추가 모달에도 동일 추가

---

## 19. 2026-05-15 작업: 통계 항목별 + 주문 카드 묶음 + UI 폴리싱

### 19.1 통계 항목별 — 출고/입고/주문 통합 뷰
검색한 품목의 전체 흐름 한눈에 (수량/금액/순변동).

- 각 카드: 🔻 출고 박스 + 🔺 입고 박스 + 🛒 주문중 + 📊 순변동
- 입고만 있는 품목도 표시 (cost=0이라 정렬상 하단)
- `[▼ 날짜별 상세 보기]` 버튼 → 펼치면 각 출고/입고의 날짜·팀·수량 모두 표시
- 상태 보존: `window._statsItemExpanded[vendor::name]`

### 19.2 주문 카드 묶음 표시
같은 날짜+업체+담당자+상태 자동 통합 → 한 카드.

- `_mergeOrdersForDisplay()` — 그룹핑 (key = date+vendor+by+status)
- `_renderMergedOrderCard()` — 모든 underlying order items 평탄 표시 + `🔗 N개 묶음` 배지
- 액션 버튼:
  - ✅ 입고 완료 → `openReceiveOrderModalMerged` + `confirmReceiveOrderMerged` (통합 모달, 각 underlying order에 분배)
  - ✏️ 주문수정 → `editOrderMerged` + `saveOrderEditMerged` (각 항목 수량/단가/일자 동시)
  - ❌ 취소 → `cancelOrderMerged` (일괄 취소)
- 묶음 cache: `window._mergedOrderCache[firstId] = [id1, id2, ...]`

### 19.3 대기 주문 — 일자 버튼 통합
이전: `[✅ 입고완료] [✏️ 주문수정] [📅 일자] [❌ 취소]` (4개)
변경: 주문수정 모달에 📅 주문 일자 input 추가 → `[✅] [✏️] [❌]` (3개)
완료 주문은 `[📅 일자 수정]` 버튼 유지 (주문수정 불가).

### 19.4 입고 완료 모달 — 체크박스 + −/+ 수량 조절
반출관리와 동일 UX로 일관성 확보.
- 전체선택 + 항목별 체크박스 (해제 시 회색 + qty=0)
- −/+ 버튼 + input
- 단가 별도 줄
- 체크 해제 → 잔여로 [주문대기] 유지

### 19.5 기타 UI 폴리싱
- 비밀번호 모달 라벨: `입고` → `주문/입고`
- 묶음 카드 버튼: `(N개)` 라벨 제거 (헷갈림 → `🔗 N개 묶음` 배지만)
- 단일 카드 라벨: `수정` → `주문수정`

---

## 20. 2026-05-28 작업: 성능 + 장바구니 기기간 동기화

오랜만에 사용자 확인 — 두 가지 핵심 이슈 발견.

### 20.1 ⭐ 주문 장바구니 기기간 동기화 (최우선)
이전:
- `orderCart`가 memory 만, localStorage 저장 없음
- 다른 기기에서 별개 cart
- 하루 지나면 cart 메모리에서 사라짐 (실제 사용자 잃어버림 사고 발생)

수정 1차 (`8a31fd2`): localStorage `mc_order_cart`에 저장
수정 2차 (`41a2739`): **Firebase `appData/main.orderCart` 필드로 공유**

머지 동작 (`applyCloudData`):
- itemId 기준 union — cloud 우선, local-only 보존
- 같은 itemId 양쪽 존재: cloud qty 우선
- 양쪽 동시 추가: 둘 다 보존
- ⚠️ 한쪽 삭제 + 다른쪽 추가 race: 추가가 이김 (삭제가 무효화될 수 있음 — 드문 경우)

### 20.2 성능 최적화 A + B
사용자 피드백 "버튼 누르고 다음 버튼까지 몇 초 걸림".

**A: 클릭 중 listener 재렌더 보류**
- `debouncedReRenderCurrentTab`: 사용자가 최근 800ms 안에 클릭했으면 재스케줄
- `document.click` capture listener로 `window._lastUserInteractionTime` 추적
- → 입고/주문 처리 직후 listener echo가 와도 다음 클릭 누락 안 됨

**B: 버튼 클릭 후 500ms 시각적 비활성화 (전역)**
- 전역 click capture에서 클릭된 button에 `opacity: 0.5` + `pointer-events: none`
- 500ms 후 자동 복원
- 핸들러마다 수정 안 함 (한 곳 코드, 자동 적용)
- 회피 옵션: `data-no-guard="1"` 속성

### 20.3 다음 우선순위 (변동 없음)
1. **Apps Script 코드 동기화** ⚠️ — 5/12 이후 35개 커밋 → 사용자 raw 복붙 필요. 안 하면 토요일 백업이 옛 코드.
2. **Phase 4 Google 로그인** ⭐ (1일) — 의료 데이터 + 50명 운영 시 필요
3. **Phase 3.1 atomic stock wiring** — 같은 품목 동시변경 race 해소
4. **부분 렌더링 refactor** (D) — 현재 A+B로 충분한지 검증 후

---

## 21. 2026-05-15 신규 프로젝트: 임플란트 재고관리

별도 폴더 + 별도 Firebase 프로젝트.

### 21.1 기본 정보
- **폴더**: `C:\Users\pc\Desktop\implant-manager`
- **GitHub**: https://github.com/moonden93/implant-manager
- **Vercel**: https://implant-manager-eta.vercel.app/
- **Firebase**: `moon-implant-manager` (별도 프로젝트)

### 21.2 데이터 origin
- Excel: `품목별 임플란트 현황(26.01~26.05).xlsx`
- 변환 스크립트: `scripts/import-implants.js`
- 결과: 175 품목 (Fixture 167 / Bone 4 / Membrane 4), 471 history (1~5월 월별 합산, 일자는 매월 15일 통일)

### 21.3 stock-manager와 차이
- INITIAL_TEAMS = [] (빈 배열, 사용자가 직접 추가)
- `ensureStandardTeams_` / `migrateTeamsV3` no-op (자동 복원 비활성화)
- categoryBadgeHtml_: Fixture(블루) / Bone(앰버) / Membrane(퍼플)
- 제목: 문치과병원 임플란트 재고관리
- vendor 5개로 정리 (메가젠/메가젠ARI/스테리오스/포인트 + 막/본은 별도), category는 Bone/Membrane 분리

### 21.4 Phase 2 (추후)
- Lot 번호 추적
- 환자별 사용 기록 (덴트웹 통합)
- 사이즈 매트릭스 뷰 (직경×길이)
- 만료일 알림

### 21.5 알아야 할 것
- 모든 단가 0, 부족기준 0 (Excel에 없어서) — 사용자가 운영하며 채워야 함
- stock-manager의 백업 시스템(GitHub Actions / Apps Script)은 별도 프로젝트라 적용 안 됨 — 필요하면 별도 셋업
- Firebase는 별도 프로젝트라 quota도 별도

---

_마지막 갱신: 2026-05-28 (장바구니 기기간 동기화 + 성능 A+B + 임플란트 매니저 신규 프로젝트 정리)_
