// ============================================
// 16-audit-log.js: 변경 이력 (append-only audit log)
// ============================================
// Phase 1 안전 기반: 모든 데이터 변경을 Firestore events/ 컬렉션에 영구 기록.
// 단일 문서 구조의 약점(누가 무엇을 언제 바꿨는지 모름)을 보완.
//
// 기록 시점:
//   - 요청 생성/수정/삭제/상태변경
//   - 재고 차감/입고
//   - 팀/담당자 변경
//   - 시스템 액션 (mass reset, sync 등)
//
// events/ 컬렉션은 어떤 사고가 나도 손상되지 않음 (append-only, 절대 삭제 안 함).
// 단일 문서 wipe → events 보고 추적 + 복구 가능.

// 기기 식별자 (Firebase Auth 도입 전 임시)
function getDeviceId() {
  let id = localStorage.getItem('mc_device_id');
  if (!id) {
    id = 'D' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('mc_device_id', id);
  }
  return id;
}

// 기기 라벨 (사람이 읽기 쉬운 식별자 — 사용자 입력)
function getDeviceLabel() {
  return localStorage.getItem('mc_device_label') || '(미지정)';
}
function setDeviceLabel(label) {
  localStorage.setItem('mc_device_label', label);
}

// 메인 로그 함수
//   type: 'request' | 'inventory' | 'history' | 'team' | 'teamMember' | 'document' | 'system'
//   action: 'create' | 'update' | 'delete' | 'status_change' | 'stock_change' | 'wipe' | 'sync' | etc.
//   payload: { before, after, summary } — before/after는 옵션. summary는 사람이 읽을 한 줄.
async function logEvent(type, action, payload) {
  if (!window.firebaseReady || !window.firebaseAddDoc) return;
  try {
    const event = {
      type: type,
      action: action,
      payload: payload || {},
      device: {
        id: getDeviceId(),
        label: getDeviceLabel(),
        userAgent: (navigator.userAgent || '').slice(0, 200)
      },
      timestamp: window.firebaseServerTimestamp(),
      // 클라이언트 시각도 같이 (서버 시각과 비교용)
      clientTime: new Date().toISOString()
    };
    const eventsCol = window.firebaseCollection(window.firebaseDB, 'events');
    await window.firebaseAddDoc(eventsCol, event);
  } catch (err) {
    // 로그 실패는 silent (메인 로직 흐름 끊지 않기 위함)
    console.warn('Event log failed:', err);
  }
}

// 도우미: before/after 비교 요약 생성
function summarizeChange(before, after, fields) {
  const changes = [];
  fields.forEach(f => {
    const b = before ? before[f] : undefined;
    const a = after ? after[f] : undefined;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push(f + ': ' + JSON.stringify(b) + ' → ' + JSON.stringify(a));
    }
  });
  return changes.join(', ');
}

// 최근 이벤트 조회 (디버깅/감사용)
//   types: 필터할 type 배열 (생략 시 전체)
//   limitN: 가져올 최대 개수 (기본 100)
async function fetchRecentEvents(types, limitN) {
  if (!window.firebaseReady) {
    console.error('Firebase 준비 안 됨');
    return [];
  }
  try {
    const eventsCol = window.firebaseCollection(window.firebaseDB, 'events');
    const q = window.firebaseQuery(
      eventsCol,
      window.firebaseOrderBy('clientTime', 'desc'),
      window.firebaseLimit(limitN || 100)
    );
    // Firestore SDK getDocs 필요 — index.html에서 안 import했으면 fallback
    if (!window.firebaseGetDocs) {
      const { getDocs } = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js");
      window.firebaseGetDocs = getDocs;
    }
    const snap = await window.firebaseGetDocs(q);
    const out = [];
    snap.forEach(doc => {
      const e = doc.data();
      if (!types || types.indexOf(e.type) >= 0) {
        out.push({ id: doc.id, ...e });
      }
    });
    return out;
  } catch (err) {
    console.error('Events fetch failed:', err);
    return [];
  }
}

// 콘솔에서 호출 가능
if (typeof window !== 'undefined') {
  window.logEvent = logEvent;
  window.summarizeChange = summarizeChange;
  window.getDeviceId = getDeviceId;
  window.getDeviceLabel = getDeviceLabel;
  window.setDeviceLabel = setDeviceLabel;

  // 진단용: 최근 N건 로그 보기
  window.mcViewRecentEvents = async function(limitN) {
    const events = await fetchRecentEvents(null, limitN || 50);
    console.log('=== 최근 ' + events.length + '건 변경 이력 ===');
    events.forEach((e, i) => {
      const t = e.clientTime ? e.clientTime.slice(0, 19).replace('T', ' ') : '?';
      const dev = (e.device && e.device.label) || (e.device && e.device.id) || '?';
      console.log(
        (i + 1) + '. [' + t + '] ' + e.type + ' ' + e.action +
        ' (by ' + dev + ')' +
        (e.payload && e.payload.summary ? ' — ' + e.payload.summary : '')
      );
    });
    return events;
  };

  // 진단용: 특정 타입만
  window.mcViewEventsByType = async function(type, limitN) {
    return await fetchRecentEvents([type], limitN || 50);
  };
}
