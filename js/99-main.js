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
  // 설정·문서함 탭은 비밀번호 입력 필요 (매번, 틀리면 재입력)
  if (name === 'settings' || name === 'documents') {
    const label = name === 'settings' ? '설정 화면' : '문서함';
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
  const total = inventory.length;
  const out = inventory.filter(i => i.stock === 0).length;
  const low = inventory.filter(i => i.stock > 0 && i.stock <= i.minStock).length;
  const pending = requests.filter(r => r.status === 'pending').length;
  let html = '품목 <strong>' + total + '</strong>개';
  if (out > 0) html += ' · <span class="text-red-600 font-medium">품절 ' + out + '</span>';
  if (low > 0) html += ' · <span class="text-amber-600 font-medium">부족 ' + low + '</span>';
  if (pending > 0) html += ' · <span class="text-blue-600 font-medium">대기 ' + pending + '</span>';
  const el = document.getElementById('header-stats');
  if (el) el.innerHTML = html;
}

// ============================================
// 앱 시작
// ============================================
function initApp() {
  loadData();
  renderRelease();  // 첫 화면: 반출
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
