// ============================================
// 5-storage.js: 전역 상태 + localStorage 저장/로드
// ============================================
// 의존: 1-config.js (INITIAL_TEAMS, PREBUILT_TEAMS)
//       2-data-items.js (INITIAL_ITEMS)
//       3-data-history.js (PREBUILT_HISTORY)
//       4-utils.js (직접 의존은 없으나 같은 컨텍스트)
// 사용처: 모든 화면 모듈

// ============================================
// 전역 상태 변수
// ============================================
let inventory = [];      // 재고 품목 목록
let history = [];        // 입출고 이력
let requests = [];       // 반출 요청 (대기/완료/반려)
let teams = [];          // 팀 목록
let teamMembers = {};    // { '9층 공통': ['김간호사', '박치위생사'], ... }
let documents = [];      // 첨부 문서 (PDF/이미지/엑셀/워드)
let currentTab = 'release';
let cart = [];           // 반출 화면의 장바구니

// ============================================
// 데이터 로드 (앱 시작 시 호출)
// ============================================
function loadData() {
  try {
    // 재고: 저장된 게 있으면 그것, 없으면 INITIAL_ITEMS로 초기화
    const inv = localStorage.getItem('mc_inventory');
    if (inv) {
      inventory = JSON.parse(inv);
    } else {
      inventory = INITIAL_ITEMS.map((it, i) => ({ ...it, id: 'M' + String(i).padStart(4, '0') }));
      saveAll();
    }

    // 이력
    const h = localStorage.getItem('mc_history');
    if (h) history = JSON.parse(h);

    // 누적 데이터 자동 주입: history가 비어있고 아직 적용 전이면
    if (history.length === 0 && !localStorage.getItem('mc_prebuilt_applied')) {
      history = PREBUILT_HISTORY.slice();
      localStorage.setItem('mc_history', JSON.stringify(history));
      localStorage.setItem('mc_prebuilt_applied', '1');
    }

    // 요청
    const r = localStorage.getItem('mc_requests');
    if (r) requests = JSON.parse(r);

    // 팀
    const t = localStorage.getItem('mc_teams');
    teams = t ? JSON.parse(t) : [...PREBUILT_TEAMS];
    // 누적 데이터에 있는 팀이 누락됐으면 추가
    PREBUILT_TEAMS.forEach(pt => { if (!teams.includes(pt)) teams.push(pt); });

    // 팀 멤버
    const tm = localStorage.getItem('mc_team_members');
    teamMembers = tm ? JSON.parse(tm) : {};

    // 문서
    const docs = localStorage.getItem('mc_documents');
    documents = docs ? JSON.parse(docs) : [];
  } catch (e) {
    console.error('로드 오류:', e);
    inventory = INITIAL_ITEMS.map((it, i) => ({ ...it, id: 'M' + String(i).padStart(4, '0') }));
    teams = [...INITIAL_TEAMS];
  }
  // updateHeaderStats는 4-utils.js에 없음 - 다른 모듈에서 정의됨
  // 1단계에서는 비어있어도 OK (typeof 체크로 안전하게)
  if (typeof updateHeaderStats === 'function') {
    updateHeaderStats();
  }
}

// ============================================
// 모든 데이터 저장
// ============================================
function saveAll() {
  try {
    localStorage.setItem('mc_inventory', JSON.stringify(inventory));
    localStorage.setItem('mc_history', JSON.stringify(history));
    localStorage.setItem('mc_requests', JSON.stringify(requests));
    localStorage.setItem('mc_teams', JSON.stringify(teams));
    localStorage.setItem('mc_team_members', JSON.stringify(teamMembers));
    localStorage.setItem('mc_documents', JSON.stringify(documents));
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('저장 실패: 용량 부족 (5MB 이하 파일만 첨부 가능)', 'error');
    } else {
      console.error('저장 실패:', e);
    }
  }
}

// ============================================
// 누적 데이터 강제 재로드 (설정 화면에서 호출)
// ============================================
function applyPrebuiltHistory() {
  if (!confirm('엑셀 누적 데이터(23주차, 1432건)를 불러옵니다.\n현재 입출고 이력이 모두 교체됩니다. 계속하시겠습니까?')) return;
  history = PREBUILT_HISTORY.slice();
  // 누락된 팀 보강
  PREBUILT_TEAMS.forEach(pt => { if (!teams.includes(pt)) teams.push(pt); });
  localStorage.setItem('mc_prebuilt_applied', '1');
  saveAll();
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  if (typeof showToast === 'function') showToast('누적 데이터 불러오기 완료 (' + history.length + '건)', 'success');
  if (typeof switchTab === 'function') switchTab('stats');
}
