// ============================================
// 7-release.js: 반출 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('release')

let releaseSelectedTeam = '';
let releaseSelectedRequester = '';
let releaseSelectedVendor = '';
let releaseSearchTerm = '';

function renderRelease() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  const teamRecommendedMembers = (releaseSelectedTeam && teamMembers[releaseSelectedTeam]) || [];
  
  const filtered = inventory.filter(i => {
    if (releaseSelectedVendor && i.vendor !== releaseSelectedVendor) return false;
    if (releaseSearchTerm) {
      const t = releaseSearchTerm.toLowerCase();
      if (!i.name.toLowerCase().includes(t) && !i.vendor.toLowerCase().includes(t)) return false;
    }
    return true;
  });
  
  let html = '<div class="space-y-4">' +
    // Step 1: 팀 선택
    '<div class="bg-white rounded-2xl border-2 ' + (releaseSelectedTeam ? 'border-emerald-300' : 'border-teal-400') + ' shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 ' + (releaseSelectedTeam ? 'bg-emerald-50' : 'bg-teal-50') + ' flex items-center gap-2">' +
    '<span class="w-7 h-7 ' + (releaseSelectedTeam ? 'bg-emerald-500' : 'bg-teal-500') + ' text-white rounded-full flex items-center justify-center font-bold">' + (releaseSelectedTeam ? '✓' : '1') + '</span>' +
    '<h3 class="font-bold text-slate-900">팀 선택</h3>' +
    (releaseSelectedTeam ? '<span class="ml-auto text-sm text-emerald-700 font-bold">' + escapeHtml(releaseSelectedTeam) + '</span>' : '') +
    '</div><div class="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">';
  
  teams.forEach(team => {
    const isSelected = releaseSelectedTeam === team;
    html += '<button onclick="selectReleaseTeam(\'' + escapeJs(team) + '\')" class="py-3 px-2 rounded-lg font-bold text-sm transition ' + 
      (isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200') + '">' + 
      escapeHtml(team) + '</button>';
  });
  html += '</div></div>';
  
  // Step 2: 담당자
  html += '<div class="bg-white rounded-2xl border-2 ' + (releaseSelectedRequester ? 'border-emerald-300' : 'border-slate-200') + ' shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 ' + (releaseSelectedRequester ? 'bg-emerald-50' : 'bg-slate-50') + ' flex items-center gap-2">' +
    '<span class="w-7 h-7 ' + (releaseSelectedRequester ? 'bg-emerald-500' : 'bg-slate-400') + ' text-white rounded-full flex items-center justify-center font-bold">' + (releaseSelectedRequester ? '✓' : '2') + '</span>' +
    '<h3 class="font-bold text-slate-900">요청 담당자</h3></div>' +
    '<div class="p-3 space-y-3">';
  
  // 팀별 등록된 담당자가 있으면 빠른 선택 버튼
  if (teamRecommendedMembers.length > 0) {
    html += '<div>' +
      '<p class="text-xs text-slate-500 mb-2">' + escapeHtml(releaseSelectedTeam) + ' 담당자 빠른 선택:</p>' +
      '<div class="flex flex-wrap gap-2">';
    teamRecommendedMembers.forEach((m, idx) => {
      const isSelected = releaseSelectedRequester === m;
      html += '<button onclick="selectReleaseRequester(\'' + escapeJs(m) + '\')" class="px-4 py-2 rounded-xl text-sm font-bold transition ' +
        (isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200') + '">' +
        (idx === 0 ? '⭐ ' : '') + escapeHtml(m) + '</button>';
    });
    html += '</div></div>';
  } else if (releaseSelectedTeam) {
    html += '<div class="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">' +
      '💡 ' + escapeHtml(releaseSelectedTeam) + ' 팀에 등록된 담당자가 없습니다. 설정에서 추가하거나 직접 입력하세요.' +
      '</div>';
  }
  
  html += '<div>' +
    '<p class="text-xs text-slate-500 mb-1">또는 직접 입력:</p>' +
    '<input type="text" id="requester-input" value="' + escapeHtml(releaseSelectedRequester) + '" ' +
    'oninput="releaseSelectedRequester = this.value; updateCartBar();" ' +
    'placeholder="담당자 이름" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div></div></div>';
  
  // Step 3: 품목
  html += '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 bg-slate-50 flex items-center gap-2">' +
    '<span class="w-7 h-7 bg-slate-400 text-white rounded-full flex items-center justify-center font-bold">3</span>' +
    '<h3 class="font-bold text-slate-900">품목 선택</h3>' +
    '<span class="ml-auto text-xs text-slate-500">' + filtered.length + '개</span></div>' +
    '<div class="px-3 pt-3">' +
    '<input type="text" value="' + escapeHtml(releaseSearchTerm) + '" oninput="releaseSearchTerm = this.value; renderRelease();" ' +
    'placeholder="🔍 품목명 검색..." class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><p class="text-xs text-slate-500 mb-2">업체:</p>' +
    '<div class="flex flex-wrap gap-1">' +
    '<button onclick="releaseSelectedVendor = \'\'; renderRelease();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!releaseSelectedVendor ? 'bg-teal-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
  
  vendors.forEach(v => {
    html += '<button onclick="releaseSelectedVendor = \'' + escapeJs(v) + '\'; renderRelease();" class="px-3 py-1.5 text-sm rounded-full ' +
      (releaseSelectedVendor === v ? 'bg-teal-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div></div>' +
    '<div class="max-h-[500px] overflow-y-auto divide-y divide-slate-100">';
  
  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    filtered.slice(0, 100).forEach(item => {
      const inCart = cart.find(c => c.itemId === item.id);
      const cartQty = inCart ? inCart.qty : 0;
      const stockColor = item.stock === 0 ? 'text-red-600' : item.stock <= item.minStock ? 'text-amber-600' : 'text-slate-700';
      const insufficient = cartQty > item.stock;
      
      html += '<div class="px-4 py-3 hover:bg-slate-50 ' + (insufficient ? 'bg-amber-50' : '') + '">' +
        '<div class="flex items-center gap-3">' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + '</p>' +
        '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
        '<p class="text-xs ' + stockColor + ' mt-0.5">재고 <strong>' + item.stock + '</strong>' + escapeHtml(item.unit) +
        (item.stock === 0 ? ' · 🔴 품절' : item.stock <= item.minStock ? ' · 🟡 부족' : '') + '</p></div>' +
        '<div class="flex items-center gap-2">';
      
      if (cartQty > 0) {
        html += '<button onclick="changeCartQty(\'' + item.id + '\', -1)" class="w-10 h-10 bg-slate-200 hover:bg-slate-300 rounded-lg text-xl font-bold">−</button>' +
          '<span class="text-xl font-bold text-teal-700 min-w-[32px] text-center">' + cartQty + '</span>' +
          '<button onclick="changeCartQty(\'' + item.id + '\', 1)" class="w-10 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xl font-bold">+</button>';
      } else {
        html += '<button onclick="addToCart(\'' + item.id + '\')" class="px-4 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-base font-bold">+ 담기</button>';
      }
      html += '</div></div>' +
        (insufficient ? '<p class="text-xs text-amber-700 mt-1">⚠️ 재고보다 많이 담음</p>' : '') +
        '</div>';
    });
    if (filtered.length > 100) {
      html += '<div class="py-3 text-center text-xs text-slate-400 bg-slate-50">상위 100개 표시 (전체 ' + filtered.length + '개) · 검색으로 좁혀보세요</div>';
    }
  }
  
  html += '</div></div></div>';
  
  document.getElementById('page-content').innerHTML = html;
  renderCartBar();
}

function selectReleaseTeam(team) {
  releaseSelectedTeam = team;
  // 팀에 등록된 첫 담당자 자동 선택
  if (teamMembers[team] && teamMembers[team].length > 0) {
    releaseSelectedRequester = teamMembers[team][0];
  }
  renderRelease();
}

function selectReleaseRequester(name) {
  releaseSelectedRequester = name;
  renderRelease();
}

function addToCart(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  cart.push({ itemId, qty: 1, vendor: item.vendor, name: item.name, unit: item.unit, stock: item.stock });
  renderRelease();
}

function changeCartQty(itemId, delta) {
  const idx = cart.findIndex(c => c.itemId === itemId);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderRelease();
}

function removeFromCart(itemId) {
  cart = cart.filter(c => c.itemId !== itemId);
  renderRelease();
}

function renderCartBar() {
  let cartBar = document.getElementById('cart-bar');
  if (cart.length === 0 || currentTab !== 'release') {
    if (cartBar) cartBar.remove();
    return;
  }
  
  if (!cartBar) {
    cartBar = document.createElement('div');
    cartBar.id = 'cart-bar';
    document.body.appendChild(cartBar);
  }
  
  const totalQty = cart.reduce((s, c) => s + c.qty, 0);
  const canSubmit = releaseSelectedTeam && releaseSelectedRequester && releaseSelectedRequester.trim();
  
  cartBar.className = 'fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-teal-500 shadow-2xl';
  let inner = '<div class="max-w-6xl mx-auto p-3">' +
    '<div class="flex items-center gap-2 mb-2 overflow-x-auto pb-1">';
  cart.forEach(c => {
    inner += '<div class="flex-shrink-0 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-full text-xs flex items-center gap-1.5">' +
      '<span class="font-medium">' + escapeHtml(c.name) + '</span>' +
      '<span class="font-bold text-teal-700">' + c.qty + escapeHtml(c.unit) + '</span>' +
      '<button onclick="removeFromCart(\'' + c.itemId + '\')" class="text-slate-400 hover:text-red-500 ml-1">×</button>' +
      '</div>';
  });
  inner += '</div>' +
    '<div class="flex items-center gap-3">' +
    '<div class="flex-1"><p class="text-xs text-slate-500">담은 품목 ' + cart.length + '종 · 총 ' + totalQty + '개</p>' +
    (!canSubmit ? '<p class="text-xs text-amber-600 font-medium">⚠️ ' + (!releaseSelectedTeam ? '팀 선택' : '담당자 입력') + ' 필요</p>' : '') + '</div>' +
    '<button onclick="cart = []; renderRelease();" class="px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmRelease()" ' + (!canSubmit ? 'disabled' : '') + ' class="big-btn flex-1 max-w-[240px] ' +
    (canSubmit ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed') + '">' +
    '📋 반출 요청 (' + totalQty + '개)</button>' +
    '</div></div>';
  cartBar.innerHTML = inner;
}

function updateCartBar() {
  renderCartBar();
}

function confirmRelease() {
  if (!releaseSelectedTeam || !releaseSelectedRequester || cart.length === 0) return;
  
  let message = '[' + releaseSelectedTeam + '] ' + releaseSelectedRequester + '님 반출 요청\n\n';
  message += cart.map(function(c) { return '· ' + c.name + ' ' + c.qty + c.unit; }).join('\n');
  message += '\n\n총 ' + cart.reduce(function(s, c) { return s + c.qty; }, 0) + '개를 요청하시겠습니까?';
  message += '\n\n💡 실제 반출(재고 차감)은 [요청관리]에서 "반출 완료" 버튼을 눌러야 처리됩니다.';
  
  askConfirm('반출 요청 등록', message, function() {
    const reqId = 'R' + Date.now();
    const reqDate = new Date().toISOString();
    
    // 요청만 등록 (재고 차감/이력 기록 안 함)
    cart.forEach(c => {
      requests.push({
        id: reqId + '_' + c.itemId,
        requestId: reqId,
        status: 'pending',
        date: reqDate,
        itemId: c.itemId,
        vendor: c.vendor,
        name: c.name,
        qty: c.qty,
        unit: c.unit,
        team: releaseSelectedTeam,
        requester: releaseSelectedRequester
      });
    });
    
    saveAll();
    updateHeaderStats();
    const totalQty = cart.reduce((s, c) => s + c.qty, 0);
    showToast('반출 요청 등록 완료! ' + cart.length + '종 ' + totalQty + '개 (요청관리에서 처리하세요)', 'success');
    cart = [];
    releaseSearchTerm = '';
    releaseSelectedVendor = '';
    renderRelease();
  }, '예, 요청', 'teal');
}