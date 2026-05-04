// ============================================
// 99-main.js: 메인 진입점 (가장 마지막에 로드)
// ============================================
// - 탭 전환 (switchTab)
// - 토스트/모달 (showToast, askConfirm, executeConfirm, closeModal)
// - 헤더 통계 업데이트 (updateHeaderStats - 임시)
// - 앱 시작 (loadData + 첫 화면 렌더링)
//
// 2단계에서: 이 파일 안의 모달/토스트는 6-modal.js로 이동 예정,
//            updateHeaderStats는 별도 모듈로 이동 예정,
//            switchTab은 그대로 유지

// ============================================
// 탭 전환
// ============================================
function switchTab(name) {
  // 관리자 전용 탭은 비밀번호 입력 필요 (매번, 틀리면 재입력)
  // - 일반 직원: 요청, 통계만 접근 가능
  // - 관리자: 비밀번호 입력으로 반출관리/입고/재고/문서함/설정 진입
  const protectedLabels = {
    manage: '반출관리',
    inbound: '입고',
    inventory: '재고',
    documents: '문서함',
    settings: '설정 화면'
  };
  if (protectedLabels[name]) {
    const label = protectedLabels[name];
    let msg = '🔒 ' + label + '\n비밀번호를 입력하세요:';
    while (true) {
      const pw = prompt(msg);
      if (pw === null) return; // 취소(또는 ESC) → 원 탭 유지
      if (pw === '2911') break; // 통과
      msg = '❌ 비밀번호가 틀렸습니다. 다시 입력해주세요.\n\n🔒 ' + label + '\n비밀번호:';
    }
  }
  currentTab = name;
  ['release', 'manage', 'inbound', 'inventory', 'stats', 'documents', 'settings'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('active', t === name);
  });

  // 각 화면 모듈은 2단계에서 추가됨. typeof로 안전 체크.
  if (name === 'release'    && typeof renderRelease    === 'function') renderRelease();
  if (name === 'manage'     && typeof renderManage     === 'function') renderManage();
  if (name === 'inbound'    && typeof renderInbound    === 'function') renderInbound();
  if (name === 'inventory'  && typeof renderInventory  === 'function') renderInventory();
  if (name === 'stats'      && typeof renderStats      === 'function') renderStats();
  if (name === 'documents'  && typeof renderDocuments  === 'function') renderDocuments();
  if (name === 'settings'   && typeof renderSettings   === 'function') renderSettings();

  // 장바구니 바는 반출 탭에서만
  const cartBar = document.getElementById('cart-bar');
  if (cartBar) {
    cartBar.style.display = (name === 'release' && cart.length > 0) ? 'block' : 'none';
  }

  window.scrollTo(0, 0);
}

// ============================================
// 토스트
// ============================================
function showToast(msg, type) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  type = type || 'success';
  const colors = { success: 'bg-emerald-600', error: 'bg-red-500', info: 'bg-blue-500' };
  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  toast.className = 'toast ' + colors[type] + ' text-white px-6 py-4 rounded-2xl shadow-2xl font-bold text-base flex items-center gap-3';
  toast.style.maxWidth = '90%';
  toast.innerHTML = '<span class="text-2xl">' + icons[type] + '</span><span>' + msg + '</span>';
  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

// ============================================
// 확인 모달
// ============================================
function askConfirm(title, message, onYes, btnText, btnColor) {
  btnText = btnText || '예, 확인';
  btnColor = btnColor || 'amber';
  window._pendingConfirm = onYes;
  const colors = {
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700' },
    red:   { bg: 'bg-red-50',   border: 'border-red-200',   btn: 'bg-red-600 hover:bg-red-700' },
    teal:    { bg: 'bg-teal-50',    border: 'border-teal-200',    btn: 'bg-teal-600 hover:bg-teal-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700' }
  };
  const c = colors[btnColor];
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 ' + c.bg + ' border-b ' + c.border + '">' +
    '<h3 class="text-base font-bold text-slate-900">' + title + '</h3></div>' +
    '<div class="px-5 py-5"><p class="text-sm text-slate-700 whitespace-pre-line leading-relaxed">' + message + '</p></div>' +
    '<div class="px-5 py-4 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100">아니오</button>' +
    '<button onclick="executeConfirm()" class="flex-1 py-3 ' + c.btn + ' text-white rounded-lg font-bold">' + btnText + '</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

function executeConfirm() {
  const cb = window._pendingConfirm;
  closeModal();
  if (typeof cb === 'function') cb();
  window._pendingConfirm = null;
}

function closeModal() {
  const c = document.getElementById('modal-container');
  if (c) c.innerHTML = '';
}


// ============================================
// 안내/경고 모달 (확인 버튼 1개)
// ============================================
// - 단순 토스트로는 놓치기 쉬운 "사용자 행동이 필요한" 상황에서 사용.
// - 예: 필수 입력 누락, 중복, 형식 오류 등.
// - 사용자가 "확인"을 눌러야 사라지므로 메시지를 반드시 인지하게 됨.
function showAlert(title, message, btnColor) {
  btnColor = btnColor || 'amber';
  const colors = {
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700' },
    red:   { bg: 'bg-red-50',   border: 'border-red-200',   btn: 'bg-red-600 hover:bg-red-700' },
    teal:    { bg: 'bg-teal-50',    border: 'border-teal-200',    btn: 'bg-teal-600 hover:bg-teal-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700' },
    blue:  { bg: 'bg-blue-50',  border: 'border-blue-200',  btn: 'bg-blue-600 hover:bg-blue-700' }
  };
  const c = colors[btnColor] || colors.amber;
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 ' + c.bg + ' border-b ' + c.border + '">' +
    '<h3 class="text-base font-bold text-slate-900">⚠️ ' + title + '</h3></div>' +
    '<div class="px-5 py-5"><p class="text-sm text-slate-700 whitespace-pre-line leading-relaxed">' + message + '</p></div>' +
    '<div class="px-5 py-4 bg-slate-50 border-t">' +
    '<button onclick="closeModal()" class="w-full py-3 ' + c.btn + ' text-white rounded-lg font-bold">확인</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

// ============================================
// 헤더 통계 표시
// ============================================
function updateHeaderStats() {
  // 숨김 항목은 헤더 알림에서 제외 — 사용자가 행동해야 할 진짜 부족/품절만
  const visibleInv = inventory.filter(i => !i.hidden);
  const total = visibleInv.length;
  const out = visibleInv.filter(i => i.stock === 0).length;
  const low = visibleInv.filter(i => i.stock > 0 && i.stock <= i.minStock).length;
  const pending = requests.filter(r => r.status === 'pending').length;
  let html = '품목 <strong>' + total + '</strong>개';
  if (out > 0) html += ' · <span class="text-red-600 font-medium">품절 ' + out + '</span>';
  if (low > 0) html += ' · <span class="text-amber-600 font-medium">부족 ' + low + '</span>';
  if (pending > 0) html += ' · <span class="text-blue-600 font-medium">대기 ' + pending + '</span>';
  const el = document.getElementById('header-stats');
  if (el) el.innerHTML = html;
}

// ============================================
// Firebase 연결 상태 배지
// ============================================
// 사용자가 헤더에서 항상 클라우드 연결 상태를 볼 수 있게 함.
// 폰에서 동기화 안 될 때 어디가 문제인지 즉시 파악 가능.
function setFirebaseStatus(state, detail) {
  const el = document.getElementById('firebase-status');
  if (!el) return;
  const map = {
    checking: '<span class="text-slate-400">⚪ 연결 확인 중...</span>',
    connected: '<span class="text-emerald-600">🟢 클라우드 연결됨</span>',
    syncing:   '<span class="text-blue-600">🔵 동기화 중...</span>',
    offline:   '<span class="text-amber-600">🟡 오프라인 (로컬만 저장)</span>',
    error:     '<span class="text-red-600 font-medium">🔴 클라우드 연결 실패</span>' +
               (detail ? '<br><span class="text-[9px] text-red-500">' + escapeHtml(detail).slice(0, 80) + '</span>' : '')
  };
  el.innerHTML = map[state] || map.checking;
}

// Firebase 모듈 로드 자체가 실패하면 firebaseError 이벤트가 옴
window.addEventListener('firebaseError', () => {
  setFirebaseStatus('error', window.firebaseInitError);
});

// ============================================
// 앱 시작
// ============================================
// Firebase 로드 완료 전에 stale 로컬 데이터로 화면을 그리면,
// 사용자가 빈 화면을 보거나(다른 기기에서 추가한 담당자가 안 보임)
// 그 상태에서 액션을 트리거해 클라우드를 덮어쓰는 사고가 날 수 있음.
// → 첫 렌더는 반드시 Firebase 로드 시도 이후로 미룸.
//   단, 오프라인/Firebase 장애 대비 3초 타임아웃 후엔 로컬 데이터로 진행.
async function initApp() {
  loadData();
  showInitLoadingScreen();
  setFirebaseStatus('checking');

  const firebaseUp = await waitForFirebaseReady(5000);
  if (!firebaseUp) {
    setFirebaseStatus('offline');
  } else {
    setFirebaseStatus('syncing');
    await syncWithFirebase();
    // syncWithFirebase 안에서 성공 시 'connected'로 갱신됨
  }

  switchTab('release');  // 첫 화면: 반출 (로딩 스피너 위에 덮어 그림)
  updateHeaderStats();

  // 주간 자동 백업 시도 (백그라운드, 실패해도 앱 동작 영향 없음)
  // 같은 주에 이미 발송했으면 자동으로 건너뜀
  if (typeof tryWeeklyBackup === 'function') {
    setTimeout(tryWeeklyBackup, 2000);  // 첫 렌더 안정화 후 시도
  }
}

// Firebase 준비 대기. 타임아웃 시 false 리턴.
function waitForFirebaseReady(timeoutMs) {
  return new Promise((resolve) => {
    if (window.firebaseReady) { resolve(true); return; }
    if (window.firebaseInitError) { resolve(false); return; }
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    const timer = setTimeout(() => {
      console.warn('⚠️ Firebase 준비 타임아웃 - 로컬 데이터로 진행');
      finish(false);
    }, timeoutMs);
    window.addEventListener('firebaseReady', () => {
      clearTimeout(timer);
      finish(true);
    }, { once: true });
    window.addEventListener('firebaseError', () => {
      clearTimeout(timer);
      finish(false);
    }, { once: true });
  });
}

function showInitLoadingScreen() {
  const el = document.getElementById('page-content');
  if (!el) return;
  el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">' +
    '<div class="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>' +
    '<p class="text-sm font-medium">데이터 동기화 중...</p>' +
    '</div>';
}

// ============================================
// Firebase 초기 동기화
// ============================================
// - 클라우드에 데이터가 있으면 그것을 가져옴 (다른 기기/브라우저에서 동기화)
// - 클라우드가 비어있으면 현재 로컬 데이터를 클라우드로 업로드 (최초 마이그레이션)
// - 이후 setupFirebaseSync로 실시간 변경 구독
async function syncWithFirebase() {
  const result = await loadFromFirebase();
  if (result.loaded) {
    updateHeaderStats();
    const renderFn = window['render' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1)];
    if (typeof renderFn === 'function') renderFn();

    // 자가 복원: 클라우드의 teams 또는 teamMembers가 비어있는데 로컬에 있으면,
    // 로컬 데이터를 클라우드에 다시 푸시해서 복구.
    // (이전에 다른 기기가 빈 데이터로 클라우드를 wipe한 사고 자동 복구)
    if (result.cloudIncomplete) {
      const localHasTeams = Array.isArray(teams) && teams.length > 0;
      const localHasMembers = teamMembers && Object.keys(teamMembers).length > 0;
      if (localHasTeams || localHasMembers) {
        console.log('🔄 자가 복원: 로컬 데이터를 클라우드에 다시 푸시');
        saveToFirebase();
      }
    }
  } else {
    console.log('Firebase가 비어있음 - 현재 데이터를 클라우드에 업로드');
    saveToFirebase();
  }
  setupFirebaseSync();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
