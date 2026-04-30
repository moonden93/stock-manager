// ============================================
// 13-settings.js: 설정 화면 (팀/담당자/품목 관리)
// ============================================
// 의존: 5-storage.js (saveAll, applyPrebuiltHistory, inventory, teams, teamMembers)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('settings')

let settingsTab = 'teams'; // teams / items

function renderSettings() {
  let html = '<div class="space-y-4">' +
    '<div class="bg-slate-100 border border-slate-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">⚙️ 설정</h2>' +
    '<p class="text-sm text-slate-600">팀, 담당자, 품목, 업체를 관리합니다</p></div>' +
    
    '<div class="flex bg-slate-100 rounded-xl p-1">' +
    '<button onclick="settingsTab = \'teams\'; renderSettings();" class="flex-1 py-2 rounded-lg font-bold text-sm transition ' +
    (settingsTab === 'teams' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">👥 팀/담당자</button>' +
    '<button onclick="settingsTab = \'items\'; renderSettings();" class="flex-1 py-2 rounded-lg font-bold text-sm transition ' +
    (settingsTab === 'items' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600') + '">📦 품목/업체</button>' +
    '</div>';
  
  if (settingsTab === 'teams') {
    html += renderTeamsSettings();
  } else {
    html += renderItemsSettings();
  }
  
  html += '</div>';
  document.getElementById('page-content').innerHTML = html;
}

function renderTeamsSettings() {
  let html = '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">' +
    '<h3 class="text-sm font-bold text-slate-900">팀 관리 (' + teams.length + '개)</h3>' +
    '<button onclick="openAddTeamDialog()" class="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700">+ 팀 추가</button>' +
    '</div>' +
    '<div class="divide-y divide-slate-100">';
  
  teams.forEach((team, idx) => {
    const members = teamMembers[team] || [];
    html += '<div class="px-4 py-3">' +
      '<div class="flex items-center gap-2 mb-2">' +
      '<div class="w-2 h-2 rounded-full ' + (team.includes('층') ? 'bg-cyan-500' : 'bg-blue-500') + '"></div>' +
      '<span class="flex-1 text-sm font-bold text-slate-900">' + escapeHtml(team) + '</span>' +
      '<button onclick="openEditTeamNameDialog(' + idx + ')" class="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">✏️</button>' +
      '<button onclick="removeTeam(' + idx + ')" class="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">🗑️</button>' +
      '</div>' +
      '<div class="ml-4 flex flex-wrap gap-1.5 items-center">';
    
    if (members.length === 0) {
      html += '<span class="text-xs text-slate-400">담당자 없음</span>';
    } else {
      members.forEach((m, mIdx) => {
        html += '<span class="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 border border-teal-200 rounded-lg text-xs">' +
          (mIdx === 0 ? '⭐' : '') + escapeHtml(m) +
          '<button onclick="removeMember(\'' + escapeJs(team) + '\', \'' + escapeJs(m) + '\')" class="text-slate-400 hover:text-red-500 ml-1">×</button>' +
          '</span>';
      });
    }
    html += '<button onclick="openAddMemberDialog(\'' + escapeJs(team) + '\')" class="inline-flex items-center gap-1 px-2 py-1 bg-white border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-teal-400 hover:text-teal-700">+ 담당자</button>' +
      '</div></div>';
  });
  
  html += '</div></div>';
  return html;
}

function renderItemsSettings() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  
  let html = '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">' +
    '<h3 class="text-sm font-bold text-slate-900">품목 관리 (' + inventory.length + '개, 업체 ' + vendors.length + '개)</h3>' +
    '<div class="flex gap-2">' +
    '<button onclick="exportItemsToExcel()" class="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700">📥 Excel</button>' +
    '<button onclick="openAddItemDialog()" class="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700">+ 품목 추가</button>' +
    '</div>' +
    '</div>' +
    '<div class="px-4 py-3 border-b border-slate-100">' +
    '<input type="text" id="settings-search" placeholder="🔍 품목 검색..." oninput="filterSettingsItems()" class="w-full px-4 py-2.5 text-sm bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div>' +
    '<div id="settings-items-list" class="divide-y divide-slate-100">';
  
  // 모든 품목 표시
  inventory.forEach(item => {
    html += renderSettingsItemRow(item);
  });
  
  html += '</div></div>';
  return html;
}

function renderSettingsItemRow(item) {
  return '<div class="px-4 py-3 hover:bg-slate-50">' +
    '<div class="flex items-center gap-2">' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) + ' · ' + escapeHtml(item.unit) + 
    (item.price ? ' · ' + item.price.toLocaleString() + '원' : '') + '</p>' +
    '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p></div>' +
    '<button onclick="openEditItemDialog(\'' + item.id + '\')" class="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">✏️</button>' +
    '<button onclick="removeItem(\'' + item.id + '\')" class="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">🗑️</button>' +
    '</div></div>';
}

function filterSettingsItems() {
  const term = (document.getElementById('settings-search').value || '').toLowerCase();
  const filtered = inventory.filter(i => 
    i.name.toLowerCase().includes(term) || i.vendor.toLowerCase().includes(term)
  );
  const list = document.getElementById('settings-items-list');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    let html = '';
    filtered.forEach(item => { html += renderSettingsItemRow(item); });
    list.innerHTML = html;
  }
}

// ============================================
// 팀 추가
// ============================================
function openAddTeamDialog() {
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200">' +
    '<h3 class="text-base font-bold text-slate-900">+ 팀 추가</h3></div>' +
    '<div class="px-5 py-5">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">팀 이름</label>' +
    '<input type="text" id="new-team-name" placeholder="예: Dr. 홍길동팀" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div><div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="addTeam()" class="flex-1 py-3 bg-teal-600 text-white rounded-lg font-bold">추가</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  setTimeout(() => document.getElementById('new-team-name').focus(), 100);
}

function addTeam() {
  const name = (document.getElementById('new-team-name').value || '').trim();
  if (!name) { showToast('팀 이름 입력 필요', 'error'); return; }
  if (teams.includes(name)) { showToast('이미 존재하는 팀', 'error'); return; }
  teams.push(name);
  saveAll();
  closeModal();
  showToast('"' + name + '" 추가됨');
  renderSettings();
}

function openEditTeamNameDialog(idx) {
  const team = teams[idx];
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">팀 이름 수정</h3></div>' +
    '<div class="px-5 py-5">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">팀 이름</label>' +
    '<input type="text" id="edit-team-name" value="' + escapeHtml(team) + '" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" onfocus="this.select()" />' +
    '</div><div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveTeamName(' + idx + ')" class="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  setTimeout(() => document.getElementById('edit-team-name').focus(), 100);
}

function saveTeamName(idx) {
  const newName = (document.getElementById('edit-team-name').value || '').trim();
  if (!newName) { showToast('이름 필요', 'error'); return; }
  const oldName = teams[idx];
  if (newName === oldName) { closeModal(); return; }
  if (teams.includes(newName)) { showToast('이미 존재하는 팀', 'error'); return; }
  teams[idx] = newName;
  // teamMembers 키 변경
  if (teamMembers[oldName]) {
    teamMembers[newName] = teamMembers[oldName];
    delete teamMembers[oldName];
  }
  saveAll();
  closeModal();
  showToast('수정 완료');
  renderSettings();
}

function removeTeam(idx) {
  const name = teams[idx];
  askConfirm('팀 삭제', '"' + name + '" 팀을 삭제하시겠습니까?\n\n※ 기존 반출 이력은 유지됩니다', function() {
    teams.splice(idx, 1);
    delete teamMembers[name];
    saveAll();
    showToast('삭제됨');
    renderSettings();
  }, '삭제', 'red');
}

function openAddMemberDialog(team) {
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200">' +
    '<h3 class="text-base font-bold text-slate-900">+ 담당자 추가</h3>' +
    '<p class="text-xs text-slate-500 mt-1">' + escapeHtml(team) + '</p></div>' +
    '<div class="px-5 py-5">' +
    '<label class="text-sm font-bold text-slate-700 mb-2 block">담당자 이름</label>' +
    '<input type="text" id="new-member-name" placeholder="예: 김간호사" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '<p class="text-xs text-slate-400 mt-2">💡 첫 번째 담당자가 ⭐ 대표가 됩니다 (반출 시 자동 입력)</p>' +
    '</div><div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="addMember(\'' + escapeJs(team) + '\')" class="flex-1 py-3 bg-teal-600 text-white rounded-lg font-bold">추가</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  setTimeout(() => document.getElementById('new-member-name').focus(), 100);
}

function addMember(team) {
  const name = (document.getElementById('new-member-name').value || '').trim();
  if (!name) { showToast('이름 필요', 'error'); return; }
  if (!teamMembers[team]) teamMembers[team] = [];
  if (teamMembers[team].includes(name)) { showToast('이미 등록됨', 'error'); return; }
  teamMembers[team].push(name);
  saveAll();
  closeModal();
  showToast('"' + name + '" 추가됨');
  renderSettings();
}

function removeMember(team, member) {
  askConfirm('담당자 제외', '"' + member + '"을(를) ' + team + '에서 제외하시겠습니까?', function() {
    if (teamMembers[team]) {
      teamMembers[team] = teamMembers[team].filter(m => m !== member);
      if (teamMembers[team].length === 0) delete teamMembers[team];
    }
    saveAll();
    showToast('제외됨');
    renderSettings();
  }, '제외', 'red');
}

// ============================================
// 품목 추가
// ============================================
function openAddItemDialog() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  let vendorOptions = '<option value="">-- 업체 선택 --</option>';
  vendors.forEach(v => { vendorOptions += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>'; });
  
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200">' +
    '<h3 class="text-base font-bold text-slate-900">+ 품목 추가</h3></div>' +
    '<div class="px-5 py-5 space-y-3 overflow-y-auto">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">업체</label>' +
    '<select id="new-item-vendor-select" onchange="document.getElementById(\'new-item-vendor\').value = this.value" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 mb-2">' + vendorOptions + '</select>' +
    '<input type="text" id="new-item-vendor" placeholder="또는 새 업체 직접 입력" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">품명</label>' +
    '<input type="text" id="new-item-name" placeholder="예: Denture bur #9369" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">단위</label>' +
    '<input type="text" id="new-item-unit" placeholder="ea, box, 갑" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">단가(원)</label>' +
    '<input type="number" id="new-item-price" placeholder="0" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">현재 재고</label>' +
    '<input type="number" id="new-item-stock" placeholder="0" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">⚠️ 부족 기준</label>' +
    '<input type="number" id="new-item-min" placeholder="0" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '</div>' +
    '<p class="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">💡 재고가 "부족 기준" 이하가 되면 🟡 부족 표시가 나타나요</p>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="addItem()" class="flex-1 py-3 bg-teal-600 text-white rounded-lg font-bold">추가</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
  setTimeout(() => document.getElementById('new-item-name').focus(), 100);
}

function addItem() {
  const vendor = (document.getElementById('new-item-vendor').value || document.getElementById('new-item-vendor-select').value || '').trim();
  const name = (document.getElementById('new-item-name').value || '').trim();
  const unit = (document.getElementById('new-item-unit').value || '').trim();
  const price = parseInt(document.getElementById('new-item-price').value) || 0;
  const stock = parseInt(document.getElementById('new-item-stock').value) || 0;
  const minStock = parseInt(document.getElementById('new-item-min').value) || 0;
  
  if (!vendor) { showToast('업체 입력 필요', 'error'); return; }
  if (!name) { showToast('품명 입력 필요', 'error'); return; }
  if (!unit) { showToast('단위 입력 필요', 'error'); return; }
  
  const newItem = {
    id: 'M' + Date.now(),
    vendor, name, unit, price, stock, minStock, category: '치과재료'
  };
  inventory.push(newItem);
  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('"' + name + '" 추가됨');
  renderSettings();
}

// ============================================
// 품목 수정
// ============================================
function openEditItemDialog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  
  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">품목 수정</h3></div>' +
    '<div class="px-5 py-5 space-y-3 overflow-y-auto">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">업체</label>' +
    '<input type="text" id="edit-item-vendor" value="' + escapeHtml(item.vendor) + '" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">품명</label>' +
    '<input type="text" id="edit-item-name" value="' + escapeHtml(item.name) + '" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" /></div>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">단위</label>' +
    '<input type="text" id="edit-item-unit" value="' + escapeHtml(item.unit) + '" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">단가(원)</label>' +
    '<input type="number" id="edit-item-price" value="' + (item.price || 0) + '" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" /></div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">현재 재고</label>' +
    '<input type="number" id="edit-item-stock" value="' + (item.stock || 0) + '" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">⚠️ 부족 기준</label>' +
    '<input type="number" id="edit-item-min" value="' + (item.minStock || 0) + '" min="0" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" /></div>' +
    '</div>' +
    '<p class="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">💡 재고가 "부족 기준" 이하가 되면 🟡 부족 표시가 나타나요</p>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveItem(\'' + item.id + '\')" class="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

function saveItem(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const vendor = (document.getElementById('edit-item-vendor').value || '').trim();
  const name = (document.getElementById('edit-item-name').value || '').trim();
  const unit = (document.getElementById('edit-item-unit').value || '').trim();
  const price = parseInt(document.getElementById('edit-item-price').value) || 0;
  const stock = parseInt(document.getElementById('edit-item-stock').value);
  const minStock = parseInt(document.getElementById('edit-item-min').value);
  if (!vendor || !name || !unit) { showToast('필수 항목 입력 필요', 'error'); return; }
  if (isNaN(stock) || stock < 0) { showToast('재고는 0 이상이어야 합니다', 'error'); return; }
  if (isNaN(minStock) || minStock < 0) { showToast('부족 기준은 0 이상이어야 합니다', 'error'); return; }
  item.vendor = vendor;
  item.name = name;
  item.unit = unit;
  item.price = price;
  item.stock = stock;
  item.minStock = minStock;
  saveAll();
  updateHeaderStats();
  closeModal();
  showToast('수정 완료');
  renderSettings();
}

function removeItem(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  askConfirm('품목 삭제', '"' + item.name + '"을(를) 삭제하시겠습니까?\n\n※ 기존 반출 이력은 유지됩니다', function() {
    inventory = inventory.filter(i => i.id !== itemId);
    saveAll();
    updateHeaderStats();
    showToast('삭제됨');
    renderSettings();
  }, '삭제', 'red');
}

// ============================================
// 품목 목록 Excel 다운로드
// ============================================
function exportItemsToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel 라이브러리 로드 실패. 페이지를 새로고침해주세요.', 'error');
    return;
  }
  
  if (inventory.length === 0) {
    showToast('내보낼 품목이 없습니다', 'error');
    return;
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();
  
  // 시트 ①: 전체 품목 목록
  const allRows = [
    ['치과 재료 품목 목록'],
    ['추출일', today, '총 품목', inventory.length + '개'],
    [],
    ['업체', '품목명', '단위', '단가(원)', '재고', '부족기준', '재고상태']
  ];
  
  // 업체별로 정렬 후 품목명으로 정렬
  const sorted = [...inventory].sort((a, b) => {
    if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
    return a.name.localeCompare(b.name);
  });
  
  sorted.forEach(item => {
    let status = '정상';
    if (item.stock === 0) status = '🔴 품절';
    else if (item.stock <= (item.minStock || 0)) status = '🟡 부족';
    
    allRows.push([
      item.vendor,
      item.name,
      item.unit || '',
      item.price || 0,
      item.stock || 0,
      item.minStock || 0,
      status
    ]);
  });
  
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  const range = XLSX.utils.decode_range(wsAll['!ref'] || 'A1');
  for (let R = 4; R <= range.e.r; R++) {
    [3, 4, 5].forEach(C => {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = wsAll[addr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '#,##0';
      }
    });
  }
  wsAll['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, '전체품목');
  
  // 시트 ②: 업체별 시트
  const vendorGroups = {};
  inventory.forEach(item => {
    if (!vendorGroups[item.vendor]) vendorGroups[item.vendor] = [];
    vendorGroups[item.vendor].push(item);
  });
  
  Object.keys(vendorGroups).sort().forEach(vendor => {
    const items = vendorGroups[vendor].sort((a, b) => a.name.localeCompare(b.name));
    const rows = [
      [vendor + ' 품목 목록'],
      ['총 품목', items.length + '개'],
      [],
      ['품목명', '단위', '단가(원)', '재고', '부족기준']
    ];
    
    items.forEach(item => {
      rows.push([
        item.name,
        item.unit || '',
        item.price || 0,
        item.stock || 0,
        item.minStock || 0
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const r = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = 3; R <= r.e.r; R++) {
      [2, 3, 4].forEach(C => {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0';
        }
      });
    }
    ws['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 10 }];
    
    let sheetName = String(vendor).replace(/[\\/?*\[\]:]/g, '_');
    if (sheetName.length > 31) sheetName = sheetName.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  
  const filename = '치과재료_품목목록_' + today + '.xlsx';
  XLSX.writeFile(wb, filename);
  showToast('Excel 다운로드 완료 (' + (Object.keys(vendorGroups).length + 1) + '개 시트)', 'success');
}
