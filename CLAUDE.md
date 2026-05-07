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
