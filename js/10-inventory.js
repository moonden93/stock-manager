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
let invPage = 1;
const INV_PER_PAGE = 50;

function renderInventory() {
  const out = inventory.filter(i => i.stock === 0).length;
  const low = inventory.filter(i => i.stock > 0 && i.stock <= i.minStock).length;
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  
  let filtered = inventory;
  if (invFilter === 'out') filtered = filtered.filter(i => i.stock === 0);
  if (invFilter === 'low') filtered = filtered.filter(i => i.stock > 0 && i.stock <= i.minStock);
  if (invFilter === 'normal') filtered = filtered.filter(i => i.stock > i.minStock);
  if (invVendorFilter) filtered = filtered.filter(i => i.vendor === invVendorFilter);
  if (invSearchTerm) {
    const t = invSearchTerm.toLowerCase();
    filtered = filtered.filter(i => i.name.toLowerCase().includes(t) || i.vendor.toLowerCase().includes(t));
  }
  
  const totalPages = Math.max(1, Math.ceil(filtered.length / INV_PER_PAGE));
  if (invPage > totalPages) invPage = 1;
  const pageStart = (invPage - 1) * INV_PER_PAGE;
  const paged = filtered.slice(pageStart, pageStart + INV_PER_PAGE);
  
  let html = '<div class="space-y-4">' +
    '<div class="grid grid-cols-3 gap-2">' +
    '<button onclick="invFilter = \'all\'; invPage = 1; renderInventory();" class="bg-white rounded-xl p-3 border-2 ' + 
    (invFilter === 'all' ? 'border-slate-700' : 'border-slate-200') + '">' +
    '<p class="text-xs text-slate-500">전체</p><p class="text-2xl font-bold text-slate-900">' + inventory.length + '</p></button>' +
    '<button onclick="invFilter = \'low\'; invPage = 1; renderInventory();" class="bg-white rounded-xl p-3 border-2 ' +
    (invFilter === 'low' ? 'border-amber-500' : 'border-slate-200') + '">' +
    '<p class="text-xs text-slate-500">🟡 부족</p><p class="text-2xl font-bold text-amber-600">' + low + '</p></button>' +
    '<button onclick="invFilter = \'out\'; invPage = 1; renderInventory();" class="bg-white rounded-xl p-3 border-2 ' +
    (invFilter === 'out' ? 'border-red-500' : 'border-slate-200') + '">' +
    '<p class="text-xs text-slate-500">🔴 품절</p><p class="text-2xl font-bold text-red-600">' + out + '</p></button>' +
    '</div>' +
    
    '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
    '<div class="px-3 pt-3">' +
    '<input type="text" value="' + escapeHtml(invSearchTerm) + '" oninput="invSearchTerm = this.value; invPage = 1; renderInventory();" ' +
    'placeholder="🔍 검색..." class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-orange-500" /></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><div class="flex flex-wrap gap-1">' +
    '<button onclick="invVendorFilter = \'\'; invPage = 1; renderInventory();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!invVendorFilter ? 'bg-orange-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체 업체</button>';
  vendors.forEach(v => {
    html += '<button onclick="invVendorFilter = \'' + escapeJs(v) + '\'; invPage = 1; renderInventory();" class="px-3 py-1.5 text-sm rounded-full ' +
      (invVendorFilter === v ? 'bg-orange-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div></div>' +
    '<div class="px-4 py-2 bg-slate-50 text-xs text-slate-600 flex items-center justify-between">' +
    '<span><strong>' + filtered.length + '</strong>개 · 클릭해서 수정</span>';
  if (totalPages > 1) {
    html += '<span class="text-slate-500">페이지 ' + invPage + ' / ' + totalPages + '</span>';
  }
  html += '</div>' +
    '<div class="divide-y divide-slate-100">';
  
  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">결과 없음</div>';
  } else {
    paged.forEach(item => {
      const status = item.stock === 0 ? 'out' : item.stock <= item.minStock ? 'low' : 'normal';
      const colors = { out: 'bg-red-50', low: 'bg-amber-50/50', normal: '' };
      const icons = { out: '🔴', low: '🟡', normal: '🟢' };
      const stockColor = status === 'out' ? 'text-red-600' : status === 'low' ? 'text-amber-600' : 'text-slate-700';
      
      html += '<button onclick="openEditDialog(\'' + item.id + '\')" class="w-full text-left px-4 py-3 hover:bg-slate-100 ' + colors[status] + '">' +
        '<div class="flex items-center gap-3">' +
        '<span class="text-xl flex-shrink-0">' + icons[status] + '</span>' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + '</p>' +
        '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
        '<p class="text-xs text-slate-500 mt-0.5">기준: ' + item.minStock + escapeHtml(item.unit) + 
        (item.price ? ' · ' + item.price.toLocaleString() + '원' : '') + '</p></div>' +
        '<div class="text-right flex-shrink-0">' +
        '<p class="text-2xl font-bold ' + stockColor + '">' + item.stock + '</p>' +
        '<p class="text-xs text-slate-500">' + escapeHtml(item.unit) + '</p></div>' +
        '</div></button>';
    });
  }
  
  html += '</div>';
  
  // 페이지 네비게이션
  if (totalPages > 1) {
    html += '<div class="px-3 py-3 bg-slate-50 border-t flex items-center justify-center gap-1">';
    html += '<button onclick="invPage = 1; renderInventory();" ' + (invPage === 1 ? 'disabled' : '') + ' class="w-8 h-8 text-sm bg-white border border-slate-200 rounded disabled:opacity-30">«</button>';
    html += '<button onclick="invPage = Math.max(1, invPage - 1); renderInventory();" ' + (invPage === 1 ? 'disabled' : '') + ' class="w-8 h-8 text-sm bg-white border border-slate-200 rounded disabled:opacity-30">‹</button>';
    
    const startPage = Math.max(1, invPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    for (let p = startPage; p <= endPage; p++) {
      html += '<button onclick="invPage = ' + p + '; renderInventory();" class="min-w-[32px] h-8 px-2 text-sm rounded font-medium ' +
        (p === invPage ? 'bg-orange-600 text-white' : 'bg-white border border-slate-200 text-slate-700') + '">' + p + '</button>';
    }
    
    html += '<button onclick="invPage = Math.min(' + totalPages + ', invPage + 1); renderInventory();" ' + (invPage >= totalPages ? 'disabled' : '') + ' class="w-8 h-8 text-sm bg-white border border-slate-200 rounded disabled:opacity-30">›</button>';
    html += '<button onclick="invPage = ' + totalPages + '; renderInventory();" ' + (invPage >= totalPages ? 'disabled' : '') + ' class="w-8 h-8 text-sm bg-white border border-slate-200 rounded disabled:opacity-30">»</button>';
    html += '</div>';
  }
  
  html += '</div></div>';
  document.getElementById('page-content').innerHTML = html;
}

function openEditDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  
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
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveEditStock(\'' + item.id + '\')" class="flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  setTimeout(() => document.getElementById('edit-stock').focus(), 100);
}

function saveEditStock(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const newStock = parseInt(document.getElementById('edit-stock').value);
  const newMin = parseInt(document.getElementById('edit-min').value);
  if (isNaN(newStock) || isNaN(newMin)) { showToast('숫자 입력 필요', 'error'); return; }
  item.stock = newStock;
  item.minStock = newMin;
  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('수정 완료');
  renderInventory();
}

