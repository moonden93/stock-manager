# 재설계 계획 — 50명 동시접속 안전 운영 시스템

> 시작: 2026-05-05
> 사고 계기: 5/3 유현영 5건 요청 데이터 wipe (단일 문서 구조 + 머지 로직 결함)
> 목표: 다시는 동일한 사고 없는, 다중 사용자 안전 시스템

---

## 현 시스템 근본 문제 (요약)

| 문제 | 현재 | 50명 운영 시 위험 |
|---|---|---|
| 단일 Firestore 문서 (`appData/main`) | 모든 데이터 한 문서 | 동시 쓰기 race → 데이터 손실 |
| Wholesale 덮어쓰기 | setDoc + merge:true이지만 array는 통째 교체 | A의 새 요청을 B의 동시 쓰기가 덮음 |
| 1MB 문서 한도 | 현재 ~500KB | 곧 초과 → 저장 실패 |
| 변경 이력 없음 | 현재 상태만 저장 | 사고 추적/복구 불가 |
| 인증 없음 | 익명 접근 | 누가 무엇 했는지 모름, 권한 통제 불가 |
| 자동 saveAll 트리거 | ensureStandardTeams 등 | 사용자 의도와 무관하게 cloud 변경 |
| 위험 콘솔 함수 노출 | mcResetToSheetData 등 | 누구나 한 줄로 wipe 가능 |
| 머지 로직 결함 | 시간 기반 (revert됨) | 빈 cloud + 옛 local → 무한 wipe spiral |
| 백업 주기 거침 | 주 1회 토요일 | 주중 사고 시 6일치 손실 |
| Service Worker | network-first, 충돌 처리 없음 | 오프라인 변경 충돌 시 임의 결과 |

---

## 재설계 단계

### Phase 1: 안전 기반 (오늘 밤 완료) — 즉시 추가 손실 차단
**목표**: 단일 문서 구조 그대로 두되, 어떤 변경도 영구 기록되어 추적/복구 가능하게.

- [x] 시간 기반 머지 revert (완료)
- [ ] `events/` Firestore 컬렉션 — append-only audit log
- [ ] 모든 상태 변경(request create/update/delete, inventory 차감, etc.)이 events에도 기록
- [ ] device id + timestamp + before/after 데이터 포함
- [ ] `ensureStandardTeams_` 자동 saveAll 제거 (사용자 액션 시에만 저장)
- [ ] 위험 콘솔 함수 잠금 (개발자 모드 토큰 필요)
  - `mcResetToSheetData`, `mcReimportFromSheets`, `mcForceSyncFromCloud` 등
- [ ] `isDataSuspicious` 강화 — requests/teamMembers 갑작스런 대량 감소 감지
- [ ] `saveToFirebase` 안전망 — 직전 상태 대비 ≥30% 감소 시 alert + abort
- [ ] 읽기 전용 모드 토글 (사고 시 즉시 발동)

**산출물**: 추가 데이터 손실 위험 ≈ 0. 단 race condition은 여전 존재.

### Phase 2: 요청 컬렉션화 (이번 주, 3~5일) — race condition 차단
**목표**: 다중 사용자가 동시에 작업해도 서로 영향 안 주게.

- [ ] `requests/{id}` — 한 요청이 한 문서
- [ ] CRUD 함수: `createRequest`, `updateRequest`, `deleteRequest`
- [ ] 실시간 리스너: 컬렉션 전체 또는 필터(team, status)
- [ ] 기존 단일 문서 데이터 → 컬렉션으로 마이그레이션 스크립트
- [ ] UI 코드(`8-manage.js`, `7-release.js`) 컬렉션 기반으로 리팩터
- [ ] 검증: 멀티탭 동시 변경 테스트
- [ ] `appData/main`의 `requests` 필드는 비우거나 deprecated 처리

**산출물**: 두 사람이 동시에 다른 요청 만들어도 둘 다 안전하게 보존.

### Phase 3: 전체 컬렉션화 (다음 주) — 모든 데이터 안전
- [ ] `inventory/{id}` 컬렉션
- [ ] 재고 차감을 Firestore Transaction으로 (원자성 보장)
- [ ] `history/{id}` append-only 컬렉션
- [ ] 1MB 한도 영구 해소

### Phase 4: 인증 + 권한 (그 다음 주) — 누가 무엇 했는지 추적
- [ ] Firebase Auth 도입 (이메일 또는 익명 with 이름 등록)
- [ ] 모든 events에 `userId` 포함
- [ ] Firestore Security Rules — 권한 통제
- [ ] 관리자/직원 역할 분리

### Phase 5: 운영 인프라 (지속)
- [ ] Cloud Functions로 검증 + 트랜잭션 백엔드
- [ ] 시간 단위 자동 백업 (Cloud Scheduler + Function)
- [ ] 모니터링: 문서 크기, 요청 수 급변, 에러율 → 알림
- [ ] 재해 복구 절차 문서화

---

## 의사결정 사항

### Blaze 플랜 필요 여부
- Phase 5의 Cloud Functions, Firebase Storage 등은 Blaze 필요
- 한 달 예상 비용: 50명 사용 기준 ₩500~₩2000 (대부분 무료 한도 내)
- **권장**: Phase 4 진입 시점에 활성화

### 다운타임
- Phase 1, 2: 무중단 (병렬 마이그레이션)
- Phase 3: 30분~1시간 점검 시간 권장

### 사용자 영향
- Phase 1: 사용 흐름 변화 0 (백그라운드 안전망만)
- Phase 2: 변화 0 (성능 향상은 있음)
- Phase 4: "이름 입력" 또는 "로그인" 1회 추가
