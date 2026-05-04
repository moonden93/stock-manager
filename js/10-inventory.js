// ============================================
// 10-inventory.js: 재고 현황 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('inventory')

// 화면 4: 재고 현황
// ============================================================
let invSearchTerm = '';
let invFilter = 'all';
let invVendorFilter = '';
let invShowHidden = false;  // 숨김 항목 보기 토글 (OFF = 안 보임, ON = 흐리게 보임)

function getInventoryFilteredItems() {
  let filtered = inventory;
  // 숨김 처리: 토글 OFF면 제외
  if (!invShowHidden) filtered = filtered.filter(i => !i.hidden);
  if (invFilter === 'out') filtered = filtered.filter(i => i.stock === 0);
  if (invFilter === 'low') filtered = filtered.filter(i => i.stock > 0 && i.stock <= i.minStock);
  if (invFilter === 'normal') filtered = filtered.filter(i => i.stock > i.minStock);
  if (invVendorFilter) filtered = filtered.filter(i => i.vendor === invVendorFilter);
  if (invSearchTerm) {
    filtered = filtered.filter(i => matchesSearch(i.name, invSearchTerm) || matchesSearch(i.vendor, invSearchTerm));
  }
  return filtered;
}

function _inventoryItemRowHtml(item) {
  const status = item.stock === 0 ? 'out' : item.stock <= item.minStock ? 'low' : 'normal';
  const colors = { out: 'bg-red-50', low: 'bg-amber-50/50', normal: '' };
  const icons = { out: '🔴', low: '🟡', normal: '🟢' };
  const stockColor = status === 'out' ? 'text-red-600' : status === 'low' ? 'text-amber-600' : 'text-slate-700';
  const hiddenClass = item.hidden ? ' opacity-40' : '';
  const hiddenBadge = item.hidden ? '<span class="ml-2 text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">숨김</span>' : '';
  return '<button onclick="openEditDialog(\'' + item.id + '\')" class="w-full text-left px-4 py-3 hover:bg-slate-100 ' + colors[status] + hiddenClass + '">' +
    '<div class="flex items-center gap-3">' +
    '<span class="text-xl flex-shrink-0">' + icons[status] + '</span>' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + hiddenBadge + '</p>' +
    '<p class="text-xs text-slate-500 mt-0.5">기준: ' + item.minStock +
    (item.price ? ' · ' + item.price.toLocaleString() + '원' : '') + '</p></div>' +
    '<div class="text-right flex-shrink-0">' +
    '<p class="text-2xl font-bold ' + stockColor + '">' + item.stock + '</p></div>' +
    '</div></button>';
}

// 검색 결과 목록 + 카운트만 부분 갱신 (검색 input destroy 안 함 → IME 안전)
function renderInventoryItems() {
  const filtered = getInventoryFilteredItems();
  const countEl = document.getElementById('inventory-items-count');
  if (countEl) countEl.innerHTML = '<strong>' + filtered.length + '</strong>개 · 클릭해서 수정';
  const listEl = document.getElementById('inventory-items-list');
  if (!listEl) return;
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="py-12 text-center text-slate-400">결과 없음</div>';
  } else {
    let html = '';
    filtered.forEach(item => { html += _inventoryItemRowHtml(item); });
    listEl.innerHTML = html;
  }
}

function renderInventory() {
  // KPI는 숨김 항목 제외 — 사용자가 행동해야 할 진짜 부족/품절만 카운트
  const visibleInv = inventory.filter(i => !i.hidden);
  const out = visibleInv.filter(i => i.stock === 0).length;
  const low = visibleInv.filter(i => i.stock > 0 && i.stock <= i.minStock).length;
  const hiddenCount = inventory.length - visibleInv.length;
  const vendors = [...new Set(visibleInv.map(i => i.vendor))].sort();
  const filtered = getInventoryFilteredItems();

  let html = '<div class="space-y-4">' +
    '<div class="grid grid-cols-3 gap-2">' +
    '<button onclick="invFilter = \'all\'; renderInventory();" class="bg-white rounded-xl p-3 border-2 ' +
    (invFilter === 'all' ? 'border-slate-700' : 'border-slate-200') + '">' +
    '<p class="text-xs text-slate-500">전체</p><p class="text-2xl font-bold text-slate-900">' + visibleInv.length + '</p></button>' +
    '<button onclick="invFilter = \'low\'; renderInventory();" class="bg-white rounded-xl p-3 border-2 ' +
    (invFilter === 'low' ? 'border-amber-500' : 'border-slate-200') + '">' +
    '<p class="text-xs text-slate-500">🟡 부족</p><p class="text-2xl font-bold text-amber-600">' + low + '</p></button>' +
    '<button onclick="invFilter = \'out\'; renderInventory();" class="bg-white rounded-xl p-3 border-2 ' +
    (invFilter === 'out' ? 'border-red-500' : 'border-slate-200') + '">' +
    '<p class="text-xs text-slate-500">🔴 품절</p><p class="text-2xl font-bold text-red-600">' + out + '</p></button>' +
    '</div>' +

    '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<div class="sticky top-[232px] sm:top-[156px] z-30 bg-white px-3 pt-3 pb-3 shadow-sm">' +
    '<div class="flex items-center gap-2">' +
    '<input type="text" value="' + escapeHtml(invSearchTerm) + '" ' +
    'oninput="invSearchTerm = this.value; renderInventoryItems();" ' +
    'placeholder="🔍 검색" class="flex-1 px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-orange-500" />' +
    (hiddenCount > 0
      ? '<button onclick="invShowHidden = !invShowHidden; renderInventory();" class="px-3 py-3 text-sm rounded-xl border-2 ' +
        (invShowHidden ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200') + '" title="숨김 항목 보기 토글">' +
        (invShowHidden ? '👁️ 숨김 ' + hiddenCount : '🙈 숨김 ' + hiddenCount) + '</button>'
      : '') +
    '</div></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><div class="flex flex-wrap gap-1">' +
    '<button onclick="invVendorFilter = \'\'; renderInventory();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!invVendorFilter ? 'bg-orange-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체 업체</button>';
  vendors.forEach(v => {
    html += '<button onclick="invVendorFilter = \'' + escapeJs(v) + '\'; renderInventory();" class="px-3 py-1.5 text-sm rounded-full ' +
      (invVendorFilter === v ? 'bg-orange-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div></div>' +
    '<div id="inventory-items-count" class="px-4 py-2 bg-slate-50 text-xs text-slate-600">' +
    '<strong>' + filtered.length + '</strong>개 · 클릭해서 수정' +
    '</div>' +
    '<div id="inventory-items-list" class="divide-y divide-slate-100">';

  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">결과 없음</div>';
  } else {
    filtered.forEach(item => { html += _inventoryItemRowHtml(item); });
  }

  html += '</div></div></div>';
  document.getElementById('page-content').innerHTML = html;
}

function openEditDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;

  const hideBtnLabel = item.hidden ? '👁️ 다시 보이기 (재고 탭)' : '🙈 재고 탭에서 숨기기';
  const hideBtnHint = item.hidden
    ? '재고 탭에서 다시 보입니다.'
    : '안 쓰는 품목 정리용. 요청/입고/통계엔 그대로 보입니다.';

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-orange-50 border-b border-orange-200">' +
    '<h3 class="text-base font-bold text-slate-900">📦 재고 수정</h3></div>' +
    '<div class="px-5 py-5 space-y-4">' +
    '<div><p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-base font-bold text-slate-900">' + escapeHtml(item.name) + '</p></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-2 block">현재 재고 (' + escapeHtml(item.unit) + ')</label>' +
    '<input type="number" id="edit-stock" value="' + item.stock + '" class="w-full px-4 py-3 text-xl font-bold text-center bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-orange-500" onfocus="this.select()" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-2 block">기준 재고 (이 수량 이하시 알람)</label>' +
    '<input type="number" id="edit-min" value="' + item.minStock + '" min="0" class="w-full px-4 py-3 text-xl font-bold text-center bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-orange-500" onfocus="this.select()" /></div>' +
    '<div class="pt-2 border-t border-slate-100">' +
    '<button onclick="toggleItemHidden(\'' + item.id + '\')" class="w-full py-2.5 text-sm font-medium rounded-lg border ' +
    (item.hidden ? 'border-slate-300 bg-slate-50 text-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50') + '">' +
    hideBtnLabel + '</button>' +
    '<p class="text-xs text-slate-500 mt-1.5 text-center">' + hideBtnHint + '</p>' +
    '</div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveEditStock(\'' + item.id + '\')" class="flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  setTimeout(() => document.getElementById('edit-stock').focus(), 100);
}

function toggleItemHidden(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  item.hidden = !item.hidden;
  saveAll();
  updateHeaderStats();
  closeModal();
  showToast(item.hidden ? '재고 탭에서 숨겼습니다' : '다시 보이게 했습니다');
  renderInventory();
}

function saveEditStock(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const newStock = parseInt(document.getElementById('edit-stock').value);
  const newMin = parseInt(document.getElementById('edit-min').value);
  if (isNaN(newStock) || isNaN(newMin)) {
    showAlert('숫자만 입력 가능합니다', '재고 수량과 기준 재고는\n숫자로만 입력해주세요.\n\n빈 값이나 글자는 저장할 수 없습니다.');
    return;
  }
  item.stock = newStock;
  item.minStock = newMin;
  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('수정 완료');
  renderInventory();
}

