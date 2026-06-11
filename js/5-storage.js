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
let orders = [];         // 입고 주문 (대기/완료/취소) — 2026-05-12 추가
let teams = [];          // 팀 목록
let teamMembers = {};    // { '9층 공통': ['김간호사', '박치위생사'], ... }
let currentTab = 'release';
let cart = [];           // 반출 화면의 장바구니
let orderCart = [];      // 입고 주문 장바구니

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

    // 입고 주문 (2026-05-12 추가)
    const o = localStorage.getItem('mc_orders');
    if (o) orders = JSON.parse(o);

    // 입고 주문 장바구니 (디바이스 단위 — localStorage 영구 보존)
    const oc = localStorage.getItem('mc_order_cart');
    if (oc) orderCart = JSON.parse(oc);

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

    // [V3] 9/10/11층 데스크 팀 추가 + 표준 순서로 재정렬 (한 번만 실행)
    if (!localStorage.getItem('mc_teams_migrated_v3')) {
      teams = migrateTeamsV3(teams);
      localStorage.setItem('mc_teams_migrated_v3', '1');
    }

    // [변경] PREBUILT_TEAMS의 자동 추가 로직 제거
    // 이전에는 매번 자동 추가되어, 사용자가 삭제한 팀이 다시 살아났음.
    // 이제 PREBUILT_TEAMS는 마이그레이션 시에만 사용되고, 평상시에는 사용자 설정 우선.

    // 팀 멤버
    const tm = localStorage.getItem('mc_team_members');
    teamMembers = tm ? JSON.parse(tm) : {};

    // 마이그레이션이 발생했으면 저장
    if (localStorage.getItem('mc_teams_migrated_v2_just_ran') === '1') {
      saveAll();
      localStorage.removeItem('mc_teams_migrated_v2_just_ran');
    }

    // 퇴사자 팀 정리: Dr. 이상민팀 — 팀 목록/멤버에서만 제거.
    // ⚠️ history는 보존 (옛 사용 기록 분석용).
    // ⚠️ requests도 보존 (대기 중인 게 있을 가능성).
    if (!localStorage.getItem('mc_remove_isangmin_v2')) {
      const removed = 'Dr. 이상민팀';
      teams = teams.filter(t => t !== removed);
      if (teamMembers[removed]) delete teamMembers[removed];
      saveAll();
      localStorage.setItem('mc_remove_isangmin_v2', '1');
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

// 표준 팀이 누락되어 있으면 정확한 위치에 삽입 (Firebase에서 옛 데이터 받았을 때 self-healing)
// 사용자가 추가한 비표준 팀(기타)은 보존
// 모든 표준 팀이 이미 있으면 순서를 건드리지 않음
function ensureStandardTeams_(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  const standardOrder = [
    '9층 데스크', '9층 공통', 'Dr. 이승주팀', 'Dr. 권혜진팀', 'Dr. 이수연팀',
    '10층 데스크', '10층 공통', 'Dr. 병원장팀', 'Dr. 이창률팀', '기공실',
    '11층 데스크', '11층 공통', 'Dr. 이영일팀', 'Dr. 정석형팀', 'Dr. 김세일팀'
  ];
  const allPresent = standardOrder.every(t => arr.includes(t));
  if (allPresent) return arr;  // 이미 다 있으면 순서 유지
  // 누락된 표준 팀이 있으면 표준 순서로 재정렬, 비표준 팀은 뒤에 보존
  const standardSet = new Set(standardOrder);
  const result = standardOrder.slice();
  arr.forEach(t => {
    if (!standardSet.has(t) && !result.includes(t)) result.push(t);
  });
  return result;
}

// [V3] 9층 데스크, 10층 데스크, 11층 데스크 추가 + 표준 순서로 재정렬
// 표준에 없는 사용자 추가 팀(기타)은 표준 팀들 뒤에 보존
function migrateTeamsV3(currentTeams) {
  // V3 표준 순서 (요청 탭 그리드 순서와 동일, INITIAL_TEAMS와 일치)
  const standardOrder = [
    '9층 데스크', '9층 공통', 'Dr. 이승주팀', 'Dr. 권혜진팀', 'Dr. 이수연팀',
    '10층 데스크', '10층 공통', 'Dr. 병원장팀', 'Dr. 이창률팀', '기공실',
    '11층 데스크', '11층 공통', 'Dr. 이영일팀', 'Dr. 정석형팀', 'Dr. 김세일팀'
  ];
  const standardSet = new Set(standardOrder);

  // 1. 표준 팀을 표준 순서대로 (없는 표준 팀은 자동 추가됨)
  const result = [];
  standardOrder.forEach(t => result.push(t));
  // 2. 사용자가 추가한 비표준 팀(기타)은 뒤에 보존
  currentTeams.forEach(t => {
    if (!standardSet.has(t) && !result.includes(t)) result.push(t);
  });

  // 마이그레이션 발생 표시 (loadData가 saveAll 호출)
  localStorage.setItem('mc_teams_migrated_v2_just_ran', '1');

  return result;
}

// ============================================
// ID 기반 머지: 클라우드 우선 + 로컬에만 있는 항목 보존
// ============================================
// 기기 A가 항목을 만들고 Firebase 쓰기 실패 → 새로고침 시 클라우드 sync로
// 그 항목이 사라지던 사고를 막기 위함. 클라우드의 같은 ID 항목이 있으면
// 클라우드 버전 사용(다른 기기의 상태 변경 반영), 없으면 로컬 항목 보존.
function mergeByIdPreserveLocal(localArr, cloudArr) {
  if (!Array.isArray(localArr)) return cloudArr.slice();
  const cloudIds = new Set();
  cloudArr.forEach(it => { if (it && it.id) cloudIds.add(it.id); });
  const localOnly = localArr.filter(it => it && it.id && !cloudIds.has(it.id));
  return [...cloudArr, ...localOnly];
}

// ============================================
// 데이터 sanity check
// ============================================
// 핵심 데이터(inventory + teams)가 둘 다 비어있으면 "비정상 상태"로 간주.
// → 이런 데이터를 클라우드에 올리지도, 클라우드에서 받지도 않는다.
// 빈 상태 발생 케이스: 새 브라우저/시크릿 탭/캐시 청소 직후 첫 로드, 어떤 버그로 메모리가 비었을 때 등
function isDataSuspicious(d) {
  if (!d) return true;
  const invEmpty = !Array.isArray(d.inventory) || d.inventory.length === 0;
  const teamsEmpty = !Array.isArray(d.teams) || d.teams.length === 0;
  // 핵심 골격(품목+팀) 둘 다 비어있으면 비정상.
  // requests/teamMembers는 별도 개별 가드(saveToFirebase의 대량 감소 가드)로 보호.
  return invEmpty && teamsEmpty;
}

// Phase 1 강화: 클라우드 데이터의 갑작스런 대량 감소 감지 (load 시점)
// 사고 후 wipe된 클라우드를 안고 시작하지 않게 추가 경고.
function detectCloudWipeOnLoad(data, lastSnap) {
  if (!data || !lastSnap) return null;
  const checks = [];
  if (Array.isArray(data.requests) && lastSnap.requestsCount > 5) {
    const drop = (lastSnap.requestsCount - data.requests.length) / lastSnap.requestsCount;
    if (drop > 0.5) checks.push('requests ' + lastSnap.requestsCount + '→' + data.requests.length);
  }
  if (Array.isArray(data.history) && lastSnap.historyCount > 100) {
    const drop = (lastSnap.historyCount - data.history.length) / lastSnap.historyCount;
    if (drop > 0.3) checks.push('history ' + lastSnap.historyCount + '→' + data.history.length);
  }
  if (Array.isArray(data.inventory) && lastSnap.inventoryCount > 100) {
    const drop = (lastSnap.inventoryCount - data.inventory.length) / lastSnap.inventoryCount;
    if (drop > 0.3) checks.push('inventory ' + lastSnap.inventoryCount + '→' + data.inventory.length);
  }
  return checks.length > 0 ? checks.join(', ') : null;
}

// 변경사항 적용 헬퍼: 클라우드 데이터를 로컬에 반영하되 보호 규칙 적용
// - inventory/teams: 클라우드가 비어있으면 무시 (옛 정상 데이터 보호)
// - teamMembers: 클라우드가 비어있고 로컬에 있으면 로컬 유지
//   (담당자 데이터가 한 번 사라지면 다시 복구하기 번거로워서 특별 보호)
// - history/requests: 빈 배열도 정상 변경으로 간주 (의도적 삭제 가능)
function applyCloudData(data) {
  // Phase 3 cutover (inventory): 컬렉션 listener가 활성화됐으면 단일 문서의 inventory 무시
  // (단일 문서는 backup으로 계속 쓰기는 함 — 안전망)
  if (Array.isArray(data.inventory) && data.inventory.length > 0 && !window._inventoryCollectionListenerActive) {
    inventory = data.inventory;
  }

  // Phase 2 cutover: requests는 더 이상 단일 문서에서 안 읽음.
  // js/17-requests-collection.js의 컬렉션 listener가 source of truth.
  if (Array.isArray(data.requests) && !window._requestsCollectionListenerActive) {
    requests = mergeByIdPreserveLocal(requests, data.requests);
  }
  // Phase 3 cutover (history): 컬렉션 listener가 활성화됐으면 단일 문서의 history 무시
  if (Array.isArray(data.history) && !window._historyCollectionListenerActive) {
    history = mergeByIdPreserveLocal(history, data.history);
  }

  if (Array.isArray(data.teams) && data.teams.length > 0) {
    // Firebase가 옛 teams 배열(데스크 팀 없는 버전)로 덮으면 안 되므로
    // 표준 팀 누락되어 있으면 자동 보강 (self-healing)
    const enhanced = ensureStandardTeams_(data.teams);
    teams = enhanced;
    if (enhanced.length !== data.teams.length) {
      // 보강됐으면 클라우드에도 push (다음 사용자 액션이 아닌 자동)
      setTimeout(function() { if (typeof saveAll === 'function') saveAll(); }, 300);
    }
  }

  const cloudMembers = data.teamMembers;
  const cloudHasMembers = cloudMembers && typeof cloudMembers === 'object' && Object.keys(cloudMembers).length > 0;
  const localHasMembers = teamMembers && Object.keys(teamMembers).length > 0;
  if (cloudHasMembers) {
    teamMembers = cloudMembers;
  } else if (!localHasMembers) {
    teamMembers = cloudMembers || {};
  }
  // (cloud 비어있고 local에 있으면) 로컬 유지 → 다음 saveAll 시 자동으로 클라우드에 반영

  // 주문 장바구니 (orderCart) — 기기간 공유. itemId 기준 union 머지.
  // 같은 itemId면 cloud의 qty 사용 (한쪽이 수정했을 가능성 우선)
  // local-only 항목은 보존 (다른 기기에서 추가한 게 cloud로 아직 안 갔을 수도)
  if (Array.isArray(data.orderCart)) {
    const cloudCart = data.orderCart;
    const cloudIdSet = new Set(cloudCart.map(c => c.itemId));
    const localOnly = (orderCart || []).filter(c => c && c.itemId && !cloudIdSet.has(c.itemId));
    orderCart.length = 0;
    cloudCart.forEach(c => orderCart.push(c));
    localOnly.forEach(c => orderCart.push(c));
  }
}

// ============================================
// localStorage 저장 (오프라인 백업)
// ============================================
function saveToLocalStorage() {
  try {
    // 직전 상태의 핵심 데이터(teams + teamMembers) 백업
    // teamMembers/teams가 갑자기 사라져도 콘솔에서 mcRestoreFromBackup() 으로 복구 가능
    const prevTeams = localStorage.getItem('mc_teams');
    const prevMembers = localStorage.getItem('mc_team_members');
    if (prevTeams && prevTeams !== '[]') localStorage.setItem('mc_teams_backup', prevTeams);
    if (prevMembers && prevMembers !== '{}') localStorage.setItem('mc_team_members_backup', prevMembers);

    localStorage.setItem('mc_inventory', JSON.stringify(inventory));
    localStorage.setItem('mc_history', JSON.stringify(history));
    localStorage.setItem('mc_requests', JSON.stringify(requests));
    localStorage.setItem('mc_orders', JSON.stringify(orders));
    localStorage.setItem('mc_order_cart', JSON.stringify(orderCart));
    localStorage.setItem('mc_teams', JSON.stringify(teams));
    localStorage.setItem('mc_team_members', JSON.stringify(teamMembers));
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('저장 실패: 용량 부족', 'error');
    } else {
      console.error('저장 실패:', e);
    }
  }
}

// ============================================
// Firebase Firestore 저장 (클라우드 메인)
// ============================================
// Phase 1 안전망: 직전 클라우드 카운트 캐시 (대량 감소 감지용)
window._lastCloudSnapshot = window._lastCloudSnapshot || {
  inventoryCount: 0, historyCount: 0, requestsCount: 0
};

async function saveToFirebase() {
  if (!window.firebaseReady) return;

  // 보호 1: inventory + teams 둘 다 비어있는 비정상 상태에선 저장 거부.
  if (isDataSuspicious({ inventory, teams })) {
    console.warn('⚠️ 로컬 데이터가 비어있어 Firebase 저장을 거부했습니다 (클라우드 보호 모드)');
    return;
  }

  // Phase 1 보호 2: 대량 감소 감지 (직전 클라우드 대비 30%+ 감소면 차단)
  // 의도적이라면 콘솔에서 window._allowMassDecrease=true 설정 후 다시 시도
  const prev = window._lastCloudSnapshot;
  function checkMassDecrease(name, before, after) {
    if (!before || before <= 5) return false;  // 표본 너무 작으면 무시
    const drop = (before - after) / before;
    if (drop > 0.3 && !window._allowMassDecrease) {
      console.error('🛑 ' + name + ' 대량 감소 감지: ' + before + ' → ' + after +
                    ' (' + Math.round(drop * 100) + '% 감소). 저장 거부.');
      console.error('   의도적이라면 콘솔에서 window._allowMassDecrease=true 설정 후 다시 시도');
      if (typeof showToast === 'function') {
        showToast(name + ' 대량 감소 감지 — 저장 거부. 콘솔 확인.', 'error');
      }
      if (typeof logEvent === 'function') {
        logEvent('system', 'save_blocked', {
          summary: name + ' 대량 감소 (' + before + '→' + after + ')',
          field: name, before, after, dropPct: Math.round(drop * 100)
        });
      }
      return true;
    }
    return false;
  }
  if (checkMassDecrease('requests', prev.requestsCount, requests.length)) return;
  if (checkMassDecrease('inventory', prev.inventoryCount, inventory.length)) return;
  if (checkMassDecrease('history', prev.historyCount, history.length)) return;

  try {
    // 단일 문서(appData/main)에는 이제 teams / teamMembers / orderCart 만 남긴다.
    // requests / history / inventory 는 각자 per-doc 컬렉션이 source of truth →
    // 단일 문서에 또 통째로 쓰는 건 "매 동작마다 발생하는 중복 쓰기"였고 쓰기 한도 소진의 주범.
    // (history·inventory는 이미 토글로 제외했고, requests만 남아있었음 → 여기서 제거)
    // 기존 단일 문서의 requests 필드는 merge:true라 지워지지 않고 백업으로 그대로 남는다.
    //
    // 변경 없으면 쓰기 skip: teams/teamMembers가 직전에 쓴 값과 같고 장바구니도 안 바뀌었으면
    // 불필요한 쓰기를 하지 않는다. 장바구니 변경(_orderCartDirty)은 항상 반영.
    const mainSig = JSON.stringify(teams) + '||' + JSON.stringify(teamMembers);
    if (!window._orderCartDirty && mainSig === window._lastMainDocSig) {
      return;
    }
    // setDoc + merge:true: payload에 포함된 필드만 갱신. 빈 teams/teamMembers를
    // 아예 payload에서 빼면 클라우드의 기존 값이 보존됨.
    // 이전 구현(setDoc 통째로)은 한 기기의 빈 teamMembers가 클라우드를 덮어쓰는 사고를 냈음.
    const payload = {
      lastUpdated: window.firebaseServerTimestamp()
    };

    // 주문 장바구니 (orderCart) — 기기간 공유. 단, 이 기기가 실제로 카트를
    // 바꿨을 때만 씀 (window._orderCartDirty). 매번 통째로 쓰면 빈/stale 카트를
    // 가진 기기가 다른 기기의 카트 추가를 덮어쓰는 race가 생김.
    if (window._orderCartDirty) {
      payload.orderCart = orderCart;
      window._orderCartDirty = false;
    }

    // history / inventory 는 단일 문서에 쓰지 않는다 (컬렉션이 source of truth, 단일 문서의
    // 기존 history/inventory 필드는 이미 삭제됨 — 2026-05-09). 예전엔 per-device localStorage
    // 토글(_disableSingleDoc*Sync)에 의존했는데, 토글이 안 켜진 새 기기가 history 1,500건을
    // 단일 문서에 통째로 써서 1MB 초과 + 대량 쓰기를 일으킬 위험이 있었음.
    // 그래서 기기 상태와 무관하게 코드에서 항상 제외한다. (requests도 위에서 같은 이유로 제거)

    // teams는 비어있을 때만 제외 (PREBUILT가 있어서 정상 상태에선 절대 비지 않음)
    if (Array.isArray(teams) && teams.length > 0) {
      payload.teams = teams;
    } else {
      console.warn('⚠️ teams가 비어있어 payload에서 제외 (클라우드의 teams 보존)');
    }

    // teamMembers도 비어있을 때만 제외 (의도치 않은 wipe 방지)
    if (teamMembers && Object.keys(teamMembers).length > 0) {
      payload.teamMembers = teamMembers;
    } else {
      console.warn('⚠️ teamMembers가 비어있어 payload에서 제외 (클라우드의 teamMembers 보존)');
    }

    const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
    await window.firebaseSetDoc(docRef, payload, { merge: true });
    // 다음 save 때 "변경 없으면 skip" 비교 기준 갱신
    window._lastMainDocSig = mainSig;
    console.log('✅ Firebase 저장 성공');
    if (typeof setFirebaseStatus === 'function') setFirebaseStatus('connected');
    // 성공 시 snapshot 갱신 (다음 save 비교 기준)
    window._lastCloudSnapshot = {
      inventoryCount: inventory.length,
      historyCount: history.length,
      requestsCount: requests.length
    };
    // _allowMassDecrease 플래그는 1회 사용 후 자동 해제
    if (window._allowMassDecrease) {
      window._allowMassDecrease = false;
      console.log('ℹ️ _allowMassDecrease 플래그 자동 해제 (1회 사용 후)');
    }
  } catch (err) {
    console.error('❌ Firebase 저장 실패:', err);
    if (typeof setFirebaseStatus === 'function') setFirebaseStatus('error', err && err.message);
    if (typeof showToast === 'function') showToast('클라우드 저장 실패 (로컬은 저장됨)', 'error');
  }
}

// ============================================
// Firebase Firestore에서 로드 (앱 시작 시 1회)
// ============================================
// loadFromFirebase 결과: { loaded: bool, cloudIncomplete: bool }
// cloudIncomplete가 true면 자가 복원 트리거 (PC가 로컬의 teams/teamMembers를 클라우드에 다시 푸시)
async function loadFromFirebase() {
  if (!window.firebaseReady) return { loaded: false, cloudIncomplete: false };
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
    const snapshot = await window.firebaseGetDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();

      if (isDataSuspicious(data)) {
        console.warn('⚠️ Firebase 데이터가 비어있어 무시 (로컬 데이터 유지)');
        return { loaded: false, cloudIncomplete: true };
      }

      // 클라우드가 부분적으로 비어있는지 감지 (teams 또는 teamMembers가 wipe된 상태)
      const cloudTeamsEmpty = !Array.isArray(data.teams) || data.teams.length === 0;
      const cloudMembersEmpty = !data.teamMembers || Object.keys(data.teamMembers).length === 0;
      const cloudIncomplete = cloudTeamsEmpty || cloudMembersEmpty;

      applyCloudData(data);
      saveToLocalStorage();
      console.log('✅ Firebase 로드 성공' + (cloudIncomplete ? ' (클라우드 부분 비어있음 — 자가 복원 검토)' : ''));
      if (typeof setFirebaseStatus === 'function') setFirebaseStatus('connected');
      // Phase 1 안전망: 로드된 클라우드 카운트를 기준선으로 (다음 save 비교용)
      window._lastCloudSnapshot = {
        inventoryCount: (data.inventory || []).length,
        historyCount: (data.history || []).length,
        requestsCount: (data.requests || []).length
      };
      return { loaded: true, cloudIncomplete };
    }
    return { loaded: false, cloudIncomplete: false };
  } catch (err) {
    console.error('❌ Firebase 로드 실패:', err);
    if (typeof setFirebaseStatus === 'function') setFirebaseStatus('error', err && err.message);
    return { loaded: false, cloudIncomplete: false };
  }
}

// ============================================
// Firebase 실시간 동기화 리스너
// ============================================
// 사용자가 input/textarea 입력 중이면 sync는 보류 → IME 조합 깨짐 방지.
// (보류된 데이터는 사용자가 input에서 빠져나가는 순간 자동 적용됨)
let _pendingSync = null;
let _pendingSyncFlushAttached = false;

function _isUserTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'button' && el.type !== 'submit') return true;
  if (tag === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

function _applySyncData(data) {
  applyCloudData(data);
  saveToLocalStorage();
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  // debounced 재렌더 — 단일 문서 + collection listener echo 합쳐서 한 번만 실행
  // (saveAll 한 번이 단일 문서 + 여러 컬렉션을 동시에 건드려서 echo가 cascading하면
  //  renderInbound가 3~4번 연속 호출되어 직후 클릭이 destroy된 DOM에 가서 누락)
  if (typeof debouncedReRenderCurrentTab === 'function') {
    debouncedReRenderCurrentTab();
  } else {
    const renderFn = window['render' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1)];
    if (typeof renderFn === 'function') renderFn();
  }
  // Phase 1 안전망: 클라우드 카운트 기준선 갱신
  // ⚠️ 컬렉션 listener가 활성인 필드는 단일 문서 카운트로 덮어쓰지 않음
  // (옛 단일 문서가 컬렉션보다 N건 많을 때 다음 save가 false alarm 나는 버그 방지)
  if (!window._lastCloudSnapshot) window._lastCloudSnapshot = { inventoryCount: 0, historyCount: 0, requestsCount: 0 };
  if (!window._inventoryCollectionListenerActive) {
    window._lastCloudSnapshot.inventoryCount = (data.inventory || []).length;
  }
  if (!window._historyCollectionListenerActive) {
    window._lastCloudSnapshot.historyCount = (data.history || []).length;
  }
  if (!window._requestsCollectionListenerActive) {
    window._lastCloudSnapshot.requestsCount = (data.requests || []).length;
  }
  console.log('🔄 동기화 완료');
}

// 입력 끝나면 보류된 sync 적용
function _flushPendingSync() {
  if (_pendingSync && !_isUserTyping()) {
    const data = _pendingSync;
    _pendingSync = null;
    _applySyncData(data);
  }
}

function setupFirebaseSync() {
  if (!window.firebaseReady) return;

  // input blur 시 보류된 sync 자동 적용 (한 번만 등록)
  if (!_pendingSyncFlushAttached) {
    document.addEventListener('focusout', () => {
      // focusout 직후 다른 input으로 포커스 이동할 수도 있어서 microtask 한 박자 늦춤
      setTimeout(_flushPendingSync, 0);
    }, true);
    _pendingSyncFlushAttached = true;
  }

  const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
  window.firebaseOnSnapshot(docRef, (snapshot) => {
    if (snapshot.exists() && snapshot.metadata.hasPendingWrites === false) {
      const data = snapshot.data();

      // 보호: 다른 기기가 빈 상태로 동기화 데이터를 보냈다면 무시
      if (isDataSuspicious(data)) {
        console.warn('⚠️ Firebase 동기화 데이터가 비어있어 무시 (현재 데이터 유지)');
        return;
      }

      // 보호: 사용자가 텍스트 입력 중이면 즉시 적용하지 않고 보류
      // (IME 한글 조합 중 input element가 destroy되면 글자가 끊김)
      if (_isUserTyping()) {
        _pendingSync = data; // 마지막 변경만 보존 (옛 보류는 덮어씀)
        console.log('⌨️ 입력 중 - 동기화 보류 (입력 끝나면 자동 적용)');
        return;
      }

      _applySyncData(data);
      if (typeof setFirebaseStatus === 'function') setFirebaseStatus('connected');
    }
  }, (err) => {
    console.error('❌ Firebase 실시간 리스너 오류:', err);
    if (typeof setFirebaseStatus === 'function') setFirebaseStatus('error', err && err.message);
  });
}

// ============================================
// 단일 문서(appData/main) 강제 fetch — orderCart / teams / teamMembers 동기화 안전망.
// onSnapshot 리스너가 잠들거나 한 번 놓쳐도 따라잡게 함 (requests/orders 컬렉션과 동일 패턴).
// 단일 문서는 그동안 force-fetch가 없어서 다른 기기의 장바구니가 안 따라오는 문제가 있었음.
// ============================================
window.forceFetchMainDoc = forceFetchMainDoc;
async function forceFetchMainDoc() {
  if (!window.firebaseReady || !window.firebaseGetDoc || !window.firebaseDoc) return;
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
    const snap = await window.firebaseGetDoc(docRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (isDataSuspicious(data)) return;
    if (_isUserTyping()) { _pendingSync = data; return; }
    _applySyncData(data);
  } catch (err) {
    console.warn('단일 문서 force fetch 실패:', err && err.message);
  }
}

if (typeof window !== 'undefined' && !window._mainDocForceFetchAttached) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') forceFetchMainDoc();
  });
  window.addEventListener('focus', () => forceFetchMainDoc());
  window.addEventListener('online', () => forceFetchMainDoc());
  window._mainDocForceFetchAttached = true;
}

// ============================================
// 장바구니 진단 + 양방향 통합 (콘솔)
// ============================================
// 다른 기기 카트가 안 보일 때 ground truth 확인용.
//   mcDiagnoseCart()  — 이 기기 카트 vs 클라우드 카트 비교 출력
window.mcDiagnoseCart = async function() {
  console.log('=== 장바구니 진단 ===');
  console.log('[이 기기] ' + (orderCart || []).length + '종:');
  (orderCart || []).forEach(c => console.log('  · ' + (c.name || c.itemId) + ' x' + c.qty));
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
    const snap = await window.firebaseGetDoc(docRef);
    const cloud = (snap.exists() && Array.isArray(snap.data().orderCart)) ? snap.data().orderCart : [];
    console.log('[클라우드] ' + cloud.length + '종:');
    cloud.forEach(c => console.log('  · ' + (c.name || c.itemId) + ' x' + c.qty));
    console.log('---');
    console.log('클라우드가 비어있으면 → 카트를 담은 컴퓨터에서 mcSyncCart() 실행하세요.');
    console.log('클라우드에 있는데 이 기기에 없으면 → forceFetchMainDoc() 실행하세요.');
  } catch (e) { console.warn('클라우드 조회 실패:', e && e.message); }
};

// 이 기기 카트 + 클라우드 카트를 itemId 기준 합쳐(union) 양쪽에 반영.
// "다른 컴퓨터에서 담았는데 사라진" 카트 복구용 — 카트 있는 기기에서 실행하면
// 클라우드로 올라가고, 다른 기기는 forceFetchMainDoc / 포커스로 받아감.
window.mcSyncCart = async function() {
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
    const snap = await window.firebaseGetDoc(docRef);
    const cloud = (snap.exists() && Array.isArray(snap.data().orderCart)) ? snap.data().orderCart : [];
    const byId = {};
    cloud.forEach(c => { if (c && c.itemId) byId[c.itemId] = c; });
    (orderCart || []).forEach(c => { if (c && c.itemId) byId[c.itemId] = c; });  // 로컬 우선
    const merged = Object.values(byId);
    orderCart.length = 0;
    merged.forEach(c => orderCart.push(c));
    window._orderCartDirty = true;
    if (typeof saveAll === 'function') saveAll();
    if (typeof renderInbound === 'function') renderInbound();
    console.log('🛒 장바구니 통합 완료: ' + merged.length + '종 (클라우드+이 기기). 다른 기기는 포커스 시 따라옴.');
  } catch (e) { console.warn('카트 통합 실패:', e && e.message); }
};

// ============================================
// 백업 복구 (콘솔에서 mcRestoreFromBackup() 호출)
// ============================================
// 만약 또 teamMembers가 사라지면 F12 → Console에서 mcRestoreFromBackup() 입력 → Enter
function mcRestoreFromBackup() {
  const backupTeams = localStorage.getItem('mc_teams_backup');
  const backupMembers = localStorage.getItem('mc_team_members_backup');
  if (!backupTeams && !backupMembers) {
    console.warn('백업이 없습니다');
    return false;
  }
  try {
    if (backupTeams) teams = JSON.parse(backupTeams);
    if (backupMembers) teamMembers = JSON.parse(backupMembers);
    saveAll();
    if (typeof updateHeaderStats === 'function') updateHeaderStats();
    if (typeof switchTab === 'function') switchTab(currentTab);
    console.log('✅ 백업에서 복구 완료. 팀:', teams.length + '개, 담당자 그룹:', Object.keys(teamMembers).length + '개');
    if (typeof showToast === 'function') showToast('백업에서 복구 완료', 'success');
    return true;
  } catch (e) {
    console.error('복구 실패:', e);
    return false;
  }
}
// 콘솔에서 호출 가능하도록 window에 노출
if (typeof window !== 'undefined') window.mcRestoreFromBackup = mcRestoreFromBackup;

// ============================================
// 클라우드 강제 동기화 (로컬 → 클라우드 데이터로 교체)
// ============================================
// 머지 로직 우회. 폰이 옛 로컬 데이터를 가지고 있을 때 사용.
// ⚠️ 클라우드(Firebase)는 절대 건드리지 않음. 한 방향(cloud → local)만.
//   - 다른 기기에서 변경한 게 화면에 안 보일 때
//   - 폰의 옛 캐시 데이터를 버리고 PC와 일치시킬 때
async function mcForceSyncFromCloud() {
  if (!window.firebaseReady) {
    console.error('Firebase 연결 안 됨');
    if (typeof showToast === 'function') showToast('Firebase 연결 안 됨', 'error');
    return;
  }
  // Phase 1 안전망: audit log
  if (typeof logEvent === 'function') {
    logEvent('system', 'force_sync_from_cloud', { summary: '로컬을 클라우드 데이터로 강제 교체' });
  }
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'appData', 'main');
    const snapshot = await window.firebaseGetDoc(docRef);
    if (!snapshot.exists()) {
      console.error('클라우드에 데이터 없음');
      if (typeof showToast === 'function') showToast('클라우드 데이터 없음', 'error');
      return;
    }
    const data = snapshot.data();
    if (isDataSuspicious(data)) {
      console.error('클라우드 데이터 비정상 — 동기화 중단');
      if (typeof showToast === 'function') showToast('클라우드 데이터가 비정상이라 동기화 중단', 'error');
      return;
    }
    // 로컬 완전 교체 (머지 안 함)
    inventory.length = 0;
    if (Array.isArray(data.inventory)) data.inventory.forEach(it => inventory.push(it));
    history.length = 0;
    if (Array.isArray(data.history)) data.history.forEach(h => history.push(h));
    requests.length = 0;
    if (Array.isArray(data.requests)) data.requests.forEach(r => requests.push(r));
    teams.length = 0;
    if (Array.isArray(data.teams)) data.teams.forEach(t => teams.push(t));
    Object.keys(teamMembers).forEach(k => delete teamMembers[k]);
    if (data.teamMembers && typeof data.teamMembers === 'object') {
      Object.keys(data.teamMembers).forEach(k => { teamMembers[k] = data.teamMembers[k]; });
    }

    // localStorage만 갱신 — Firebase는 push 안 함 (한 방향)
    saveToLocalStorage();
    if (typeof updateHeaderStats === 'function') updateHeaderStats();
    if (typeof switchTab === 'function') switchTab(currentTab);
    console.log('✓ 클라우드 강제 동기화 완료',
      '- 품목:', inventory.length, '/ 이력:', history.length,
      '/ 요청:', requests.length, '/ 팀:', teams.length);
    if (typeof showToast === 'function') showToast('클라우드 데이터로 동기화 완료', 'success');
  } catch (err) {
    console.error('동기화 실패:', err);
    if (typeof showToast === 'function') showToast('동기화 실패: ' + (err.message || ''), 'error');
  }
}
if (typeof window !== 'undefined') window.mcForceSyncFromCloud = mcForceSyncFromCloud;

// ============================================
// 모든 데이터 저장 (localStorage + Firebase)
// ============================================
function saveAll() {
  saveToLocalStorage();
  saveToFirebase(); // 비동기, await 안 함 (fire-and-forget)
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
