// ============================================
// 7-release.js: 반출 화면
// ============================================
// 의존: 모든 이전 모듈
// 호출자: 99-main.js의 switchTab('release')

let releaseSelectedTeam = '';
let releaseSelectedRequester = '';
let releaseSelectedVendor = '';
let releaseSelectedCategory = '';  // 분류 필터
let releaseSearchTerm = '';

// 목록에 없는 품목 직접 요청 (아코디언 + 폼 상태)
let releaseShowCustomForm = false;
// window._pendingCustomItem / window._pendingCustomImages 는 toggleCustomForm 시점에 lazy init

// 이미지 파일 → base64 (직접 요청에서 사진 첨부용)
function readFileAsBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================
// 팀 그리드 레이아웃 정의 (3행 × 5열)
// ============================================
// 각 행은 한 줄에 표시되는 팀들의 배열 (데스크 → 공통 → 의사팀 순서)
// 표준 팀이 없는 경우(사용자가 삭제) 그 자리는 빈 칸으로 둠
// 표준에 없는 사용자 추가 팀은 마지막 "기타" 행에 자동 추가됨
const RELEASE_TEAM_ROWS = [
  ["9층 데스크", "9층 공통", "Dr. 이승주팀", "Dr. 권혜진팀", "Dr. 이수연팀"],
  ["10층 데스크", "10층 공통", "Dr. 병원장팀", "Dr. 이창률팀", "기공실"],
  ["11층 데스크", "11층 공통", "Dr. 이영일팀", "Dr. 정석형팀", "Dr. 김세일팀"]
];

// 표준 팀 평탄화 (사용자 추가 팀 판단용)
function getStandardTeams() {
  const flat = [];
  RELEASE_TEAM_ROWS.forEach(row => row.forEach(t => flat.push(t)));
  return flat;
}

// 현재 검색/벤더 필터를 적용한 inventory 반환
function getReleaseFilteredItems() {
  return inventory.filter(i => {
    if (releaseSelectedVendor && i.vendor !== releaseSelectedVendor) return false;
    if (releaseSelectedCategory && (i.category || '') !== releaseSelectedCategory) return false;
    if (releaseSearchTerm) {
      if (!matchesSearch(i.name, releaseSearchTerm) && !matchesSearch(i.vendor, releaseSearchTerm)) return false;
    }
    return true;
  });
}

// 한 품목 행 HTML (renderRelease, renderReleaseItems 양쪽에서 사용)
function _releaseItemRowHtml(item) {
  const inCart = cart.find(c => c.itemId === item.id);
  const cartQty = inCart ? inCart.qty : 0;
  const stockColor = item.stock === 0 ? 'text-red-600' : item.stock <= item.minStock ? 'text-amber-600' : 'text-slate-700';
  const insufficient = cartQty > item.stock;

  let html = '<div class="px-4 py-3 hover:bg-slate-50 ' + (insufficient ? 'bg-amber-50' : '') + '">' +
    '<div class="flex items-center gap-3">' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-xs text-slate-500">' + categoryBadgeHtml_(item.category) + escapeHtml(item.vendor) + '</p>' +
    '<p class="text-sm font-medium text-slate-900 truncate">' + escapeHtml(item.name) + '</p>' +
    '<p class="text-xs ' + stockColor + ' mt-0.5">재고 <strong>' + item.stock + '</strong>' +
    (item.stock === 0 ? ' · 🔴 품절' : item.stock <= item.minStock ? ' · 🟡 부족' : '') + '</p></div>' +
    '<div class="flex items-center gap-2">';

  if (cartQty > 0) {
    html += '<button onclick="changeCartQty(\'' + item.id + '\', -1)" class="w-10 h-10 bg-slate-200 hover:bg-slate-300 rounded-lg text-xl font-bold">−</button>' +
      '<input type="number" inputmode="numeric" min="1" value="' + cartQty + '" ' +
      'onchange="setCartQty(\'' + item.id + '\', this.value)" ' +
      'onfocus="this.select()" ' +
      'class="w-14 h-10 text-center text-lg font-bold text-teal-700 bg-white border-2 border-teal-200 rounded-lg focus:outline-none focus:border-teal-500" />' +
      '<button onclick="changeCartQty(\'' + item.id + '\', 1)" class="w-10 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xl font-bold">+</button>';
  } else {
    html += '<button onclick="addToCart(\'' + item.id + '\')" class="px-4 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-base font-bold">+ 담기</button>';
  }
  html += '</div></div>' +
    (insufficient ? '<p class="text-xs text-amber-700 mt-1">⚠️ 재고보다 많이 담음</p>' : '') +
    '</div>';
  return html;
}

// 검색 결과 목록 + 카운트만 부분 갱신 (검색 input element를 destroy 안 함 → IME 안전)
function renderReleaseItems() {
  const filtered = getReleaseFilteredItems();
  const countEl = document.getElementById('release-items-count');
  if (countEl) countEl.textContent = filtered.length + '개';
  const listEl = document.getElementById('release-items-list');
  if (!listEl) return;
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    let html = '';
    filtered.forEach(item => { html += _releaseItemRowHtml(item); });
    listEl.innerHTML = html;
  }
}

function renderRelease() {
  const vendors = [...new Set(inventory.map(i => i.vendor))].sort();
  const categories = [...new Set(inventory.map(i => i.category || '').filter(Boolean))].sort();
  const teamRecommendedMembers = (releaseSelectedTeam && teamMembers[releaseSelectedTeam]) || [];
  const filtered = getReleaseFilteredItems();
  
  let html = '<div class="space-y-4">' +
    // Step 1: 팀 선택
    '<div class="bg-white rounded-2xl border-2 ' + (releaseSelectedTeam ? 'border-emerald-300' : 'border-teal-400') + ' shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 ' + (releaseSelectedTeam ? 'bg-emerald-50' : 'bg-teal-50') + ' flex items-center gap-2">' +
    '<span class="w-7 h-7 ' + (releaseSelectedTeam ? 'bg-emerald-500' : 'bg-teal-500') + ' text-white rounded-full flex items-center justify-center font-bold">' + (releaseSelectedTeam ? '✓' : '1') + '</span>' +
    '<h3 class="font-bold text-slate-900">팀 선택</h3>' +
    (releaseSelectedTeam ? '<span class="ml-auto text-sm text-emerald-700 font-bold">' + escapeHtml(releaseSelectedTeam) + '</span>' : '') +
    '</div>' +
    '<div class="p-3 space-y-2">';
  
  // 3행 × 5열 그리드 렌더링
  RELEASE_TEAM_ROWS.forEach(row => {
    html += '<div class="grid grid-cols-5 gap-2">';
    row.forEach(team => {
      // teams 배열(localStorage 기반)에 있는 팀만 활성화, 없으면 흐리게
      const exists = teams.includes(team);
      if (!exists) {
        // 운영자가 삭제한 표준 팀은 빈 칸 처리 (자리 유지)
        html += '<div></div>';
        return;
      }
      const isSelected = releaseSelectedTeam === team;
      html += '<button onclick="selectReleaseTeam(\'' + escapeJs(team) + '\')" class="py-3 px-1 rounded-lg font-bold text-xs sm:text-sm transition ' +
        (isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200') + '">' +
        escapeHtml(team) + '</button>';
    });
    // 행에 빈 자리 채우기 (5칸 미만이면 빈 div로 채워서 정렬 유지)
    for (let i = row.length; i < 5; i++) {
      html += '<div></div>';
    }
    html += '</div>';
  });

  // 표준에 없는 사용자 추가 팀들 (있으면 마지막에 별도 표시)
  const standard = getStandardTeams();
  const extraTeams = teams.filter(t => !standard.includes(t));
  if (extraTeams.length > 0) {
    // 라벨 없이 구분선만 (사용자 추가 팀이 차별감 들지 않도록)
    html += '<div class="pt-2 border-t border-slate-100">' +
      '<div class="grid grid-cols-4 gap-2">';
    extraTeams.forEach(team => {
      const isSelected = releaseSelectedTeam === team;
      html += '<button onclick="selectReleaseTeam(\'' + escapeJs(team) + '\')" class="py-3 px-2 rounded-lg font-bold text-sm transition ' + 
        (isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200') + '">' + 
        escapeHtml(team) + '</button>';
    });
    // 4칸 정렬용 빈 칸
    const remainder = extraTeams.length % 4;
    if (remainder !== 0) {
      for (let i = 0; i < (4 - remainder); i++) html += '<div></div>';
    }
    html += '</div></div>';
  }

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

  // 내 팀 대기 요청 (수정/취소 가능 — 비밀번호 없이) — Step 3 위
  html += renderMyPendingRequestsSection();

  // Step 3: 품목
  html += '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-clip">' +
    '<div class="px-4 py-3 bg-slate-50 flex items-center gap-2">' +
    '<span class="w-7 h-7 bg-slate-400 text-white rounded-full flex items-center justify-center font-bold">3</span>' +
    '<h3 class="font-bold text-slate-900">품목 선택</h3>' +
    '<span class="ml-auto text-xs text-slate-500" id="release-items-count">' + filtered.length + '개</span></div>' +
    '<div class="sticky top-[232px] sm:top-[156px] z-30 bg-white px-3 pt-3 pb-3 shadow-sm">' +
    '<input type="text" value="' + escapeHtml(releaseSearchTerm) + '" ' +
    'oninput="releaseSearchTerm = this.value; renderReleaseItems();" ' +
    'placeholder="🔍 품목명 검색" class="w-full px-4 py-3 text-base bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" /></div>' +
    '<div class="px-3 py-3 border-b border-slate-100"><p class="text-xs text-slate-500 mb-2">업체:</p>' +
    '<div class="flex flex-wrap gap-1">' +
    '<button onclick="releaseSelectedVendor = \'\'; renderRelease();" class="px-3 py-1.5 text-sm rounded-full ' +
    (!releaseSelectedVendor ? 'bg-teal-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
  
  vendors.forEach(v => {
    html += '<button onclick="releaseSelectedVendor = \'' + escapeJs(v) + '\'; renderRelease();" class="px-3 py-1.5 text-sm rounded-full ' +
      (releaseSelectedVendor === v ? 'bg-teal-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(v) + '</button>';
  });
  html += '</div>';
  // 분류 필터 (업체 아래)
  if (categories.length > 0) {
    html += '<p class="text-xs text-slate-500 mt-3 mb-2">분류:</p>' +
      '<div class="flex flex-wrap gap-1">' +
      '<button onclick="releaseSelectedCategory = \'\'; renderRelease();" class="px-3 py-1.5 text-sm rounded-full ' +
      (!releaseSelectedCategory ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">전체</button>';
    categories.forEach(c => {
      html += '<button onclick="releaseSelectedCategory = \'' + escapeJs(c) + '\'; renderRelease();" class="px-3 py-1.5 text-sm rounded-full ' +
        (releaseSelectedCategory === c ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(c) + '</button>';
    });
    html += '</div>';
  }
  html += '</div>';

  // ── 목록에 없는 품목 직접 요청 (버튼 + 펼침 폼) ──
  html += '<div class="px-3 py-3 border-b border-slate-100">' +
    '<button onclick="toggleCustomForm()" class="block mx-auto px-5 py-3 ' +
    (releaseShowCustomForm
      ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
      : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm') +
    ' rounded-xl font-bold text-sm transition">' +
    (releaseShowCustomForm ? '✕ 직접 요청 닫기' : '📌 목록에 없는 품목 직접 요청') +
    '</button>' +
    (releaseShowCustomForm ? renderCustomItemForm() : '') +
    '</div>';

  html += '<div id="release-items-list" class="divide-y divide-slate-100">';
  if (filtered.length === 0) {
    html += '<div class="py-12 text-center text-slate-400">검색 결과 없음</div>';
  } else {
    filtered.forEach(item => { html += _releaseItemRowHtml(item); });
  }
  // items 목록 + 카드 + 루트 종료
  html += '</div></div></div>';

  document.getElementById('page-content').innerHTML = html;
  renderCartBar();
}

// 직접 요청 폼 HTML 생성 (state는 window._pendingCustomItem / _pendingCustomImages 에서)
function renderCustomItemForm() {
  const draft = window._pendingCustomItem || { name: '', vendor: '', qty: 1, unit: '', description: '' };
  const images = window._pendingCustomImages || [];

  let imagePreview = '';
  if (images.length > 0) {
    imagePreview = '<div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">';
    images.forEach((img, idx) => {
      imagePreview += '<div class="relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">' +
        '<img src="' + img.data + '" alt="' + escapeHtml(img.name) + '" class="w-full h-full object-cover" />' +
        '<button onclick="removeCustomImage(' + idx + ')" class="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>' +
        '</div>';
    });
    imagePreview += '</div>';
  }

  return '<div class="px-4 pb-4 space-y-3 bg-slate-50/50">' +
    // 품목명
    '<div><label class="text-xs font-bold text-slate-700 mb-1 block">품목명 <span class="text-red-500">*</span></label>' +
    '<input type="text" id="custom-name" value="' + escapeHtml(draft.name) + '" ' +
    'oninput="window._pendingCustomItem.name = this.value" ' +
    'placeholder="예: 새로운 임플란트 드릴" class="w-full px-3 py-2.5 text-base bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div>' +

    // 업체 + 수량/단위 (반응형: 모바일 1열, sm 2열)
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
    '<div><label class="text-xs font-bold text-slate-700 mb-1 block">업체명</label>' +
    '<input type="text" id="custom-vendor" value="' + escapeHtml(draft.vendor) + '" ' +
    'oninput="window._pendingCustomItem.vendor = this.value" ' +
    'placeholder="아는 경우 입력 (예: 새한치재)" class="w-full px-3 py-2.5 text-base bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<div><label class="text-xs font-bold text-slate-700 mb-1 block">수량 <span class="text-red-500">*</span></label>' +
    '<input type="number" id="custom-qty" value="' + (draft.qty || 1) + '" min="1" ' +
    'oninput="window._pendingCustomItem.qty = parseInt(this.value) || 1" ' +
    'class="w-full px-3 py-2.5 text-base bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div>' +
    '<div><label class="text-xs font-bold text-slate-700 mb-1 block">단위</label>' +
    '<input type="text" id="custom-unit" value="' + escapeHtml(draft.unit) + '" ' +
    'oninput="window._pendingCustomItem.unit = this.value" ' +
    'placeholder="ea, box" class="w-full px-3 py-2.5 text-base bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />' +
    '</div>' +
    '</div>' +
    '</div>' +

    // 설명
    '<div><label class="text-xs font-bold text-slate-700 mb-1 block">상세 설명</label>' +
    '<textarea id="custom-desc" rows="3" ' +
    'oninput="window._pendingCustomItem.description = this.value" ' +
    'placeholder="제품의 특징, 규격, 용도 등을 자세히 적어주세요" ' +
    'class="w-full px-3 py-2.5 text-base bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-teal-500">' +
    escapeHtml(draft.description) + '</textarea></div>' +

    // 사진
    '<div><label class="text-xs font-bold text-slate-700 mb-1 block">참고 사진</label>' +
    '<label class="block w-full px-3 py-3 text-xs text-center text-slate-500 bg-white border-2 border-dashed border-slate-300 rounded-xl hover:border-teal-400 hover:bg-teal-50 cursor-pointer transition">' +
    '<div class="text-2xl mb-1">📸</div>' +
    '<p class="font-medium">사진 추가 (여러 장 가능, 각 5MB 이하)</p>' +
    '<input type="file" multiple accept="image/*" onchange="handleCustomImages(event)" class="hidden" />' +
    '</label>' +
    imagePreview +
    '</div>' +

    // 추가 버튼
    '<button onclick="addCustomItemToCart()" class="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold">+ 장바구니에 추가</button>' +
    '</div>';
}

// 아코디언 토글 (열 때 임시 저장소 lazy init)
function toggleCustomForm() {
  releaseShowCustomForm = !releaseShowCustomForm;
  if (releaseShowCustomForm) {
    if (!window._pendingCustomItem) {
      window._pendingCustomItem = { name: '', vendor: '', qty: 1, unit: '', description: '' };
    }
    if (!window._pendingCustomImages) {
      window._pendingCustomImages = [];
    }
  }
  renderRelease();
}

// 사진 업로드 처리
async function handleCustomImages(e) {
  const files = Array.from(e.target.files || []);
  if (!window._pendingCustomImages) window._pendingCustomImages = [];
  for (const file of files) {
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('"' + file.name + '"은(는) 이미지 파일이 아닙니다', 'error');
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('"' + file.name + '"은(는) 5MB 초과', 'error');
      continue;
    }
    try {
      const base64 = await readFileAsBase64(file);
      window._pendingCustomImages.push({
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
  renderRelease();
}

function removeCustomImage(idx) {
  if (!window._pendingCustomImages) return;
  window._pendingCustomImages.splice(idx, 1);
  renderRelease();
}

// 직접 요청 항목을 cart에 추가
function addCustomItemToCart() {
  const draft = window._pendingCustomItem || {};
  const name = (draft.name || '').trim();
  const qty = parseInt(draft.qty) || 0;
  if (!name) {
    showAlert('품목명을 입력해주세요', '직접 요청할 품목의 이름을 적어주세요.\n\n예: 새로운 임플란트 드릴');
    setTimeout(() => { const el = document.getElementById('custom-name'); if (el) el.focus(); }, 50);
    return;
  }
  if (qty < 1) {
    showAlert('수량을 입력해주세요', '수량은 1 이상이어야 합니다.\n\n+ / − 버튼으로 조정하거나\n숫자를 직접 입력하세요.');
    setTimeout(() => { const el = document.getElementById('custom-qty'); if (el) { el.focus(); el.select(); } }, 50);
    return;
  }

  const customId = 'CUSTOM_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const images = (window._pendingCustomImages || []).slice();

  cart.push({
    itemId: customId,
    qty: qty,
    vendor: (draft.vendor || '').trim(),
    name: name,
    unit: (draft.unit || '').trim(),
    stock: 0,
    isCustom: true,
    customDescription: (draft.description || '').trim(),
    customImages: images
  });

  // 폼 초기화 + 아코디언 자동 닫기
  window._pendingCustomItem = { name: '', vendor: '', qty: 1, unit: '', description: '' };
  window._pendingCustomImages = [];
  releaseShowCustomForm = false;
  showToast('직접 요청 항목 담김: ' + name);
  renderRelease();
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

// 직접 입력으로 수량 설정 (input type=number의 onchange 핸들러)
function setCartQty(itemId, value) {
  const idx = cart.findIndex(c => c.itemId === itemId);
  if (idx === -1) return;
  let qty = parseInt(value, 10);
  if (isNaN(qty) || qty < 1) qty = 1;  // 0 이하 입력 → 1로 보정 (제거하려면 - 버튼)
  cart[idx].qty = qty;
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
      (c.isCustom ? '<span title="직접 요청">🆕</span>' : '') +
      '<span class="font-medium">' + escapeHtml(c.name) + '</span>' +
      '<span class="font-bold text-teal-700">' + c.qty + '</span>' +
      '<button onclick="removeFromCart(\'' + escapeJs(c.itemId) + '\')" class="text-slate-400 hover:text-red-500 ml-1">×</button>' +
      '</div>';
  });
  inner += '</div>' +
    '<div class="flex items-center gap-3">' +
    '<div class="flex-1"><p class="text-xs text-slate-500">담은 품목 ' + cart.length + '종 · 총 ' + totalQty + '개</p>' +
    (!canSubmit ? '<p class="text-xs text-amber-600 font-medium">⚠️ ' + (!releaseSelectedTeam ? '팀 선택' : '담당자 입력') + ' 필요</p>' : '') + '</div>' +
    '<button onclick="cart = []; window._cartMemo = \'\'; renderRelease();" class="px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700">취소</button>' +
    '<button onclick="confirmRelease()" class="big-btn flex-1 max-w-[240px] ' +
    (canSubmit ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-300 hover:bg-slate-400 text-slate-700') + '">' +
    '📋 반출 요청 (' + totalQty + '개)</button>' +
    '</div></div>';
  cartBar.innerHTML = inner;
}

function updateCartBar() {
  renderCartBar();
}

function confirmRelease() {
  if (cart.length === 0) {
    showAlert('담은 품목이 없습니다', '아래 [3. 품목 선택]에서\n+ 담기 버튼을 눌러 품목을 추가해주세요.\n\n목록에 없는 품목은\n📌 목록에 없는 품목 직접 요청 버튼을 사용하세요.');
    return;
  }
  if (!releaseSelectedTeam) {
    showAlert('팀을 선택해주세요', '먼저 사용할 팀을 선택해야 요청할 수 있습니다.\n\n맨 위 [1. 팀 선택]에서\n해당 팀 버튼을 눌러주세요.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (!releaseSelectedRequester || !releaseSelectedRequester.trim()) {
    showAlert('담당자를 입력해주세요', '요청 담당자가 비어 있습니다.\n\n[2. 요청 담당자]에서\n빠른 선택 버튼을 누르거나\n담당자 이름을 직접 입력하세요.');
    setTimeout(() => { const el = document.getElementById('requester-input'); if (el) el.focus(); }, 50);
    return;
  }
  
  // 메모 입력이 포함된 커스텀 confirm 모달
  showRequestConfirmModal();
}

// 반출 요청 등록 confirm 모달 (메모 입력 포함)
function showRequestConfirmModal() {
  const totalQty = cart.reduce(function(s, c) { return s + c.qty; }, 0);
  let itemsHtml = '';
  cart.forEach(function(c) {
    itemsHtml += '<div class="flex justify-between text-sm py-1">' +
      '<span class="text-slate-700">· ' + escapeHtml(c.name) + '</span>' +
      '<span class="font-bold text-teal-700">' + c.qty + escapeHtml(c.unit || '개') + '</span>' +
      '</div>';
  });

  // 오늘 날짜 (KST)
  const now = new Date();
  const dowKor = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  const dateStr = now.getFullYear() + '. ' + (now.getMonth() + 1) + '. ' + now.getDate() + '. (' + dowKor + ')';

  const html =
    '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-teal-50 border-b border-teal-200">' +
    '<h3 class="text-base font-bold text-slate-900">반출 요청 등록</h3>' +
    '<p class="text-xs text-slate-600 mt-1">[' + escapeHtml(releaseSelectedTeam) + '] ' +
    escapeHtml(releaseSelectedRequester) + '님 · ' + dateStr + '</p>' +
    '</div>' +
    '<div class="px-5 py-4 overflow-y-auto">' +
    '<div class="border border-slate-200 rounded-lg p-3 bg-slate-50 mb-3">' +
    itemsHtml +
    '<div class="border-t border-slate-200 mt-2 pt-2 flex justify-between text-sm font-bold">' +
    '<span class="text-slate-700">총</span>' +
    '<span class="text-teal-700">' + cart.length + '종 · ' + totalQty + '개</span>' +
    '</div>' +
    '</div>' +
    '<div>' +
    '<label class="text-xs font-bold text-slate-700 mb-1 block">📝 메모 (선택)</label>' +
    '<textarea id="confirm-memo" rows="3" maxlength="300" autofocus ' +
    'placeholder="예: 문치과 화이팅" ' +
    'class="w-full px-3 py-2 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg resize-none focus:outline-none focus:border-teal-500"></textarea>' +
    '</div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">아니오</button>' +
    '<button onclick="submitRequest()" class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold">예, 요청</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

// 모달의 [예, 요청] 버튼 핸들러
function submitRequest() {
  const memo = (document.getElementById('confirm-memo').value || '').trim();
  closeModal();
  doSubmitRequest(memo);
}

function doSubmitRequest(memo) {
  if (cart.length === 0) return;
  const reqId = 'R' + Date.now();
  const reqDate = new Date().toISOString();
  {

    // 요청만 등록 (재고 차감/이력 기록 안 함)
    cart.forEach(c => {
      const reqRecord = {
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
        requester: releaseSelectedRequester,
        memo: memo  // 같은 그룹 모든 항목에 동일 메모
      };
      // 직접 요청 항목: 설명 + 사진 보존
      if (c.isCustom) {
        reqRecord.isCustom = true;
        reqRecord.customDescription = c.customDescription || '';
        reqRecord.customImages = c.customImages || [];
      }
      requests.push(reqRecord);
      // Phase 2 — 즉시 컬렉션에 쓰기 (디바운스 우회로 실시간 반영 보장)
      if (typeof upsertRequestDoc === 'function') {
        upsertRequestDoc(reqRecord);
      }
      // Phase 1: 모든 요청 생성을 audit log에 영구 기록
      if (typeof logEvent === 'function') {
        logEvent('request', 'create', {
          summary: '[' + reqRecord.team + '] ' + reqRecord.requester + ' 요청: ' + reqRecord.name + ' x ' + reqRecord.qty,
          requestId: reqRecord.id,
          team: reqRecord.team,
          requester: reqRecord.requester,
          item: reqRecord.name,
          qty: reqRecord.qty,
          vendor: reqRecord.vendor,
          isCustom: !!reqRecord.isCustom
        });
      }
    });

    saveAll();
    updateHeaderStats();
    const totalQty = cart.reduce((s, c) => s + c.qty, 0);
    showToast('반출 요청 등록 완료! ' + cart.length + '종 ' + totalQty + '개 (요청관리에서 처리하세요)', 'success');
    cart = [];
    window._cartMemo = '';
    releaseSearchTerm = '';
    releaseSelectedVendor = '';
    releaseSelectedCategory = '';
    renderRelease();
  }
}

// ============================================
// 내 팀 대기 요청 — 요청 탭에서 수정/취소 가능
// ============================================
// 비밀번호 없이 직원이 자기 요청 수정 가능. 변경은 audit log 기록.
function renderMyPendingRequestsSection() {
  if (!releaseSelectedTeam) {
    // 팀 선택 전에도 섹션은 보여서 "여기 있어요" 인식되게 (안내 메시지)
    return '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 bg-slate-50 flex items-center gap-2">' +
      '<span class="w-7 h-7 bg-slate-300 text-white rounded-full flex items-center justify-center font-bold text-xs">⏳</span>' +
      '<h3 class="font-bold text-slate-900">요청관리</h3>' +
      '</div>' +
      '<div class="px-4 py-6 text-center text-sm text-slate-400">위에서 팀을 선택하면 해당 팀의 대기 요청이 보여요</div>' +
      '</div>';
  }
  const teamPending = requests.filter(r =>
    r.team === releaseSelectedTeam && (r.status || 'completed') === 'pending'
  );
  if (teamPending.length === 0) {
    return '<div class="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 bg-slate-50 flex items-center gap-2">' +
      '<span class="w-7 h-7 bg-slate-300 text-white rounded-full flex items-center justify-center font-bold text-xs">⏳</span>' +
      '<h3 class="font-bold text-slate-900">요청관리</h3>' +
      '<span class="ml-auto text-xs text-slate-500">' + escapeHtml(releaseSelectedTeam) + '</span>' +
      '</div>' +
      '<div class="px-4 py-6 text-center text-sm text-slate-400">대기 중인 요청 없음</div>' +
      '</div>';
  }

  // requestId 별로 그룹핑
  const groups = {};
  teamPending.forEach(r => {
    const gid = r.requestId || r.id;
    if (!groups[gid]) groups[gid] = { items: [], date: r.date, requester: r.requester || r.member, memo: r.memo || '' };
    groups[gid].items.push(r);
    if (!groups[gid].memo && r.memo) groups[gid].memo = r.memo;
  });
  const groupArr = Object.entries(groups)
    .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));

  let html = '<div class="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">' +
    '<div class="px-4 py-3 bg-amber-50 flex items-center gap-2">' +
    '<span class="w-7 h-7 bg-amber-500 text-white rounded-full flex items-center justify-center font-bold text-xs">⏳</span>' +
    '<h3 class="font-bold text-slate-900">요청관리</h3>' +
    '<span class="text-xs text-slate-700">' + escapeHtml(releaseSelectedTeam) + ' 대기 ' + groupArr.length + '건</span>' +
    '<span class="ml-auto text-[11px] text-slate-500">수정/취소 가능</span>' +
    '</div>' +
    '<div class="divide-y divide-slate-100">';

  groupArr.forEach(([gid, g]) => {
    const dateStr = (g.date || '').slice(0, 10);
    const totalQty = g.items.reduce((s, it) => s + (it.qty || 0), 0);
    html += '<div class="px-4 py-3">' +
      '<div class="flex items-center gap-2 mb-2 flex-wrap">' +
      '<span class="text-xs text-slate-500">' + dateStr + '</span>' +
      '<span class="text-xs font-bold text-slate-700">' + escapeHtml(g.requester || '') + '</span>' +
      '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[11px] font-bold">' + g.items.length + '종 · ' + totalQty + '개</span>' +
      '<div class="ml-auto flex gap-1">' +
      '<button onclick="openEditMyRequest(\'' + escapeJs(gid) + '\')" class="text-[11px] px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded font-bold">✏️ 수정</button>' +
      '<button onclick="cancelMyRequest(\'' + escapeJs(gid) + '\')" class="text-[11px] px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold">🗑️ 취소</button>' +
      '</div>' +
      '</div>' +
      '<div class="text-xs text-slate-700 space-y-0.5">';
    g.items.forEach(it => {
      html += '<div>· ' + escapeHtml(it.name) + ' <strong>' + it.qty + '</strong>' + (it.unit ? escapeHtml(it.unit) : '개') + '</div>';
    });
    if (g.memo) {
      html += '<div class="mt-2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700">📝 ' + escapeHtml(g.memo) + '</div>';
    }
    html += '</div></div>';
  });
  html += '</div></div>';
  return html;
}

// 수정 모달
function openEditMyRequest(groupId) {
  const items = requests.filter(r =>
    (r.requestId || r.id) === groupId && (r.status || 'completed') === 'pending'
  );
  if (items.length === 0) return;
  const memo = items.find(it => it.memo) ? items.find(it => it.memo).memo : '';

  let html = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="closeModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col" onclick="event.stopPropagation()">' +
    '<div class="px-5 py-4 bg-blue-50 border-b border-blue-200">' +
    '<h3 class="text-base font-bold text-slate-900">✏️ 요청 수정</h3>' +
    '<p class="text-xs text-slate-500 mt-1">' + escapeHtml(items[0].team) + ' / ' + escapeHtml(items[0].requester || '') + '</p></div>' +
    '<div class="px-5 py-4 space-y-3 overflow-y-auto">';

  items.forEach((it, idx) => {
    html += '<div class="border border-slate-200 rounded-lg p-3">' +
      '<p class="text-sm font-medium text-slate-900">' + escapeHtml(it.name) + '</p>' +
      '<p class="text-[11px] text-slate-500 mb-2">' + escapeHtml(it.vendor) + '</p>' +
      '<div class="flex items-center gap-2">' +
      '<span class="text-xs text-slate-600">수량:</span>' +
      '<input type="number" id="edit-req-qty-' + idx + '" data-id="' + escapeJs(it.id) + '" value="' + it.qty + '" min="1" inputmode="numeric" ' +
      'class="w-20 h-9 text-center text-sm font-bold bg-slate-50 border-2 border-slate-200 rounded focus:outline-none focus:border-blue-500" />' +
      '<span class="text-xs text-slate-500">' + escapeHtml(it.unit || '개') + '</span>' +
      '</div></div>';
  });

  html += '<div>' +
    '<label class="text-xs font-bold text-slate-700 mb-1 block">📝 메모 (선택)</label>' +
    '<textarea id="edit-req-memo" rows="3" maxlength="300" ' +
    'class="w-full px-3 py-2 text-sm bg-slate-50 border-2 border-slate-200 rounded-lg resize-none focus:outline-none focus:border-blue-500">' +
    escapeHtml(memo) + '</textarea>' +
    '</div>' +
    '</div>' +
    '<div class="px-5 py-3 bg-slate-50 border-t flex gap-2">' +
    '<button onclick="closeModal()" class="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700">취소</button>' +
    '<button onclick="saveMyRequestEdit(\'' + escapeJs(groupId) + '\')" class="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold">저장</button>' +
    '</div></div></div>';
  document.getElementById('modal-container').innerHTML = html;
}

function saveMyRequestEdit(groupId) {
  const items = requests.filter(r =>
    (r.requestId || r.id) === groupId && (r.status || 'completed') === 'pending'
  );
  if (items.length === 0) { closeModal(); return; }
  const newMemo = (document.getElementById('edit-req-memo').value || '').trim();
  const changes = [];
  const editAt = new Date().toISOString();

  items.forEach((it, idx) => {
    const input = document.getElementById('edit-req-qty-' + idx);
    if (!input) return;
    const newQty = parseInt(input.value, 10);
    if (isNaN(newQty) || newQty < 1) return;
    const oldMemo = it.memo || '';
    const qtyChanged = (newQty !== it.qty);
    const memoChanged = (oldMemo !== newMemo);
    if (qtyChanged || memoChanged) {
      // 수정 이력을 항목에 직접 보존 (반출관리에서 표시)
      if (!Array.isArray(it.editHistory)) it.editHistory = [];
      it.editHistory.push({
        at: editAt,
        qtyFrom: it.qty,
        qtyTo: newQty,
        memoFrom: oldMemo,
        memoTo: newMemo,
        by: it.requester || it.member || '본인'
      });
      if (qtyChanged) {
        changes.push({ name: it.name, before: it.qty, after: newQty });
        it.qty = newQty;
      }
      it.memo = newMemo;
    }
  });

  // audit log
  if (typeof logEvent === 'function') {
    logEvent('request', 'update', {
      summary: '수정: [' + items[0].team + '] ' + (items[0].requester || '') +
               ' (' + changes.length + '개 항목 변경)',
      requestId: groupId,
      team: items[0].team,
      requester: items[0].requester || '',
      qtyChanges: changes,
      newMemo: newMemo
    });
  }

  saveAll();
  closeModal();
  showToast('요청 수정 완료', 'success');
  renderRelease();
}

function cancelMyRequest(groupId) {
  const items = requests.filter(r =>
    (r.requestId || r.id) === groupId && (r.status || 'completed') === 'pending'
  );
  if (items.length === 0) return;
  const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0);

  askConfirm('요청 취소',
    items[0].requester + '님의 대기 요청을 취소합니다.\n\n' +
    items.length + '종 ' + totalQty + '개\n\n취소된 요청은 반출관리에서 기록으로 남습니다.\n계속하시겠습니까?',
    function() {
      // 소프트 취소: 데이터 보존, status만 변경
      const cancelledAt = new Date().toISOString();
      const cancelledBy = items[0].requester || items[0].member || '본인';
      items.forEach(it => {
        it.status = 'cancelled';
        it.cancelledDate = cancelledAt;
        it.cancelledBy = cancelledBy;
      });
      // audit log
      if (typeof logEvent === 'function') {
        logEvent('request', 'cancel_by_requester', {
          summary: '요청자 본인 취소: [' + items[0].team + '] ' + (items[0].requester || '') +
                   ' ' + items.length + '종 ' + totalQty + '개',
          team: items[0].team,
          requester: items[0].requester || '',
          items: items.map(it => ({
            id: it.id, requestId: it.requestId, item: it.name, qty: it.qty,
            vendor: it.vendor, unit: it.unit, date: it.date, memo: it.memo || ''
          }))
        });
      }
      saveAll();
      showToast('요청 취소됨 (반출관리에 기록 보존)');
      renderRelease();
    }, '예, 취소', 'red');
}
