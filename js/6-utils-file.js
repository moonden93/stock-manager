// ============================================
// 6-utils-file.js: 파일 첨부/다운로드 헬퍼
// ============================================
// 의존: 4-utils.js (escapeHtml, escapeJs)
//       99-main.js (showToast, askConfirm, closeModal) - typeof 가드 사용
//       5-storage.js (documents, saveAll)
// 사용처: 9-inbound.js, 12-documents.js

function readFileAsBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getFileIcon(type) {
  if (!type) return '📎';
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📄';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('word') || type.includes('document')) return '📝';
  return '📎';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function downloadDoc(doc) {
  const a = document.createElement('a');
  a.href = doc.data;
  a.download = doc.name;
  a.click();
}

function previewDoc(docId) {
  const doc = documents.find(d => d.id === docId);
  if (!doc) return;
  
  const isImage = doc.type && doc.type.startsWith('image/');
  const isPdf = doc.type && doc.type.includes('pdf');
  
  let body = '';
  if (isImage) {
    body = '<img src="' + doc.data + '" alt="' + escapeHtml(doc.name) + '" class="max-w-full mx-auto" />';
  } else if (isPdf) {
    body = '<iframe src="' + doc.data + '" class="w-full h-[70vh] border border-slate-200 rounded-lg" title="' + escapeHtml(doc.name) + '"></iframe>';
  } else {
    body = '<div class="text-center py-12"><div class="text-6xl mb-4">' + getFileIcon(doc.type) + '</div>' +
      '<p class="text-sm text-slate-700 mb-2">이 형식은 미리보기를 지원하지 않습니다</p>' +
      '<p class="text-xs text-slate-500">다운로드해서 확인해주세요</p></div>';
  }
  
  const html = '<div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-3 border-b flex items-center justify-between gap-2">' +
    '<div class="min-w-0 flex-1">' +
    '<p class="text-base font-bold text-slate-900 truncate">' + escapeHtml(doc.name) + '</p>' +
    '<p class="text-xs text-slate-500">' + escapeHtml(doc.vendor || '-') + ' · ' + escapeHtml(doc.category || '-') + ' · ' + formatFileSize(doc.size) + '</p>' +
    '</div>' +
    '<button onclick="downloadDocById(\'' + doc.id + '\')" class="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg font-bold whitespace-nowrap">⬇️ 다운로드</button>' +
    '<button onclick="closeModal()" class="text-2xl text-slate-400 hover:text-slate-600 px-2">✕</button>' +
    '</div>' +
    '<div class="flex-1 overflow-auto p-4 bg-slate-50">' + body + '</div>' +
    '</div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

function downloadDocById(id) {
  const doc = documents.find(d => d.id === id);
  if (doc) downloadDoc(doc);
}
