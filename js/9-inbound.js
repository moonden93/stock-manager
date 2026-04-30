// ============================================
// 9-inbound.js: 입고 화면
// ============================================
// 의존: 4-utils.js (escapeHtml, escapeJs)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('inbound')

let inboundSearchTerm = '';
let inboundSelectedVendor = '';

function getInboundFilteredItems() {
  return inventory.filter(i => {
    if (inboundSelectedVendor && i.vendor !== inboundSelectedVendor) return false;
    if (inboundSearchTerm) {
      if (!matchesSearch(i.name, inboundSearchTerm) && !matchesSearch(i.vendor, inboundSearchTerm)) return false;
    }
    return true;
  });
}

function _inboundItemRowHtml(item) {
  return '<div class="px-4 py-3 hover:bg-slate-50"><div class="flex items-center gap-3">' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-xs text-slate-500 mt-0.5">현재 재고: <strong>' + item.stock + '</strong></p></div>' +
    '<button onclick="openInboundDialog(\'' + item.id + '\')" class="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-base font-bold">입고</button>' +
    '</div></div>';
}

// 검색 결과 목록만 부분 갱신 (검색 input destroy 안 함 → IME 안전)
function renderInboundItems() {
  const filtered = getInboundFilteredItems();
  const listEl = document.getElementById('inbound-items-list');
  if (!listEl) return;
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    let html = '';
    filtered.forEach(item => { html += _inboundItemRowHtml(item); });
    listEl.innerHTML = html;
  }
}

function renderInbound() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  const filtered = getInboundFilteredItems();

  let html = '<div class="space-y-4">' +
    '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">📥 입고 등록</h2>' +
    '<p class="text-sm text-slate-600">새로 들어온 재료의 입고 수량을 등록합니다</p></div>' +
    '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<div class="sticky top-[232px] sm:top-[156px] z-30 bg-white px-3 pt-3 pb-3 shadow-sm">' +
    '<input type="text" value="' + escapeHtml(inboundSearchTerm) + '" ' +
    'oninput="inboundSearchTerm = this.value; renderInboundItems();" ' +
    'placeholder="🔍 품목 검색" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" /></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><p class="text-xs text-slate-500 mb-2">업체:</p>' +
    '<div class="flex flex-wrap gap-1">' +
    '<button onclick="inboundSelectedVendor = \'\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!inboundSelectedVendor ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
  vendors.forEach(v => {
    html += '<button onclick="inboundSelectedVendor = \'' + escapeJs(v) + '\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
      (inboundSelectedVendor === v ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div></div><div id="inbound-items-list" class="divide-y divide-slate-100">';

  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    filtered.forEach(item => { html += _inboundItemRowHtml(item); });
  }

  html += '</div></div></div>';
  document.getElementById('page-content').innerHTML = html;
}

function openInboundDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;

  // 오늘 날짜 (로컬 기준, YYYY-MM-DD)
  const now = new Date();
  const todayStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-emerald-50 border-b border-emerald-200">' +
    '<h3 class="text-base font-bold text-slate-900">📥 입고 수량 입력</h3></div>' +
    '<div class="px-5 py-5 overflow-y-auto">' +
    '<p class="text-xs text-slate-500 mb-1">' + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-base font-bold text-slate-900 mb-1">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-sm text-slate-500 mb-5">현재 재고: <strong>' + item.stock + '</strong></p>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">입고 수량</label>' +
    '<div class="flex items-center gap-2 mb-4">' +
    '<button onclick="adjustQty(-1)" class="w-12 h-14 bg-slate-200 hover:bg-slate-300 rounded-xl text-2xl font-bold">−</button>' +
    '<input type="number" id="inbound-qty" value="1" min="1" class="flex-1 h-14 text-center text-2xl font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
    '<button onclick="adjustQty(1)" class="w-12 h-14 bg-slate-200 hover:bg-slate-300 rounded-xl text-2xl font-bold">+</button>' +
    '</div>' +
    '<p class="text-xs text-slate-500 mb-4">입고 후: <span id="after-stock" class="font-bold text-emerald-700">' + (item.stock + 1) + '</span></p>' +

    // 입고 일자
    '<div class="mb-2">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📅 입고 일자</label>' +
    '<input type="date" id="inbound-date" value="' + todayStr + '" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" />' +
    '</div>' +

    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmInbound(\'' + item.id + '\')" class="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">✅ 입고 등록</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;

  const input = document.getElementById('inbound-qty');
  const after = document.getElementById('after-stock');
  input.addEventListener('input', function() {
    after.textContent = item.stock + (parseInt(this.value) || 0);
  });
  setTimeout(() => input.focus(), 100);
}

function adjustQty(delta) {
  const input = document.getElementById('inbound-qty');
  if (!input) return;
  input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
  input.dispatchEvent(new Event('input'));
}

function confirmInbound(itemId) {
  const item = inventory.find(i => i.id === itemId);
  const qty = parseInt(document.getElementById('inbound-qty').value) || 0;
  if (qty < 1) {
    showAlert('수량을 입력해주세요', '입고 수량은 1 이상이어야 합니다.\n\n+ / − 버튼으로 조정하거나\n숫자를 직접 입력하세요.');
    setTimeout(() => { const el = document.getElementById('inbound-qty'); if (el) { el.focus(); el.select(); } }, 50);
    return;
  }

  // 입고 일자 (사용자 입력값, 빈 값이면 오늘)
  const dateInput = document.getElementById('inbound-date');
  const dateStr = dateInput && dateInput.value;
  const inboundDate = dateStr
    ? new Date(dateStr + 'T00:00:00.000Z').toISOString()
    : new Date().toISOString();

  item.stock += qty;
  history.push({
    id: 'H' + Date.now() + '_' + itemId,
    type: 'in',
    date: inboundDate,
    itemId, vendor: item.vendor, name: item.name, qty, unit: item.unit
  });

  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('입고 완료! ' + item.name + ' +' + qty, 'success');
  renderInbound();
}
