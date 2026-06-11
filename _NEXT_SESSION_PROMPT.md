# 다음 세션 시작 프롬프트

새 Claude Code 세션 시작 시 아래 내용을 그대로 복붙해서 첫 메시지로 보내주세요.

---

## 복붙용 프롬프트 (여기서부터)

이전 세션에서 이어지는 작업입니다. CLAUDE.md 파일이 자동으로 읽혀서 컨텍스트는 이어집니다.

### 이전 세션 상태 (2026-06-11 종료 시점)

**stock-manager 최근 커밋**:
- `e59b8e2` — 요청 수정 모달 직접요청 풀 편집 + 주문 필요 요청자 표시 + 전역 render 지연
- `18ce643` — 직접 요청 장바구니 추가 느린 문제 fix
- `c185f96` — 요청 수정 모달 ghost tap 가드 + 주문 필요에 메모/사진 표시

**작업 환경**:
- 폴더: `C:\Users\pc\Desktop\stock-manager`
- 배포: https://moondentalstock.vercel.app/
- GitHub: https://github.com/moonden93/stock-manager
- Firebase: `moon-dental-stock`

**별도 프로젝트** (implant-manager):
- 폴더: `C:\Users\pc\Desktop\implant-manager`
- 배포: https://implant-manager-eta.vercel.app/
- GitHub: https://github.com/moonden93/implant-manager
- Firebase: `moon-implant-manager`

### 우선 확인 사항 (사용자가 직접 확인)

1. **6/11에 적용한 전역 render 지연 (CLAUDE.md 22.3)이 실제로 효과 있는지** 운영해보고 알려주기
   - 클릭 한 번에 즉시 반응하는지
   - 입력창 첫 클릭에 바로 focus되는지
   - "한 번 더 클릭" 증상이 사라졌는지

2. **요청 수정 모달**에서 직접요청 항목을 클릭 → 모든 필드 (품목명/업체/단위/수량/상세설명/사진) 수정 가능한지 확인

3. **주문 필요 섹션**에 요청자 표시 (👤 팀 · 담당자) 나오는지

### 알려진 미해결 / 후순위 작업

**A. Phase 4 Google 로그인** ⭐ (1일)
- 50명 운영 + 의료 데이터 보안
- Firebase Authentication + 로그인 게이트
- audit log에 진짜 사용자명 표시
- 가장 큰 다음 작업

**B. 장바구니 동기화 race 모니터링**
- 한쪽 기기 삭제 + 다른 쪽 동시 추가 시 추가가 이김 (의도된 한계)
- 실제 운영에서 사고 발생하면 per-item timestamp로 개선 (반나절)

**C. implant-manager 단가/부족기준 입력**
- 사용자 액션 — 운영하며 채워가기
- 부족 알림 기능 활성화

**D. implant-manager 백업 시스템** (추후)
- 데이터 쌓이면 stock-manager 패턴 복제 (1시간)
- GitHub Actions + Apps Script 별도 설정 필요

**E. Phase 3.1 atomic stock wiring** (반나절)
- 입고/반출 stock 변경을 increment로 (현재 `adjustInventoryStock` 있으면 사용)
- 같은 품목 동시변경 race 완벽 해소

### 첫 메시지로 하실 일

위 우선순위 중 어느 것 진행할지 알려주시거나, 새 이슈 발생했으면 그 내용 알려주세요.

특별한 요구사항 없으면 **현재 안정 상태 유지 + 운영 모니터링** 추천합니다.

---

(여기까지 복붙)
