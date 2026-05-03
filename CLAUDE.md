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
필드: `inventory`, `history`, `requests`, `teams`, `teamMembers`, `documents`, `lastUpdated`

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
│   ├── 6-utils-file.js
│   ├── 7-release.js        # 요청 탭 (장바구니, 직접 입력 수량 가능)
│   ├── 8-manage.js         # 반출관리 탭 (releasedBy 기록)
│   ├── 9-inbound.js
│   ├── 10-inventory.js
│   ├── 11-stats.js         # 통계 + AI 분석 탭 (월 선택, 코멘트, 코스트 영향)
│   ├── 12-documents.js
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
| **Apps Script** | 매주 토요일 12:00 KST | Drive `재고관리 백업/` 폴더 |

### 첨부물 (양쪽 모두 동일)
- `주차별보고_2026년 5월 1주차.xlsx` (4시트, AI 코멘트 포함)
- `재난백업용_2026년 5월 1주차.xlsx` (7시트)
- **첫째 주 토요일에는** + `월별보고_2026년 4월.xlsx` (6시트, 직전월)
- Apps Script만: `문서/` 서브폴더에 첨부 PDF/이미지 sync (변경분만)

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

_마지막 갱신: 2026-05-04_
