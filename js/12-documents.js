// ============================================
// 12-documents.js: 문서함 화면
// ============================================
// 의존: 6-utils-file.js (readFileAsBase64, getFileIcon, formatFileSize, downloadDoc, previewDoc)
//       모든 이전 모듈
// 호출자: 99-main.js의 switchTab('documents')

let docsViewMode = 'vendor'; // 'vendor' | 'all'
let docsSelectedVendor = null;
let docsSearchTerm = '';
let docsCategoryFilter = '전체';

function renderDocuments() {
  const categories = ['전체', '입고문서', '계약서', '주문서', '거래명세서', '기타'];
  
  // 업체별 카운트
  const vendorCounts = {};
  documents.forEach(d => {
    const v = d.vendor || '기타';
    vendorCounts[v] = (vendorCounts[v] || 0) + 1;
  });
  // 모든 업체 (재고에 있는 것 + 문서에 있는 것)
  const allVendors = new Set();
  inventory.forEach(i => allVendors.add(i.vendor));
  Object.keys(vendorCounts).forEach(v => allVendors.add(v));
  const vendors = Array.from(allVendors).sort();
  
  // 필터링
  let filtered = documents.filter(d => {
    if (docsCategoryFilter !== '전체' && d.category !== docsCategoryFilter) return false;
    if (docsViewMode === 'vendor' && docsSelectedVendor && d.vendor !== docsSelectedVendor) return false;
    if (docsSearchTerm) {
      const t = docsSearchTerm.toLowerCase();
      if (!d.name.toLowerCase().includes(t) && !(d.note || '').toLowerCase().includes(t)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
  
  const totalSize = documents.reduce((s, d) => s + (d.size || 0), 0);
  
  let html = '<div class="space-y-4">' +
    '<div class="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-3">' +
    '<div><h2 class="text-lg font-bold text-slate-900 mb-1">📁 문서함</h2>' +
    '<p class="text-sm text-slate-600">계약서, 주문서, 거래명세서 등 (' + documents.length + '개 · ' + formatFileSize(totalSize) + ')</p></div>' +
    '<button onclick="openUploadDialog()" class="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold whitespace-nowrap">+ 업로드</button>' +
    '</div>';
  
  // 보기 모드 + 필터
  html += '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
    '<div class="px-3 pt-3 pb-2 flex flex-col sm:flex-row gap-2">' +
    '<div class="flex bg-slate-100 rounded-lg p-0.5">' +
    '<button onclick="docsViewMode = \'vendor\'; docsSelectedVendor = null; renderDocuments();" class="px-3 py-1.5 text-xs font-bold rounded-md transition ' +
    (docsViewMode === 'vendor' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600') + '">🏢 업체별</button>' +
    '<button onclick="docsViewMode = \'all\'; docsSelectedVendor = null; renderDocuments();" class="px-3 py-1.5 text-xs font-bold rounded-md transition ' +
    (docsViewMode === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600') + '">📋 전체 목록</button>' +
    '</div>' +
    '<input type="text" value="' + escapeHtml(docsSearchTerm) + '" oninput="docsSearchTerm = this.value; renderDocuments();" ' +
    'placeholder="🔍 문서명 검색..." class="flex-1 px-3 py-2 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-500" />' +
    '<select onchange="docsCategoryFilter = this.value; renderDocuments();" class="px-3 py-2 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-500">';
  categories.forEach(c => {
    html += '<option value="' + c + '"' + (docsCategoryFilter === c ? ' selected' : '') + '>' + c + '</option>';
  });
  html += '</select></div></div>';
  
  // 업체별 보기 - 업체 카드
  if (docsViewMode === 'vendor' && !docsSelectedVendor) {
    html += '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">';
    vendors.forEach(v => {
      const cnt = vendorCounts[v] || 0;
      html += '<button onclick="docsSelectedVendor = \'' + escapeJs(v) + '\'; renderDocuments();" ' +
        'class="bg-white rounded-xl border-2 border-slate-200 p-3 hover:border-purple-400 transition text-left">' +
        '<div class="w-10 h-10 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center mb-2">🏢</div>' +
        '<p class="text-sm font-bold text-slate-900 truncate">' + escapeHtml(v) + '</p>' +
        '<p class="text-xs ' + (cnt > 0 ? 'text-purple-700 font-bold' : 'text-slate-400') + ' mt-1">문서 ' + cnt + '개</p>' +
        '</button>';
    });
    html += '</div>';
  }
  // 업체 선택 후 또는 전체 보기
  else {
    if (docsViewMode === 'vendor' && docsSelectedVendor) {
      html += '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm p-3">' +
        '<button onclick="docsSelectedVendor = null; renderDocuments();" class="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-2">' +
        '← 업체 목록으로</button>' +
        '<h4 class="text-base font-bold text-slate-900">' + escapeHtml(docsSelectedVendor) + ' (' + filtered.length + '개)</h4>' +
        '</div>';
    }
    
    if (filtered.length === 0) {
      html += '<div class="bg-white rounded-2xl border-2 border-slate-200 py-12 text-center">' +
        '<p class="text-4xl mb-2">📭</p>' +
        '<p class="text-sm text-slate-400">' +
        (documents.length === 0 ? '업로드된 문서가 없습니다' : '조건에 맞는 문서가 없습니다') + '</p>' +
        (documents.length === 0 ? '<button onclick="openUploadDialog()" class="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold">+ 첫 문서 업로드</button>' : '') +
        '</div>';
    } else {
      html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">';
      filtered.forEach(d => {
        const isImage = d.type && d.type.startsWith('image/');
        html += '<div class="bg-white rounded-xl border-2 border-slate-200 overflow-hidden hover:border-purple-400 transition">' +
          '<button onclick="previewDoc(\'' + d.id + '\')" class="w-full aspect-video bg-slate-50 border-b border-slate-200 flex items-center justify-center overflow-hidden">';
        if (isImage) {
          html += '<img src="' + d.data + '" alt="' + escapeHtml(d.name) + '" class="max-w-full max-h-full object-contain" />';
        } else {
          html += '<div class="text-5xl">' + getFileIcon(d.type) + '</div>';
        }
        html += '</button>' +
          '<div class="p-3">' +
          '<p class="text-xs font-bold text-slate-900 truncate" title="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + '</p>' +
          '<div class="flex items-center gap-1 mt-1 mb-2">' +
          '<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">' + escapeHtml(d.category || '기타') + '</span>' +
          '<span class="text-[10px] text-slate-500">' + formatFileSize(d.size) + '</span>' +
          '</div>' +
          '<p class="text-[10px] text-slate-500 truncate">' + escapeHtml(d.vendor || '-') + '</p>' +
          '<p class="text-[10px] text-slate-400">' + new Date(d.uploadDate).toLocaleDateString('ko-KR') + '</p>' +
          '<div class="flex gap-1 mt-2">' +
          '<button onclick="previewDoc(\'' + d.id + '\')" class="flex-1 py-1.5 text-[10px] bg-slate-100 hover:bg-slate-200 rounded font-bold">보기</button>' +
          '<button onclick="downloadDocById(\'' + d.id + '\')" class="flex-1 py-1.5 text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700 rounded font-bold">⬇️</button>' +
          '<button onclick="removeDoc(\'' + d.id + '\')" class="px-2 py-1.5 text-[10px] bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded">🗑️</button>' +
          '</div></div></div>';
      });
      html += '</div>';
    }
  }
  
  html += '</div>';
  document.getElementById('page-content').innerHTML = html;
}

function openUploadDialog() {
  window._pendingUpload = { vendor: '', category: '계약서', note: '', files: [] };
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  let vendorOptions = '<option value="">-- 업체 선택 --</option>';
  vendors.forEach(v => { vendorOptions += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>'; });

  // 오늘 날짜 (로컬 기준, YYYY-MM-DD)
  const now = new Date();
  const todayStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  const html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-purple-50 border-b border-purple-200">' +
    '<h3 class="text-base font-bold text-slate-900">📤 문서 업로드</h3></div>' +
    '<div class="px-5 py-5 space-y-3 overflow-y-auto">' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">업체 *</label>' +
    '<select id="upload-vendor-select" onchange="document.getElementById(\'upload-vendor\').value = this.value" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 mb-2">' + vendorOptions + '</select>' +
    '<input type="text" id="upload-vendor" placeholder="또는 직접 입력" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">문서 종류 *</label>' +
    '<select id="upload-category" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500">' +
    '<option>계약서</option><option>주문서</option><option>거래명세서</option><option>입고문서</option><option>기타</option>' +
    '</select></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">📅 문서 일자</label>' +
    '<input type="date" id="doc-upload-date" value="' + todayStr + '" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">메모 (선택)</label>' +
    '<input type="text" id="upload-note" placeholder="예: 2026년 정기 계약서" class="w-full px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" /></div>' +
    '<div><label class="text-sm font-bold text-slate-700 mb-1 block">파일 *</label>' +
    '<label class="block w-full px-3 py-4 text-xs text-center text-slate-500 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition">' +
    '<div class="text-2xl mb-1">📤</div>' +
    '<p class="font-medium text-slate-600">파일 선택 (여러 개 가능)</p>' +
    '<p class="text-[10px] text-slate-400 mt-1">PDF · 이미지 · 엑셀 · 워드 (5MB 이하)</p>' +
    '<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc,.txt,.hwp,.hwpx" onchange="handleUploadFiles(event)" class="hidden" />' +
    '</label>' +
    '<div id="upload-files-list" class="mt-2 space-y-1"></div>' +
    '</div></div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmUpload()" class="flex-1 py-3 bg-purple-600 text-white rounded-lg font-bold">업로드</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

async function handleUploadFiles(e) {
  const files = Array.from(e.target.files || []);
  if (!window._pendingUpload) window._pendingUpload = { files: [] };
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('"' + file.name + '"은(는) 5MB 초과', 'error');
      continue;
    }
    try {
      const base64 = await readFileAsBase64(file);
      window._pendingUpload.files.push({
        name: file.name, type: file.type, size: file.size, data: base64
      });
    } catch (err) {
      showToast('파일 읽기 실패', 'error');
    }
  }
  e.target.value = '';
  renderUploadFilesList();
}

function renderUploadFilesList() {
  const list = document.getElementById('upload-files-list');
  if (!list || !window._pendingUpload) return;
  const files = window._pendingUpload.files;
  if (files.length === 0) { list.innerHTML = ''; return; }
  let html = '';
  files.forEach((f, idx) => {
    html += '<div class="flex items-center gap-2 px-2 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs">' +
      '<span class="text-base">' + getFileIcon(f.type) + '</span>' +
      '<span class="flex-1 truncate text-slate-700">' + escapeHtml(f.name) + '</span>' +
      '<span class="text-[10px] text-slate-500">' + formatFileSize(f.size) + '</span>' +
      '<button onclick="removeUploadFile(' + idx + ')" class="text-slate-400 hover:text-red-500 px-1">×</button>' +
      '</div>';
  });
  list.innerHTML = html;
}

function removeUploadFile(idx) {
  if (!window._pendingUpload) return;
  window._pendingUpload.files.splice(idx, 1);
  renderUploadFilesList();
}

function confirmUpload() {
  const vendor = (document.getElementById('upload-vendor').value || document.getElementById('upload-vendor-select').value || '').trim();
  const category = document.getElementById('upload-category').value;
  const note = (document.getElementById('upload-note').value || '').trim();

  if (!vendor) {
    showAlert('업체명을 입력해주세요', '업체명은 필수 입력 항목입니다.\n\n위쪽 [업체] 영역에서\n목록에서 선택하거나\n새 업체명을 직접 입력하세요.');
    return;
  }
  if (!window._pendingUpload || window._pendingUpload.files.length === 0) {
    showAlert('파일을 선택해주세요', '업로드할 파일을 1개 이상\n선택해야 등록할 수 있습니다.\n\n[파일 추가] 버튼을 눌러\nPDF/이미지/엑셀 파일을 선택하세요.');
    return;
  }

  // 문서 일자 (사용자 입력값, 빈 값이면 오늘)
  const dateInput = document.getElementById('doc-upload-date');
  const dateStr = dateInput && dateInput.value;
  const docDate = dateStr
    ? new Date(dateStr + 'T00:00:00.000Z').toISOString()
    : new Date().toISOString();

  window._pendingUpload.files.forEach((f, idx) => {
    documents.push({
      id: 'D' + Date.now() + '_' + idx,
      name: f.name,
      type: f.type,
      size: f.size,
      data: f.data,
      uploadDate: docDate,
      vendor: vendor,
      category: category,
      note: note
    });
  });
  
  const cnt = window._pendingUpload.files.length;
  saveAll();
  window._pendingUpload = null;
  closeModal();
  showToast(cnt + '개 문서 업로드 완료');
  renderDocuments();
}

function removeDoc(docId) {
  const doc = documents.find(d => d.id === docId);
  if (!doc) return;
  askConfirm('문서 삭제', '"' + doc.name + '"을(를) 삭제하시겠습니까?', function() {
    documents = documents.filter(d => d.id !== docId);
    saveAll();
    showToast('삭제됨');
    renderDocuments();
  }, '삭제', 'red');
}
