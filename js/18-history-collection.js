// ============================================
// 18-history-collection.js: Phase 3 — history per-document 컬렉션
// ============================================
// 목적: 단일 문서 appData/main.history 의 1MB 한도 영구 해소 + race 격리.
// 현재 1481건, 주당 +60건 → ~1년 안에 한도 도달 위험.
//
// 비파괴 마이그레이션 (Phase 2와 동일 패턴):
//   1. 컬렉션 listener를 source of truth로 (cutover 자동)
//   2. 병렬 쓰기: 단일 문서에도 계속 쓰기 (옛 데이터 보호망)
//   3. 변경분만 추적 (hash diff) — 1481건 매번 다 쓰지 않음
//   4. 1MB 위험 본격 해소는 mcDisableSingleDocHistorySync() 후
//
// writeBatch 사용 — Firestore 500 ops/batch 한도 준수, 백필 효율적

// ============================================
// 변경분 추적 (hash diff)
// ============================================
// history는 1481건+ — 매 saveAll마다 전체를 다시 쓰면 비용 큼.
// id별 JSON.stringify를 캐시해서 변경된 항목만 push.
window._historyHashes = window._historyHashes || new Map();

function _findChangedHistory() {
  const changed = [];
  if (!Array.isArray(window.history)) return changed;
  for (const h of window.history) {
    if (!h || !h.id) continue;
    const key = JSON.stringify(h);
    if (window._historyHashes.get(h.id) !== key) {
      changed.push(h);
      window._historyHashes.set(h.id, key);
    }
  }
  return changed;
}

// ============================================
// upsert (단일 / 배치)
// ============================================
async function upsertHistoryDoc(h) {
  if (!window.firebaseReady || !window.firebaseSetDoc || !h || !h.id) return;
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'history', h.id);
    const payload = Object.assign({}, h, {
      _syncedAt: window.firebaseServerTimestamp(),
      _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
      _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
    });
    await window.firebaseSetDoc(docRef, payload);
  } catch (err) {
    console.warn('Phase 3 history upsert 실패:', h.id, err && err.message);
  }
}

// writeBatch — Firestore 500 ops/batch
async function upsertHistoryBatch(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  if (!window.firebaseReady || !window.firebaseWriteBatch) {
    // fallback: 5개씩 동시
    for (let i = 0; i < items.length; i += 5) {
      const slice = items.slice(i, i + 5);
      await Promise.all(slice.map(h => upsertHistoryDoc(h)));
    }
    return;
  }
  const CHUNK = 450; // 500 한도에 여유
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const batch = window.firebaseWriteBatch(window.firebaseDB);
    chunk.forEach(h => {
      if (!h || !h.id) return;
      const docRef = window.firebaseDoc(window.firebaseDB, 'history', h.id);
      const payload = Object.assign({}, h, {
        _syncedAt: window.firebaseServerTimestamp(),
        _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
        _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
      });
      batch.set(docRef, payload);
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error('history writeBatch 실패 (chunk', i / CHUNK, '):', err && err.message);
    }
  }
}

// ============================================
// 컬렉션 listener — source of truth
// ============================================
function setupHistoryCollectionListener() {
  if (!window.firebaseReady) return;
  if (window._historyCollectionListenerActive) return;
  if (!window.firebaseOnSnapshot || !window.firebaseCollection) return;

  try {
    const col = window.firebaseCollection(window.firebaseDB, 'history');
    window.firebaseOnSnapshot(col, (snap) => {
      // 빈 컬렉션 + 메모리에 데이터 있음 = 아직 백필 전 → 무시 (메모리 보호)
      if (snap.size === 0 && Array.isArray(window.history) && window.history.length > 0) {
        console.log('⏸️ history 컬렉션 비어있음 — 메모리 보호 (mcBackfillHistoryCollection() 권장)');
        return;
      }
      const newHist = [];
      snap.forEach(doc => {
        const d = doc.data();
        const cleaned = {};
        for (const k in d) {
          if (k.charAt(0) !== '_') cleaned[k] = d[k];
        }
        newHist.push(cleaned);
      });
      console.log('🔄 history/ listener fired (' + newHist.length + '건)');

      const isTyping = (function() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'button') return true;
        if (el.tagName === 'TEXTAREA') return true;
        return false;
      })();
      if (isTyping) {
        window._pendingHistorySync = newHist;
        return;
      }
      _applyHistorySync(newHist);
    }, (err) => {
      console.error('history/ listener error:', err);
    });
    window._historyCollectionListenerActive = true;
    console.log('✓ Phase 3 history/ 컬렉션 listener 활성화');
  } catch (err) {
    console.error('history/ listener 등록 실패:', err);
  }
}

function _applyHistorySync(newHist) {
  if (typeof window.history === 'undefined' || !Array.isArray(window.history)) return;
  if (window._resetInProgress) {
    console.log('⏸️ reset 중 — history listener echo 무시');
    return;
  }
  // hash 캐시 갱신 (다음 diff 비교용)
  window._historyHashes.clear();
  newHist.forEach(h => {
    if (h && h.id) window._historyHashes.set(h.id, JSON.stringify(h));
  });
  // in-place 교체 (다른 모듈의 참조 유지)
  window.history.length = 0;
  newHist.forEach(h => window.history.push(h));
  if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  if (typeof currentTab !== 'undefined') {
    const fnName = 'render' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
    const renderFn = window[fnName];
    if (typeof renderFn === 'function') renderFn();
  }
}

document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (window._pendingHistorySync) {
      const data = window._pendingHistorySync;
      window._pendingHistorySync = null;
      _applyHistorySync(data);
    }
  }, 0);
}, true);

// ============================================
// 강제 fetch (visibility/focus/online + 폴링)
// ============================================
async function forceFetchHistoryCollection() {
  if (!window.firebaseReady || !window.firebaseCollection) return;
  try {
    if (!window.firebaseGetDocs) {
      const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
      window.firebaseGetDocs = getDocs;
    }
    const col = window.firebaseCollection(window.firebaseDB, 'history');
    const snap = await window.firebaseGetDocs(col);
    if (snap.size === 0 && Array.isArray(window.history) && window.history.length > 0) return;
    const newHist = [];
    snap.forEach(doc => {
      const d = doc.data();
      const cleaned = {};
      for (const k in d) if (k.charAt(0) !== '_') cleaned[k] = d[k];
      newHist.push(cleaned);
    });
    _applyHistorySync(newHist);
    console.log('🔄 force fetch history/ (' + newHist.length + '건)');
  } catch (err) {
    console.warn('history force fetch 실패:', err && err.message);
  }
}
window.forceFetchHistoryCollection = forceFetchHistoryCollection;

// ============================================
// 콘솔 함수
// ============================================

// 백필 — 메모리의 history 전체를 컬렉션에 동기화 (마이그레이션 1회)
window.mcBackfillHistoryCollection = async function() {
  if (!window.firebaseReady) {
    console.error('Firebase 준비 안 됨');
    return;
  }
  const total = (window.history || []).length;
  if (total === 0) {
    console.log('백필할 history 없음');
    return;
  }
  if (!confirm('현재 ' + total + '건의 history를 history/ 컬렉션에 동기화합니다.\n\n안전: 멱등 (이미 있으면 덮어쓰기), 데이터 손실 없음.\nwriteBatch 사용 — 약 ' + Math.ceil(total / 450) + '회 commit\n계속?')) {
    return;
  }
  console.log('🔄 history 백필 시작: ' + total + '건');
  const t0 = Date.now();
  // 백필 중 listener가 부분 데이터로 메모리를 덮지 않도록 차단 (각 batch commit마다 listener가 fire)
  window._resetInProgress = true;
  try {
    await upsertHistoryBatch(window.history);
    window._historyHashes.clear();
    window.history.forEach(h => {
      if (h && h.id) window._historyHashes.set(h.id, JSON.stringify(h));
    });
  } finally {
    window._resetInProgress = false;
  }
  const dt = Date.now() - t0;
  console.log('✓ history 백필 완료: ' + total + '건 (' + dt + 'ms)');
  if (typeof showToast === 'function') showToast('history 컬렉션 백필 완료 (' + total + '건)', 'success');
};

// 컬렉션 vs 메모리 비교
window.mcCheckHistoryCollection = async function() {
  if (!window.firebaseReady) return;
  if (!window.firebaseGetDocs) {
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
    window.firebaseGetDocs = getDocs;
  }
  const col = window.firebaseCollection(window.firebaseDB, 'history');
  const snap = await window.firebaseGetDocs(col);
  console.log('history/ 컬렉션 문서 수:', snap.size);
  console.log('메모리 history 배열 수:', (window.history || []).length);
  if (snap.size !== (window.history || []).length) {
    console.warn('⚠️ 차이 있음 — mcBackfillHistoryCollection() 으로 동기화 권장');
  } else {
    console.log('✓ 동기화 상태 일치');
  }
};

// ============================================
// 1MB 영구 해소 토글: 단일 문서에서 history 필드 제외
// ============================================
// 컬렉션 백필 + 1주 검증 후 활성화 권장.
// 활성화 후 saveToFirebase의 payload에 history가 빠짐 → 단일 문서 크기 영구 안정.
window.mcDisableSingleDocHistorySync = function() {
  if (!confirm('단일 문서 appData/main에서 history 필드 쓰기를 중단합니다.\n\n전제: history 컬렉션이 정상 작동 (mcCheckHistoryCollection 로 확인).\n안전: 단일 문서의 기존 history 필드는 그대로 유지됨 (백업으로).\n\n계속?')) {
    return;
  }
  window._disableSingleDocHistorySync = true;
  try { localStorage.setItem('mc_disableSingleDocHistorySync', '1'); } catch(e) {}
  if (typeof logEvent === 'function') {
    logEvent('system', 'disable_single_doc_history', { summary: 'history 필드를 단일 문서에서 제외 (1MB 한도 해소)' });
  }
  console.log('✓ 단일 문서 history 쓰기 중단. 1MB 한도 해소.');
  if (typeof showToast === 'function') showToast('history 단일 문서 쓰기 중단', 'success');
};

// 되돌리기 (혹시 필요할 때)
window.mcEnableSingleDocHistorySync = function() {
  window._disableSingleDocHistorySync = false;
  try { localStorage.removeItem('mc_disableSingleDocHistorySync'); } catch(e) {}
  console.log('✓ 단일 문서 history 쓰기 재개');
};

// 부팅 시 토글 복원
try {
  if (localStorage.getItem('mc_disableSingleDocHistorySync') === '1') {
    window._disableSingleDocHistorySync = true;
  }
} catch(e) {}

// ============================================
// 자동 hook 설정
// ============================================

// listener 등록
if (typeof window !== 'undefined') {
  if (window.firebaseReady) {
    setTimeout(setupHistoryCollectionListener, 1200);
  } else {
    window.addEventListener('firebaseReady', () => {
      setTimeout(setupHistoryCollectionListener, 1200);
    }, { once: true });
  }
}

// saveAll에 변경분 push hook
(function setupHistoryParallelWrite() {
  if (typeof window === 'undefined') return;
  function patch() {
    const original = window.saveAll;
    if (typeof original !== 'function' || original._phase3HistoryPatched) return;
    const prevImpl = original;
    window.saveAll = function() {
      const r = prevImpl.apply(this, arguments);
      clearTimeout(window._phase3HistoryDebounceTimer);
      window._phase3HistoryDebounceTimer = setTimeout(() => {
        if (window._resetInProgress) return;
        const changed = _findChangedHistory();
        if (changed.length > 0) {
          console.log('📤 history 변경분 push: ' + changed.length + '건');
          upsertHistoryBatch(changed);
        }
      }, 400);
      return r;
    };
    window.saveAll._phase3HistoryPatched = true;
    // Phase 2 patch flag도 유지
    if (prevImpl._phase2Patched) window.saveAll._phase2Patched = true;
    console.log('✓ Phase 3 history 변경분 hook 활성화');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(patch, 700));
  } else {
    setTimeout(patch, 700);
  }
})();

// 이벤트 핸들러 (visibility / focus / online)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window._historyCollectionListenerActive) {
    forceFetchHistoryCollection();
  }
});
window.addEventListener('focus', () => {
  if (window._historyCollectionListenerActive) forceFetchHistoryCollection();
});
window.addEventListener('online', () => {
  if (window._historyCollectionListenerActive) forceFetchHistoryCollection();
});

// 폴링 (60초 — listener 잠들 때 안전망, history는 변동 적어서 더 길게)
window._phase3HistoryPollTimer = window._phase3HistoryPollTimer || setInterval(() => {
  if (document.visibilityState === 'visible' && window._historyCollectionListenerActive) {
    forceFetchHistoryCollection();
  }
}, 60000);
