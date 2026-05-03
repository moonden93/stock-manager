// ============================================
// 15-backup.js: 주간 자동 이메일 백업 (FormSubmit 사용)
// ============================================
// 의존: 5-storage.js (모든 데이터 전역 변수)
//       SheetJS(XLSX) (Excel 생성)
// 호출자: 99-main.js initApp 후
//
// 동작:
//   - 앱 시작 시 "이번 주(ISO week) 발송 안 했으면" 자동으로 백업 메일 발송
//   - localStorage에 마지막 발송 주차 기록 → 같은 주에 중복 발송 안 함
//   - 실패 시 lastSent 안 갱신 → 다음 앱 열 때 자동 재시도
//   - 콘솔에서 mcSendBackupNow() 호출하면 강제 발송 (테스트용)
//
// 첫 발송 시 FormSubmit에서 받은이 이메일로 "Activate Form" 메일이 옴.
// 그 안의 활성화 링크를 한 번 클릭해야 이후 발송이 정상 도착함.

// FormSubmit 해시 토큰 — 받은이 이메일을 노출하지 않기 위한 익명 식별자.
// FormSubmit 활성화 메일에서 발급받음. 이 토큰이 moonden93@gmail.com에 매핑됨.
const FORMSUBMIT_TOKEN = '23c157956a65820f31b77fd1e87dd9c7';
// 일반(non-AJAX) 엔드포인트만 파일 첨부 지원함. AJAX 엔드포인트는 텍스트만 가능.
// no-cors 모드로 보내야 CORS 에러 안 남 — 응답은 읽을 수 없지만 요청은 정상 전송됨.
const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/' + FORMSUBMIT_TOKEN;
const LAST_BACKUP_KEY = 'mc_last_backup_week';
// 같은 주 중복 발송 안전장치: 강제 발송이라도 5분 안엔 재발송 안 됨
const LAST_BACKUP_TIME_KEY = 'mc_last_backup_time';
const MIN_RESEND_MS = 5 * 60 * 1000;

// ISO 8601 주차 계산 (월요일 시작) — "2026-W18" 형식
function getIsoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // 목요일로 이동 (ISO 주는 그 주의 목요일이 속한 해의 주차)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

// force=true면 같은 주 체크는 우회. 단 5분 안 재발송은 항상 차단 (안전장치).
async function tryWeeklyBackup(force) {
  // 보호: Firebase 동기화 안 된 상태에선 백업 보류 (불완전한 데이터로 백업하지 않음)
  if (!window.firebaseReady) return;
  if (!Array.isArray(inventory) || inventory.length === 0) return;

  const thisWeek = getIsoWeek(new Date());
  const lastSent = localStorage.getItem(LAST_BACKUP_KEY);
  if (!force && lastSent === thisWeek) {
    console.log('📧 이번 주(' + thisWeek + ') 백업 이미 발송됨 — 건너뜀');
    return;
  }

  // 5분 쿨다운 (force여도 적용) — 실수로 여러 번 호출해도 메일 1개만 가도록
  const lastTime = parseInt(localStorage.getItem(LAST_BACKUP_TIME_KEY) || '0', 10);
  const elapsed = Date.now() - lastTime;
  if (elapsed < MIN_RESEND_MS) {
    const wait = Math.ceil((MIN_RESEND_MS - elapsed) / 1000);
    console.log('⏱️ 너무 빨리 재발송 — ' + wait + '초 후 다시 시도하세요');
    if (typeof showToast === 'function') {
      showToast('백업 쿨다운: ' + wait + '초 후 가능', 'info');
    }
    return;
  }

  try {
    console.log('📧 주간 백업 발송 시작 (' + thisWeek + ')');
    // 발송 시도 직전 시간 기록 — 호출이 동시에 두 번 와도 한 번만 진행되게
    localStorage.setItem(LAST_BACKUP_TIME_KEY, String(Date.now()));
    const blob = generateBackupExcel(thisWeek);
    await sendBackupEmail(thisWeek, blob);
    localStorage.setItem(LAST_BACKUP_KEY, thisWeek);
    console.log('✅ 주간 백업 발송 요청 완료');
    if (typeof showToast === 'function') {
      showToast('주간 백업 메일 발송 (' + thisWeek + ')', 'success');
    }
  } catch (err) {
    console.error('❌ 주간 백업 실패:', err);
    if (typeof showToast === 'function') {
      showToast('주간 백업 실패: ' + (err.message || ''), 'error');
    }
    // lastSent 갱신 안 함 → 다음 앱 열 때 재시도
  }
}

// 전체 데이터를 다중 시트 Excel로 생성
function generateBackupExcel(weekKey) {
  if (typeof XLSX === 'undefined') {
    throw new Error('XLSX 라이브러리 로드 안 됨');
  }

  const wb = XLSX.utils.book_new();
  const now = new Date();

  // ─── 시트 1: 요약 ─────────────────────────────
  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const memberCount = Object.values(teamMembers).reduce((s, m) => s + (m ? m.length : 0), 0);

  const summary = [
    ['문치과병원 재고관리 - 주간 자동 백업'],
    [],
    ['백업 주차', weekKey],
    ['추출일시', now.toLocaleString('ko-KR')],
    [],
    ['── 현황 요약 ──'],
    ['품목 수', inventory.length],
    ['  품절', outOfStock],
    ['  부족', lowStock],
    ['재고 평가액(원)', totalCost],
    ['누적 입출고 이력', history.length],
    ['반출 요청', requests.length],
    ['  대기 중', requests.filter(r => r.status === 'pending').length],
    ['팀 수', teams.length],
    ['담당자 수', memberCount],
    ['문서 수', documents.length],
    [],
    ['※ 이 백업으로 전체 데이터 복원 가능 (문서 첨부파일 본문은 제외, 메타데이터만)']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '요약');

  // ─── 시트 2: 품목 ─────────────────────────────
  const invRows = [['ID', '업체', '품명', '단위', '단가(원)', '재고', '부족기준', '카테고리']];
  inventory.forEach(it => {
    invRows.push([
      it.id || '', it.vendor || '', it.name || '', it.unit || '',
      it.price || 0, it.stock || 0, it.minStock || 0, it.category || ''
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), '품목');

  // ─── 시트 3: 입출고 이력 ─────────────────────
  const histRows = [['ID', '날짜', '주차', '구분', '팀', '담당자', '업체', '품명', '단위', '수량', '단가(원)']];
  history.forEach(h => {
    histRows.push([
      h.id || '', h.date || '', h.weekKey || '', h.type || '',
      h.team || '', h.member || '', h.vendor || '', h.name || '',
      h.unit || '', h.qty || 0, h.price || 0
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(histRows), '입출고이력');

  // ─── 시트 4: 반출 요청 ───────────────────────
  const reqRows = [['ID', '날짜', '상태', '팀', '담당자', '품목수', '메모']];
  requests.forEach(r => {
    const itemCount = Array.isArray(r.items) ? r.items.length : 0;
    reqRows.push([
      r.id || '', r.date || '', r.status || '',
      r.team || '', r.member || '', itemCount, r.memo || ''
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reqRows), '반출요청');

  // ─── 시트 5: 팀/담당자 ───────────────────────
  const teamRows = [['팀명', '담당자', '대표 여부']];
  teams.forEach(t => {
    const members = teamMembers[t] || [];
    if (members.length === 0) {
      teamRows.push([t, '(없음)', '']);
    } else {
      members.forEach((m, i) => {
        teamRows.push([t, m, i === 0 ? '⭐' : '']);
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(teamRows), '팀_담당자');

  // ─── 시트 6: 문서 메타데이터 (실제 파일은 제외) ──
  const docRows = [['ID', '업체', '파일명', '타입', '크기(byte)', '업로드일']];
  documents.forEach(d => {
    docRows.push([
      d.id || '', d.vendor || '', d.name || '',
      d.type || '', d.size || 0, d.uploadedAt || ''
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(docRows), '문서_메타');

  // ─── 시트 7: 원본 JSON (전체 복원용) ──────────
  // 한 셀에 통째로 — Excel 셀 32K 제한 때문에 여러 셀로 분할해야 할 수도 있음.
  // documents의 base64 data는 제외하고 JSON 생성.
  const docsLite = documents.map(d => ({
    id: d.id, vendor: d.vendor, name: d.name,
    type: d.type, size: d.size, uploadedAt: d.uploadedAt
    // data 필드 (base64) 제외
  }));
  const fullJson = JSON.stringify({
    version: 1,
    weekKey: weekKey,
    extractedAt: now.toISOString(),
    inventory, history, requests, teams, teamMembers,
    documents: docsLite
  });

  // 32KB 단위로 청크 분할
  const CHUNK = 30000;
  const jsonRows = [['JSON 청크 (복원 시 모두 이어붙여 사용)'], []];
  for (let i = 0; i < fullJson.length; i += CHUNK) {
    jsonRows.push([fullJson.slice(i, i + CHUNK)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jsonRows), '원본_JSON');

  // Blob 생성
  const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

async function sendBackupEmail(weekKey, blob) {
  const today = new Date().toLocaleDateString('ko-KR');
  const filename = '재고관리_백업_' + weekKey + '.xlsx';

  // 본문에 들어갈 요약 통계
  const totalCost = inventory.reduce((s, it) => s + (it.stock || 0) * (it.price || 0), 0);
  const lowStock = inventory.filter(it => it.stock > 0 && it.stock <= it.minStock).length;
  const outOfStock = inventory.filter(it => it.stock === 0).length;
  const pendingReq = requests.filter(r => r.status === 'pending').length;
  const thisWeekHist = history.filter(h => h.type === 'out' && h.weekKey === weekKey);
  const thisWeekQty = thisWeekHist.reduce((s, h) => s + (h.qty || 0), 0);
  const thisWeekCost = thisWeekHist.reduce((s, h) => s + (h.qty || 0) * (h.price || 0), 0);

  const message = [
    '문치과병원 재고관리 시스템 - 주간 자동 백업',
    '═══════════════════════════════════════',
    '',
    '백업 주차: ' + weekKey,
    '발송일: ' + today,
    '',
    '【 현황 요약 】',
    '· 등록 품목: ' + inventory.length + '개 (품절 ' + outOfStock + ', 부족 ' + lowStock + ')',
    '· 재고 평가액: ' + totalCost.toLocaleString() + '원',
    '· 누적 이력: ' + history.length + '건',
    '· 대기 중 요청: ' + pendingReq + '건',
    '',
    '【 이번 주 출고 】',
    '· 건수: ' + thisWeekHist.length + '건',
    '· 수량: ' + thisWeekQty + '개',
    '· 금액: ' + thisWeekCost.toLocaleString() + '원',
    '',
    '【 첨부파일 】',
    filename + ' — 전체 데이터 백업 (Excel, 7개 시트)',
    '  · 요약, 품목, 입출고이력, 반출요청, 팀_담당자, 문서_메타, 원본_JSON',
    '',
    '※ 이 메일은 매주 자동 발송됩니다.',
    '※ 첨부 파일은 절대 삭제하지 말고 보관하세요. 데이터 손실 시 복원에 사용됩니다.'
  ].join('\n');

  // 숨겨진 iframe + form으로 진짜 HTML 폼 제출처럼 보내기.
  // fetch + no-cors는 FormSubmit이 첨부를 처리하지 않는 문제가 있어서
  // 브라우저 표준 form submit 흐름을 모방.
  const fields = {
    _subject: '[재고관리] 주간 백업 ' + weekKey,
    _captcha: 'false',
    _template: 'box',
    name: '재고관리 자동백업',
    email: 'backup@moondental.local',  // FormSubmit이 Reply-To로 쓰는 자리
    message: message
  };
  await submitFormWithFile(FORMSUBMIT_ENDPOINT, fields, 'attachment', blob, filename);
}

// 숨겨진 iframe에 form을 만들어 제출 — 첨부파일 포함 진짜 폼 제출 흐름 재현.
// 응답을 읽을 수는 없지만, 서버가 첨부를 정상 처리함.
function submitFormWithFile(url, fields, fileFieldName, blob, filename) {
  return new Promise((resolve) => {
    const iframeName = 'mc-backup-iframe-' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.action = url;
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.target = iframeName;
    form.style.display = 'none';

    // 텍스트 필드들
    Object.keys(fields).forEach(name => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = fields[name];
      form.appendChild(input);
    });

    // 파일 필드 — DataTransfer로 file input에 Blob 주입 (실제 사용자 업로드 흐름과 동일)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.name = fileFieldName;
    const dt = new DataTransfer();
    dt.items.add(new File([blob], filename, { type: blob.type }));
    fileInput.files = dt.files;
    form.appendChild(fileInput);

    document.body.appendChild(form);

    // iframe load 또는 3초 후 정리하고 resolve (응답은 못 읽음)
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { document.body.removeChild(form); } catch (e) {}
      try { document.body.removeChild(iframe); } catch (e) {}
      resolve();
    };
    iframe.addEventListener('load', () => setTimeout(cleanup, 500));
    setTimeout(cleanup, 5000);  // 안전망

    form.submit();
  });
}

// 콘솔에서 즉시 발송 (테스트용) — force 옵션으로 같은 주 체크 우회.
// 5분 쿨다운은 항상 적용되므로 메일이 우르르 가지 않음.
if (typeof window !== 'undefined') {
  window.mcSendBackupNow = async function() {
    await tryWeeklyBackup(true);
  };
  window.mcGetThisWeek = function() {
    return getIsoWeek(new Date());
  };
  // 쿨다운/주차 기록 초기화 (긴급 강제 재발송용)
  window.mcResetBackupCooldown = function() {
    localStorage.removeItem(LAST_BACKUP_KEY);
    localStorage.removeItem(LAST_BACKUP_TIME_KEY);
    console.log('🧹 백업 쿨다운/주차 기록 초기화 — 다음 호출 즉시 발송 가능');
  };
}
