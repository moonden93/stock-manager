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

    // ============================================
    // 팀 로드 + 마이그레이션
    // ============================================
    const t = localStorage.getItem('mc_teams');
    teams = t ? JSON.parse(t) : [...PREBUILT_TEAMS];

    // [신규] 팀 목록 자동 마이그레이션 (한 번만 실행)
    // 옛 팀명("9F 공통", "11F 공통" 등) → 새 팀명으로 통일
    // 불필요한 옛 팀 제거 (Dr. 이상민팀 등)
    // ※ history는 건드리지 않음 (통계의 과거 기록 유지)
    if (!localStorage.getItem('mc_teams_migrated_v2')) {
      teams = migrateTeamsV2(teams);
      localStorage.setItem('mc_teams_migrated_v2', '1');
    }

    // [변경] PREBUILT_TEAMS의 자동 추가 로직 제거
    // 이전에는 매번 자동 추가되어, 사용자가 삭제한 팀이 다시 살아났음.
    // 이제 PREBUILT_TEAMS는 마이그레이션 시에만 사용되고, 평상시에는 사용자 설정 우선.

    // 팀 멤버
    const tm = localStorage.getItem('mc_team_members');
    teamMembers = tm ? JSON.parse(tm) : {};

    // 문서
    const docs = localStorage.getItem('mc_documents');
    documents = docs ? JSON.parse(docs) : [];

    // 마이그레이션이 발생했으면 저장
    if (localStorage.getItem('mc_teams_migrated_v2_just_ran') === '1') {
      saveAll();
      localStorage.removeItem('mc_teams_migrated_v2_just_ran');
    }
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
// [신규] 팀 목록 마이그레이션 v2
// ============================================
// 한 번만 실행되어 옛 팀명을 새 팀명으로 통일하고,
// 불필요한 옛 팀을 제거합니다.
// 그 후로는 사용자가 자유롭게 팀을 추가/삭제 가능합니다.
function migrateTeamsV2(currentTeams) {
  // 옛 이름 → 새 이름 매핑 (정확히 일치)
  const renameMap = {
    '9F 공통': '9층 공통',
    '11F 공통': '11층 공통'
  };

  // 운영용 표준 팀 (이 외의 팀은 사용자 추가 팀이거나, 삭제 대상)
  // 4행 그리드 표시 순서대로 정의
  const standardOrder = [
    '9층 공통', 'Dr. 이승주팀', 'Dr. 권혜진팀', 'Dr. 이수연팀',
    '10층 공통', 'Dr. 병원장팀', 'Dr. 이창률팀',
    '11층 공통', 'Dr. 이영일팀', 'Dr. 정석형팀', 'Dr. 김세일팀',
    '기공실'
  ];

  // 명시적으로 제거할 옛 팀명
  const teamsToRemove = new Set(['Dr. 이상민팀']);

  // 1단계: 이름 변경 (rename)
  let renamed = currentTeams.map(t => renameMap[t] || t);

  // 2단계: 제거 대상 삭제
  renamed = renamed.filter(t => !teamsToRemove.has(t));

  // 3단계: 중복 제거 (rename으로 인해 "9F 공통" → "9층 공통"이 되어 기존 "9층 공통"과 중복될 수 있음)
  const seen = new Set();
  const dedup = [];
  renamed.forEach(t => {
    if (!seen.has(t)) { seen.add(t); dedup.push(t); }
  });

  // 4단계: 표준 팀 순서로 재정렬
  // - 표준 팀은 standardOrder 그대로 (없어도 추가, 있어도 표준 순서로 재배치)
  // - 비표준(사용자 추가) 팀은 표준 팀들 뒤에 보존
  const result = [];
  // 4-1. 표준 팀 전체를 표준 순서대로 추가 (누락된 표준 팀이 자동으로 채워짐)
  standardOrder.forEach(t => {
    result.push(t);
  });
  // 4-2. 사용자가 추가한 비표준 팀 (표준 순서에 없는 팀) 뒤에 보존
  dedup.forEach(t => {
    if (!result.includes(t)) result.push(t);
  });

  // 마이그레이션이 실제로 발생했는지 표시 (loadData가 saveAll 호출하도록)
  localStorage.setItem('mc_teams_migrated_v2_just_ran', '1');

  return result;
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
  // [변경] 자동 팀 보강 로직 제거
  // 이전: PREBUILT_TEAMS.forEach(pt => { if (!teams.includes(pt)) teams.push(pt); });
  // 이유: 사용자가 의도적으로 삭제한 팀이 누적 데이터 재로드 시 부활하는 문제 방지
  localStorage.setItem('mc_prebuilt_applied', '1');
  saveAll();
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  if (typeof showToast === 'function') showToast('누적 데이터 불러오기 완료 (' + history.length + '건)', 'success');
  if (typeof switchTab === 'function') switchTab('stats');
}
