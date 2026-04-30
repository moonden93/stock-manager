// ============================================
// 13-settings.js: 설정 화면 (팀/담당자/품목 관리)
// ============================================
// 의존: 5-storage.js (saveAll, applyPrebuiltHistory, inventory, teams, teamMembers)
//       모든 이전 모듈
//       SheetJS(XLSX) 라이브러리 (index.html에서 CDN 로드)
// 호출자: 99-main.js의 switchTab('settings')

let settingsTab = 'teams'; // teams / items
let pendingExcelChanges = null; // Excel 업로드 미리보기 임시 저장

// 설정 탭은 [저장] 버튼을 눌러야 localStorage에 반영됨.
// 편집은 메모리(teams/teamMembers/inventory)만 바꾸고 dirty 플래그를 세움.
let settingsDirty = false;
let settingsSnapshot = null;

function takeSettingsSnapshot() {
  settingsSnapshot = {
    teams: JSON.parse(JSON.stringify(teams)),
    teamMembers: JSON.parse(JSON.stringify(teamMembers)),
    inventory: JSON.parse(JSON.stringify(inventory))
  };
  settingsDirty = false;
}

function restoreSettingsSnapshot() {
  if (!settingsSnapshot) return;
  teams.length = 0;
  settingsSnapshot.teams.forEach(t => teams.push(t));
  Object.keys(teamMembers).forEach(k => delete teamMembers[k]);
  const restoredMembers = JSON.parse(JSON.stringify(settingsSnapshot.teamMembers));
  Object.keys(restoredMembers).forEach(k => { teamMembers[k] = restoredMembers[k]; });
  inventory.length = 0;
  settingsSnapshot.inventory.forEach(it => inventory.push(it));
  settingsDirty = false;
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
}

function markSettingsDirty() {
  if (!settingsSnapshot) takeSettingsSnapshot();
  settingsDirty = true;
}

function saveSettings() {
  if (!settingsDirty) { showToast('변경사항이 없습니다', 'info'); return; }
  saveAll();
  takeSettingsSnapshot();
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  showToast('저장되었습니다');
  renderSettings();
}

function cancelSettings() {
  if (!settingsDirty) { showToast('변경사항이 없습니다', 'info'); return; }
  askConfirm('변경 되돌리기', '저장하지 않은 변경사항을 모두 되돌립니다.\n계속하시겠습니까?', function() {
    restoreSettingsSnapshot();
    showToast('되돌렸습니다');
    renderSettings();
  }, '되돌리기', 'red');
}

function renderSettings() {
  // 첫 진입 시 현재 상태를 스냅샷으로 저장 (되돌리기 기준점)
  if (!settingsSnapshot) takeSettingsSnapshot();

  let html = '<div class="space-y-4">';

  // 저장/되돌리기 바: 항상 노출. dirty 여부에 따라 색상/문구만 변경.
  const barClass = settingsDirty
    ? 'bg-amber-50 border-amber-300'
    : 'bg-slate-50 border-slate-200';
  const barIcon = settingsDirty ? '⚠️' : '✓';
  const barMsg = settingsDirty
    ? '저장하지 않은 변경사항이 있습니다'
    : '변경사항 없음';
  const saveBtnClass = settingsDirty
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-slate-200 text-slate-400 cursor-not-allowed';
  const cancelBtnClass = settingsDirty
    ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
    : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed';
  html += '<div class="sticky top-0 z-30 ' + barClass + ' border-2 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">' +
    '<span class="text-xl">' + barIcon + '</span>' +
    '<span class="text-sm font-medium text-slate-800 flex-1">' + barMsg + '</span>' +
    '<button onclick="cancelSettings()" class="px-3 py-1.5 ' + cancelBtnClass + ' text-xs font-bold rounded-lg">되돌리기</button>' +
    '<button onclick="saveSettings()" class="px-3 py-1.5 ' + saveBtnClass + ' text-xs font-bold rounded-lg">💾 저장</button>' +
    '</div>';

  html +=
    '<div class="bg-slate-100 border border-slate-200 rounded-2xl p-4">' +
    '<h2 class="text-lg font-bold text-slate-900 mb-1">⚙️ 설정</h2>' +
    '<p class="text-sm text-slate-600">팀, 담당자, 품목, 업체를 관리합니다 (변경 후 [저장] 버튼을 눌러야 반영됩니다)</p></div>' +
    
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
    '<p class="px-4 py-2 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-100">💡 ▲▼ 버튼으로 팀 순서를 변경할 수 있어요</p>' +
    '<div class="divide-y divide-slate-100">';
  
  teams.forEach((team, idx) => {
    const members = teamMembers[team] || [];
    const isFloor = team.includes('층') || team.startsWith('9F') || team.startsWith('10F') || team.startsWith('11F');
    
    html += '<div class="px-4 py-3">' +
      '<div class="flex items-center gap-2 mb-2">' +
      // 위/아래 이동 버튼
      '<div class="flex flex-col gap-0.5">' +
      '<button onclick="moveTeamUp(' + idx + ')" ' + (idx === 0 ? 'disabled' : '') + 
      ' class="w-6 h-5 text-[10px] rounded ' + (idx === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-500 hover:bg-blue-100 hover:text-blue-600') + '" title="위로">▲</button>' +
      '<button onclick="moveTeamDown(' + idx + ')" ' + (idx === teams.length - 1 ? 'disabled' : '') + 
      ' class="w-6 h-5 text-[10px] rounded ' + (idx === teams.length - 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-500 hover:bg-blue-100 hover:text-blue-600') + '" title="아래로">▼</button>' +
      '</div>' +
      '<div class="w-2 h-2 rounded-full ' + (isFloor ? 'bg-cyan-500' : 'bg-blue-500') + '"></div>' +
      '<span class="flex-1 text-sm font-bold text-slate-900">' + escapeHtml(team) + '</span>' +
      '<button onclick="openEditTeamNameDialog(' + idx + ')" class="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">✏️</button>' +
      '<button onclick="removeTeam(' + idx + ')" class="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">🗑️</button>' +
      '</div>' +
      '<div class="ml-12 flex flex-wrap gap-1.5 items-center">';
    
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

// ============================================
// 팀 순서 변경 (위/아래 버튼)
// ============================================
function moveTeamUp(idx) {
  if (idx <= 0 || idx >= teams.length) return;
  const tmp = teams[idx];
  teams[idx] = teams[idx - 1];
  teams[idx - 1] = tmp;
  markSettingsDirty();
  renderSettings();
}

function moveTeamDown(idx) {
  if (idx < 0 || idx >= teams.length - 1) return;
  const tmp = teams[idx];
  teams[idx] = teams[idx + 1];
  teams[idx + 1] = tmp;
  markSettingsDirty();
  renderSettings();
}

function renderItemsSettings() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  
  let html = '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm">' +
    '<div class="bg-slate-50 border-b rounded-t-2xl px-4 py-3">' +
    '<div class="flex items-center justify-between mb-2">' +
    '<h3 class="text-sm font-bold text-slate-900">품목 관리 (' + inventory.length + '개, 업체 ' + vendors.length + '개)</h3>' +
    '</div>' +
    '<div class="flex flex-wrap gap-2">' +
    '<button onclick="exportItemsToExcel()" class="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700">📥 Excel 다운로드</button>' +
    '<label class="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 cursor-pointer">' +
    '📤 Excel 업로드<input type="file" accept=".xlsx,.xls" onchange="handleExcelUpload(event)" class="hidden" />' +
    '</label>' +
    '<button onclick="openAddItemDialog()" class="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700">+ 품목 추가</button>' +
    '</div>' +
    '<p class="text-[11px] text-slate-500 mt-2">💡 Excel로 일괄 수정: 다운로드 → Excel에서 편집 → 업로드 → 변경사항 확인 후 적용</p>' +
    '</div>' +
    '<div class="bg-white px-4 py-3 border-b border-slate-100">' +
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
    '<p class="text-xs text-slate-500">' + escapeHtml(item.vendor) +
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
// 팀 관련 함수들
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
  if (!name) {
    showAlert('팀 이름을 입력해주세요', '추가할 팀 이름이 비어 있습니다.\n\n예: Dr. 홍길동팀');
    setTimeout(() => { const el = document.getElementById('new-team-name'); if (el) el.focus(); }, 50);
    return;
  }
  if (teams.includes(name)) {
    showAlert('이미 존재하는 팀입니다', '"' + name + '" 팀이 이미 등록되어 있습니다.\n\n다른 이름을 사용해주세요.');
    return;
  }
  teams.push(name);
  markSettingsDirty();
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
  if (!newName) {
    showAlert('팀 이름을 입력해주세요', '팀 이름이 비어 있습니다.\n\n변경할 이름을 입력해주세요.');
    setTimeout(() => { const el = document.getElementById('edit-team-name'); if (el) { el.focus(); el.select(); } }, 50);
    return;
  }
  const oldName = teams[idx];
  if (newName === oldName) { closeModal(); return; }
  if (teams.includes(newName)) {
    showAlert('이미 존재하는 팀입니다', '"' + newName + '" 팀이 이미 등록되어 있습니다.\n\n다른 이름을 사용해주세요.');
    return;
  }
  teams[idx] = newName;
  if (teamMembers[oldName]) {
    teamMembers[newName] = teamMembers[oldName];
    delete teamMembers[oldName];
  }
  markSettingsDirty();
  closeModal();
  showToast('수정 완료');
  renderSettings();
}

function removeTeam(idx) {
  const name = teams[idx];
  askConfirm('팀 삭제', '"' + name + '" 팀을 삭제하시겠습니까?\n\n※ 기존 반출 이력은 유지됩니다', function() {
    teams.splice(idx, 1);
    delete teamMembers[name];
    markSettingsDirty();
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
  if (!name) {
    showAlert('담당자 이름을 입력해주세요', '추가할 담당자 이름이 비어 있습니다.\n\n예: 김간호사');
    setTimeout(() => { const el = document.getElementById('new-member-name'); if (el) el.focus(); }, 50);
    return;
  }
  if (!teamMembers[team]) teamMembers[team] = [];
  if (teamMembers[team].includes(name)) {
    showAlert('이미 등록된 담당자입니다', '"' + name + '"은(는) ' + team + '에\n이미 등록되어 있습니다.\n\n다른 이름을 사용하거나\n기존 담당자를 확인해주세요.');
    return;
  }
  teamMembers[team].push(name);
  markSettingsDirty();
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
    markSettingsDirty();
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
  
  if (!vendor) {
    showAlert('업체명을 입력해주세요', '업체명은 필수 입력 항목입니다.\n\n위쪽 [업체] 영역에서\n목록에서 선택하거나\n새 업체명을 직접 입력하세요.');
    setTimeout(() => { const el = document.getElementById('new-item-vendor'); if (el) el.focus(); }, 50);
    return;
  }
  if (!name) {
    showAlert('품명을 입력해주세요', '품명은 필수 입력 항목입니다.\n\n예: Denture bur #9369');
    setTimeout(() => { const el = document.getElementById('new-item-name'); if (el) el.focus(); }, 50);
    return;
  }
  if (!unit) {
    showAlert('단위를 입력해주세요', '단위는 필수 입력 항목입니다.\n\n예: ea, box, 갑');
    setTimeout(() => { const el = document.getElementById('new-item-unit'); if (el) el.focus(); }, 50);
    return;
  }
  
  const newItem = {
    id: 'M' + Date.now(),
    vendor, name, unit, price, stock, minStock, category: '치과재료'
  };
  inventory.push(newItem);
  markSettingsDirty();
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
  if (!vendor) {
    showAlert('업체명을 입력해주세요', '업체명은 필수 입력 항목입니다.');
    setTimeout(() => { const el = document.getElementById('edit-item-vendor'); if (el) el.focus(); }, 50);
    return;
  }
  if (!name) {
    showAlert('품명을 입력해주세요', '품명은 필수 입력 항목입니다.');
    setTimeout(() => { const el = document.getElementById('edit-item-name'); if (el) el.focus(); }, 50);
    return;
  }
  if (!unit) {
    showAlert('단위를 입력해주세요', '단위는 필수 입력 항목입니다.\n\n예: ea, box, 갑');
    setTimeout(() => { const el = document.getElementById('edit-item-unit'); if (el) el.focus(); }, 50);
    return;
  }
  if (isNaN(stock) || stock < 0) {
    showAlert('재고는 0 이상이어야 합니다', '현재 재고에 숫자(0 이상)를 입력해주세요.');
    setTimeout(() => { const el = document.getElementById('edit-item-stock'); if (el) { el.focus(); el.select(); } }, 50);
    return;
  }
  if (isNaN(minStock) || minStock < 0) {
    showAlert('부족 기준은 0 이상이어야 합니다', '⚠️ 부족 기준에 숫자(0 이상)를 입력해주세요.\n\n재고가 이 수량 이하로 떨어지면\n🟡 부족 표시가 나타납니다.');
    setTimeout(() => { const el = document.getElementById('edit-item-min'); if (el) { el.focus(); el.select(); } }, 50);
    return;
  }
  item.vendor = vendor;
  item.name = name;
  item.unit = unit;
  item.price = price;
  item.stock = stock;
  item.minStock = minStock;
  markSettingsDirty();
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
    markSettingsDirty();
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
  
  // 시트 ①: 전체 품목 목록 (이게 업로드용 표준 형식!)
  // 헤더: 업체 | 품목명 | 단위 | 단가(원) | 재고 | 부족기준
  const allRows = [
    ['업체', '품목명', '단위', '단가(원)', '재고', '부족기준']
  ];
  
  const sorted = [...inventory].sort((a, b) => {
    if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
    return a.name.localeCompare(b.name);
  });
  
  sorted.forEach(item => {
    allRows.push([
      item.vendor,
      item.name,
      item.unit || '',
      item.price || 0,
      item.stock || 0,
      item.minStock || 0
    ]);
  });
  
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  const range = XLSX.utils.decode_range(wsAll['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; R++) {
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
    { wch: 14 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, '품목목록');
  
  const filename = '치과재료_품목목록_' + today + '.xlsx';
  XLSX.writeFile(wb, filename);
  showToast('Excel 다운로드 완료 (수정 후 다시 업로드 가능)', 'success');
}

// ============================================
// Excel 업로드 - 변경사항 분석 및 미리보기
// ============================================
function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (typeof XLSX === 'undefined') {
    showToast('Excel 라이브러리 로드 실패. 페이지를 새로고침해주세요.', 'error');
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      
      // 첫 번째 시트 사용
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      
      if (rows.length < 2) {
        showAlert('Excel 파일이 비어있습니다', '데이터 행이 없거나\n형식이 잘못된 파일입니다.\n\n첫 번째 행에 헤더,\n두 번째 행부터 품목 데이터가\n들어 있어야 합니다.');
        event.target.value = '';
        return;
      }
      
      // 헤더 검증
      const header = rows[0].map(h => String(h).trim());
      const requiredCols = ['업체', '품목명', '단위', '단가(원)', '재고', '부족기준'];
      const colIdx = {};
      let missing = [];
      requiredCols.forEach(col => {
        // 정확히 일치하거나, '단가' 같은 부분 일치도 허용
        let idx = header.findIndex(h => h === col);
        if (idx === -1 && col === '단가(원)') idx = header.findIndex(h => h === '단가');
        if (idx === -1 && col === '부족기준') idx = header.findIndex(h => h === '부족 기준' || h === '최소재고');
        if (idx === -1) missing.push(col);
        else colIdx[col] = idx;
      });
      
      if (missing.length > 0) {
        showAlert('Excel 형식 오류', '다음 컬럼이 없습니다:\n\n' + missing.join(', ') + '\n\n첫 행의 컬럼 이름을 확인해주세요.\n필수 컬럼: 업체, 품목명, 단위,\n  단가(원), 재고, 부족기준');
        event.target.value = '';
        return;
      }
      
      // 데이터 파싱 + 변경사항 분석
      analyzeExcelChanges(rows, colIdx);
      
    } catch (err) {
      console.error('Excel 파싱 오류:', err);
      showToast('Excel 파일을 읽을 수 없습니다', 'error');
    }
    event.target.value = '';
  };
  reader.onerror = function() {
    showToast('파일 읽기 실패', 'error');
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// Excel 데이터와 현재 inventory를 비교하여 변경사항 추출
function analyzeExcelChanges(rows, colIdx) {
  const excelItems = [];
  const errors = [];
  
  // Excel 행 파싱 (헤더 다음 줄부터)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const vendor = String(row[colIdx['업체']] || '').trim();
    const name = String(row[colIdx['품목명']] || '').trim();
    const unit = String(row[colIdx['단위']] || '').trim();
    const price = parseInt(row[colIdx['단가(원)']]) || 0;
    const stock = parseInt(row[colIdx['재고']]);
    const minStock = parseInt(row[colIdx['부족기준']]);
    
    // 빈 행은 건너뜀
    if (!vendor && !name) continue;
    
    // 필수 항목 체크
    if (!vendor || !name || !unit) {
      errors.push((i + 1) + '행: 업체/품목명/단위는 필수');
      continue;
    }
    if (isNaN(stock) || stock < 0) {
      errors.push((i + 1) + '행 [' + name + ']: 재고가 잘못됨');
      continue;
    }
    if (isNaN(minStock) || minStock < 0) {
      errors.push((i + 1) + '행 [' + name + ']: 부족기준이 잘못됨');
      continue;
    }
    
    excelItems.push({ vendor, name, unit, price, stock, minStock });
  }
  
  if (errors.length > 0) {
    const preview = errors.slice(0, 5).join('\n');
    const more = errors.length > 5 ? '\n... 외 ' + (errors.length - 5) + '건' : '';
    showAlert('Excel 데이터 오류 ' + errors.length + '건', preview + more + '\n\n해당 행을 확인하고\n수정 후 다시 불러와주세요.', 'red');
    return;
  }

  if (excelItems.length === 0) {
    showAlert('유효한 데이터가 없습니다', 'Excel에 등록할 수 있는\n품목이 한 개도 없습니다.\n\n파일 내용을 확인해주세요.');
    return;
  }
  
  // 매칭 키: 업체+품목명
  const makeKey = (it) => it.vendor + '||' + it.name;
  
  const currentMap = {};
  inventory.forEach(it => { currentMap[makeKey(it)] = it; });
  
  const excelKeys = new Set(excelItems.map(makeKey));
  
  const toAdd = [];      // Excel에만 있음 → 추가
  const toUpdate = [];   // 둘 다 있는데 다름 → 수정
  const unchanged = [];  // 둘 다 있고 같음 → 변동 없음
  const toDelete = [];   // 시스템에만 있음 → 삭제 후보
  
  excelItems.forEach(ex => {
    const key = makeKey(ex);
    const cur = currentMap[key];
    if (!cur) {
      toAdd.push(ex);
    } else {
      // 변경사항 비교
      const diff = [];
      if ((cur.unit || '') !== ex.unit) diff.push({ field: '단위', from: cur.unit, to: ex.unit });
      if ((cur.price || 0) !== ex.price) diff.push({ field: '단가', from: cur.price || 0, to: ex.price });
      if ((cur.stock || 0) !== ex.stock) diff.push({ field: '재고', from: cur.stock || 0, to: ex.stock });
      if ((cur.minStock || 0) !== ex.minStock) diff.push({ field: '부족기준', from: cur.minStock || 0, to: ex.minStock });
      
      if (diff.length > 0) {
        toUpdate.push({ current: cur, excel: ex, diff });
      } else {
        unchanged.push(ex);
      }
    }
  });
  
  inventory.forEach(it => {
    if (!excelKeys.has(makeKey(it))) {
      toDelete.push(it);
    }
  });
  
  if (toAdd.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
    showToast('변경사항이 없습니다 (' + unchanged.length + '개 모두 동일)', 'info');
    return;
  }
  
  // 미리보기 모달 표시
  pendingExcelChanges = { toAdd, toUpdate, toDelete, unchanged };
  showExcelPreviewModal();
}

function showExcelPreviewModal() {
  const c = pendingExcelChanges;
  if (!c) return;
  
  let html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeExcelPreview()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">📋 변경사항 미리보기</h3>' +
    '<p class="text-xs text-slate-600 mt-1">아래 내용을 확인 후 [적용] 버튼을 누르면 반영됩니다</p>' +
    '</div>' +
    '<div class="px-5 py-4 overflow-y-auto flex-1 space-y-4 text-sm">';
  
  // 요약
  html += '<div class="grid grid-cols-3 gap-2 text-center">' +
    '<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3">' +
    '<p class="text-xs text-emerald-700 font-bold">✅ 새로 추가</p>' +
    '<p class="text-2xl font-bold text-emerald-700">' + c.toAdd.length + '</p>' +
    '</div>' +
    '<div class="bg-blue-50 border border-blue-200 rounded-lg p-3">' +
    '<p class="text-xs text-blue-700 font-bold">✏️ 수정</p>' +
    '<p class="text-2xl font-bold text-blue-700">' + c.toUpdate.length + '</p>' +
    '</div>' +
    '<div class="bg-red-50 border border-red-200 rounded-lg p-3">' +
    '<p class="text-xs text-red-700 font-bold">🗑️ 삭제</p>' +
    '<p class="text-2xl font-bold text-red-700">' + c.toDelete.length + '</p>' +
    '</div>' +
    '</div>' +
    '<p class="text-xs text-slate-500 text-center">변동 없음: ' + c.unchanged.length + '개</p>';
  
  // 추가 목록
  if (c.toAdd.length > 0) {
    html += '<div class="border-2 border-emerald-200 rounded-lg overflow-hidden">' +
      '<div class="px-3 py-2 bg-emerald-50 text-xs font-bold text-emerald-700">✅ 새로 추가될 품목 (' + c.toAdd.length + '개)</div>' +
      '<div class="max-h-48 overflow-y-auto divide-y divide-slate-100">';
    c.toAdd.forEach(it => {
      html += '<div class="px-3 py-2 text-xs">' +
        '<span class="text-slate-500">' + escapeHtml(it.vendor) + '</span> · ' +
        '<span class="font-medium">' + escapeHtml(it.name) + '</span>' +
        ' <span class="text-slate-500">(' + it.price.toLocaleString() + '원, 재고 ' + it.stock + ')</span>' +
        '</div>';
    });
    html += '</div></div>';
  }
  
  // 수정 목록
  if (c.toUpdate.length > 0) {
    html += '<div class="border-2 border-blue-200 rounded-lg overflow-hidden">' +
      '<div class="px-3 py-2 bg-blue-50 text-xs font-bold text-blue-700">✏️ 수정될 품목 (' + c.toUpdate.length + '개)</div>' +
      '<div class="max-h-64 overflow-y-auto divide-y divide-slate-100">';
    c.toUpdate.forEach(u => {
      html += '<div class="px-3 py-2 text-xs">' +
        '<p class="font-medium text-slate-900">' + escapeHtml(u.current.vendor) + ' / ' + escapeHtml(u.current.name) + '</p>' +
        '<div class="ml-2 mt-1 space-y-0.5">';
      u.diff.forEach(d => {
        const fromStr = (d.field === '단가') ? d.from.toLocaleString() + '원' : d.from;
        const toStr = (d.field === '단가') ? d.to.toLocaleString() + '원' : d.to;
        html += '<p class="text-[11px] text-slate-600">· ' + d.field + ': <span class="text-slate-400 line-through">' + fromStr + '</span> → <span class="font-bold text-blue-700">' + toStr + '</span></p>';
      });
      html += '</div></div>';
    });
    html += '</div></div>';
  }
  
  // 삭제 목록
  if (c.toDelete.length > 0) {
    html += '<div class="border-2 border-red-200 rounded-lg overflow-hidden">' +
      '<div class="px-3 py-2 bg-red-50 text-xs font-bold text-red-700">🗑️ 삭제될 품목 (' + c.toDelete.length + '개)' +
      ' <span class="font-normal text-slate-600">- Excel에 없는 품목들</span></div>' +
      '<div class="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">⚠️ 기존 반출/입고 이력은 유지됩니다 (통계에는 그대로 보임)</div>' +
      '<div class="max-h-48 overflow-y-auto divide-y divide-slate-100">';
    c.toDelete.forEach(it => {
      html += '<div class="px-3 py-2 text-xs">' +
        '<span class="text-slate-500">' + escapeHtml(it.vendor) + '</span> · ' +
        '<span class="font-medium">' + escapeHtml(it.name) + '</span>' +
        '</div>';
    });
    html += '</div></div>';
  }
  
  html += '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeExcelPreview()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="applyExcelChanges()" class="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">✅ 적용</button>' +
    '</div></div></div>';
  
  document.getElementById('modal-container').innerHTML = html;
}

function closeExcelPreview() {
  pendingExcelChanges = null;
  closeModal();
}

function applyExcelChanges() {
  const c = pendingExcelChanges;
  if (!c) return;
  
  // 추가
  c.toAdd.forEach(ex => {
    inventory.push({
      id: 'M' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      vendor: ex.vendor,
      name: ex.name,
      unit: ex.unit,
      price: ex.price,
      stock: ex.stock,
      minStock: ex.minStock,
      category: '치과재료'
    });
  });
  
  // 수정
  c.toUpdate.forEach(u => {
    const item = inventory.find(i => i.id === u.current.id);
    if (item) {
      item.unit = u.excel.unit;
      item.price = u.excel.price;
      item.stock = u.excel.stock;
      item.minStock = u.excel.minStock;
    }
  });
  
  // 삭제
  const deleteIds = new Set(c.toDelete.map(it => it.id));
  inventory = inventory.filter(it => !deleteIds.has(it.id));
  
  markSettingsDirty();
  updateHeaderStats();
  pendingExcelChanges = null;
  closeModal();
  
  const msg = '적용 완료! 추가 ' + c.toAdd.length + ' / 수정 ' + c.toUpdate.length + ' / 삭제 ' + c.toDelete.length;
  showToast(msg, 'success');
  renderSettings();
}
