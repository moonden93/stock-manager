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

    // [신규] 퇴사자 팀 정리: Dr. 이상민팀 — 팀 목록/이력/요청/멤버에서 모두 제거 (한 번만 실행)
    if (!localStorage.getItem('mc_remove_isangmin_v1')) {
      const removed = 'Dr. 이상민팀';
      history = history.filter(h => h.team !== removed);
      requests = requests.filter(r => r.team !== removed);
      teams = teams.filter(t => t !== removed);
      if (teamMembers[removed]) delete teamMembers[removed];
      saveAll();
      localStorage.setItem('mc_remove_isangmin_v1', '1');
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
  return invEmpty && teamsEmpty;
}

// 변경사항 적용 헬퍼: 클라우드 데이터를 로컬에 반영하되 보호 규칙 적용
// - inventory/teams: 클라우드가 비어있으면 무시 (옛 정상 데이터 보호)
// - teamMembers: 클라우드가 비어있고 로컬에 있으면 로컬 유지
//   (담당자 데이터가 한 번 사라지면 다시 복구하기 번거로워서 특별 보호)
// - history/requests/documents: 빈 배열도 정상 변경으로 간주 (의도적 삭제 가능)
function applyCloudData(data) {
  if (Array.isArray(data.inventory) && data.inventory.length > 0) inventory = data.inventory;

  // requests, history는 ID 기반 머지.
  // 클라우드 우선이지만, 로컬에만 있는 항목(아직 동기화 못 한 새 요청/이력)은 보존.
  // 이전엔 wholesale replace였어서, 폰이 요청 만들고 클라우드 쓰기 실패 시
  // 다음 sync에서 빈 클라우드 데이터로 덮어써져 요청이 사라지는 사고가 있었음.
  if (Array.isArray(data.requests)) {
    requests = mergeByIdPreserveLocal(requests, data.requests);
  }
  if (Array.isArray(data.history)) {
    history = mergeByIdPreserveLocal(history, data.history);
  }

  if (Array.isArray(data.teams) && data.teams.length > 0) teams = data.teams;

  const cloudMembers = data.teamMembers;
  const cloudHasMembers = cloudMembers && typeof cloudMembers === 'object' && Object.keys(cloudMembers).length > 0;
  const localHasMembers = teamMembers && Object.keys(teamMembers).length > 0;
  if (cloudHasMembers) {
    teamMembers = cloudMembers;
  } else if (!localHasMembers) {
    teamMembers = cloudMembers || {};
  }
  // (cloud 비어있고 local에 있으면) 로컬 유지 → 다음 saveAll 시 자동으로 클라우드에 반영

  if (Array.isArray(data.documents)) documents = data.documents;
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
// Firebase Firestore 저장 (클라우드 메인)
// ============================================
async function saveToFirebase() {
  if (!window.firebaseReady) return;

  // 보호: inventory + teams 둘 다 비어있는 비정상 상태에선 저장 거부.
  if (isDataSuspicious({ inventory, teams })) {
    console.warn('⚠️ 로컬 데이터가 비어있어 Firebase 저장을 거부했습니다 (클라우드 보호 모드)');
    return;
  }

  try {
    // setDoc + merge:true: payload에 포함된 필드만 갱신. 빈 teams/teamMembers를
    // 아예 payload에서 빼면 클라우드의 기존 값이 보존됨.
    // 이전 구현(setDoc 통째로)은 한 기기의 빈 teamMembers가 클라우드를 덮어쓰는 사고를 냈음.
    const payload = {
      inventory: inventory,
      history: history,
      requests: requests,
      documents: documents,
      lastUpdated: window.firebaseServerTimestamp()
    };

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
    console.log('✅ Firebase 저장 성공');
    if (typeof setFirebaseStatus === 'function') setFirebaseStatus('connected');
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
  const renderFn = window['render' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1)];
  if (typeof renderFn === 'function') renderFn();
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
