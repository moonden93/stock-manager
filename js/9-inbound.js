// ============================================
// 9-inbound.js: 입고 화면
// ============================================
// 의존: 6-utils-file.js (readFileAsBase64, getFileIcon, formatFileSize)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('inbound')

let inboundSearchTerm = '';
let inboundSelectedVendor = '';

function renderInbound() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  const filtered = inventory.filter(i => {
    if (inboundSelectedVendor && i.vendor !== inboundSelectedVendor) return false;
    if (inboundSearchTerm) {
      const t = inboundSearchTerm.toLowerCase();
      if (!i.name.toLowerCase().includes(t) && !i.vendor.toLowerCase().includes(t)) return false;
    }
    return true;
  });
  
  let html = '<div class="space-y-4">' +
    '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">📥 입고 등록</h2>' +
    '<p class="text-sm text-slate-600">새로 들어온 재료의 입고 수량을 등록합니다</p></div>' +
    '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<div class="sticky top-[232px] sm:top-[156px] z-30 bg-white px-3 pt-3 pb-3 shadow-sm">' +
    '<input type="text" value="' + escapeHtml(inboundSearchTerm) + '" oninput="inboundSearchTerm = this.value; renderInbound();" ' +
    'placeholder="🔍 품목 검색..." class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" /></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><p class="text-xs text-slate-500 mb-2">업체:</p>' +
    '<div class="flex flex-wrap gap-1">' +
    '<button onclick="inboundSelectedVendor = \'\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!inboundSelectedVendor ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
  vendors.forEach(v => {
    html += '<button onclick="inboundSelectedVendor = \'' + escapeJs(v) + '\'; renderInbound();" class="px-3 py-1.5 text-sm rounded-full ' +
      (inboundSelectedVendor === v ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div></div><div class="max-h-[600px] overflow-y-auto divide-y divide-slate-100">';
  
  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    filtered.slice(0, 100).forEach(item => {
      html += '<div class="px-4 py-3 hover:bg-slate-50"><div class="flex items-center gap-3">' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + '</p>' +
        '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
        '<p class="text-xs text-slate-500 mt-0.5">현재 재고: <strong>' + item.stock + '</strong>' + escapeHtml(item.unit) + '</p></div>' +
        '<button onclick="openInboundDialog(\'' + item.id + '\')" class="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-base font-bold">입고</button>' +
        '</div></div>';
    });
    if (filtered.length > 100) {
      html += '<div class="py-3 text-center text-xs text-slate-400 bg-slate-50">상위 100개 (전체 ' + filtered.length + '개)</div>';
    }
  }
  
  html += '</div></div></div>';
  document.getElementById('page-content').innerHTML = html;
}

function openInboundDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  
  // 첨부 임시 저장소 초기화
  window._pendingAttachments = [];
  
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-emerald-50 border-b border-emerald-200">' +
    '<h3 class="text-base font-bold text-slate-900">📥 입고 수량 입력</h3></div>' +
    '<div class="px-5 py-5 overflow-y-auto">' +
    '<p class="text-xs text-slate-500 mb-1">' + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-base font-bold text-slate-900 mb-1">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-sm text-slate-500 mb-5">현재 재고: <strong>' + item.stock + '</strong>' + escapeHtml(item.unit) + '</p>' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">입고 수량</label>' +
    '<div class="flex items-center gap-2 mb-4">' +
    '<button onclick="adjustQty(-1)" class="w-12 h-14 bg-slate-200 hover:bg-slate-300 rounded-xl text-2xl font-bold">−</button>' +
    '<input type="number" id="inbound-qty" value="1" min="1" class="flex-1 h-14 text-center text-2xl font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" onfocus="this.select()" />' +
    '<button onclick="adjustQty(1)" class="w-12 h-14 bg-slate-200 hover:bg-slate-300 rounded-xl text-2xl font-bold">+</button>' +
    '<span class="text-base font-bold text-slate-700 px-2">' + escapeHtml(item.unit) + '</span></div>' +
    '<p class="text-xs text-slate-500 mb-4">입고 후: <span id="after-stock" class="font-bold text-emerald-700">' + (item.stock + 1) + '</span>' + escapeHtml(item.unit) + '</p>' +
    
    // 첨부 영역
    '<div class="border-t pt-4">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">📎 거래명세서/주문서 첨부 (선택)</label>' +
    '<label class="block w-full px-3 py-4 text-xs text-center text-slate-500 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer transition">' +
    '<div class="text-2xl mb-1">📤</div>' +
    '<p class="font-medium text-slate-600">파일 선택하기</p>' +
    '<p class="text-[10px] text-slate-400 mt-1">PDF · 이미지 · 엑셀 · 워드 (5MB 이하)</p>' +
    '<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc,.txt,.hwp,.hwpx" onchange="handleInboundFiles(event)" class="hidden" />' +
    '</label>' +
    '<div id="inbound-files-list" class="mt-2 space-y-1"></div>' +
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

async function handleInboundFiles(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('"' + file.name + '"은(는) 5MB 초과', 'error');
      continue;
    }
    try {
      const base64 = await readFileAsBase64(file);
      window._pendingAttachments.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64
      });
    } catch (err) {
      showToast('파일 읽기 실패: ' + file.name, 'error');
    }
  }
  e.target.value = '';
  renderInboundFilesList();
}

function renderInboundFilesList() {
  const list = document.getElementById('inbound-files-list');
  if (!list) return;
  const atts = window._pendingAttachments || [];
  if (atts.length === 0) { list.innerHTML = ''; return; }
  let html = '';
  atts.forEach((att, idx) => {
    html += '<div class="flex items-center gap-2 px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">' +
      '<span class="text-base">' + getFileIcon(att.type) + '</span>' +
      '<span class="flex-1 truncate text-slate-700">' + escapeHtml(att.name) + '</span>' +
      '<span class="text-[10px] text-slate-500">' + formatFileSize(att.size) + '</span>' +
      '<button onclick="removeInboundFile(' + idx + ')" class="text-slate-400 hover:text-red-500 px-1">×</button>' +
      '</div>';
  });
  list.innerHTML = html;
}

function removeInboundFile(idx) {
  if (!window._pendingAttachments) return;
  window._pendingAttachments.splice(idx, 1);
  renderInboundFilesList();
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
  if (qty < 1) { showToast('수량 입력 필요', 'error'); return; }
  
  const atts = window._pendingAttachments || [];
  const historyId = 'H' + Date.now() + '_' + itemId;
  
  item.stock += qty;
  history.push({
    id: historyId,
    type: 'in',
    date: new Date().toISOString(),
    itemId, vendor: item.vendor, name: item.name, qty, unit: item.unit,
    hasDocs: atts.length > 0
  });
  
  // 첨부 문서 저장
  if (atts.length > 0) {
    atts.forEach((att, idx) => {
      documents.push({
        id: 'D' + Date.now() + '_' + idx,
        name: att.name,
        type: att.type,
        size: att.size,
        data: att.data,
        uploadDate: new Date().toISOString(),
        vendor: item.vendor,
        itemId: itemId,
        itemName: item.name,
        historyId: historyId,
        category: '입고문서',
        note: ''
      });
    });
  }
  
  saveAll();
  updateHeaderStats();
  window._pendingAttachments = [];
  closeModal();
  showToast('입고 완료! ' + item.name + ' +' + qty + item.unit + (atts.length > 0 ? ' (📎 ' + atts.length + '개)' : ''), 'success');
  renderInbound();
}
