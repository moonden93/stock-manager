// ============================================
// 19-inventory-collection.js: Phase 3 — inventory per-document 컬렉션
// ============================================
// 목적: 단일 문서 appData/main.inventory 의 race condition 격리.
// 568개 품목 — 단일 문서 한 칸에 다 들어있어서 두 사람이 동시에
// 다른 품목 입고/출고해도 충돌 가능.
//
// per-doc 분리 후: 같은 품목 동시 변경만 충돌, 다른 품목은 영향 0.
//
// 전략 (Phase 2/3 history와 동일):
//   1. 컬렉션 listener를 source of truth로
//   2. 병렬 쓰기 (단일 문서에도 계속) — 백업
//   3. hash diff로 변경분만 push (568건 매번 전체 X)
//   4. 1MB 위험 본격 해소: mcDisableSingleDocInventorySync()
//
// ⚠️ 잔존 한계: 같은 품목을 두 기기가 동시에 변경하면 마지막 쓰기 승리 (last-write-wins).
//   FieldValue.increment 으로 qty 가산만 처리하면 완벽하지만, 현재 코드는 직접 대입 방식.
//   per-doc 분리만으로도 사고 빈도는 현저히 줄어듦 (다른 품목 충돌 0).

window._inventoryHashes = window._inventoryHashes || new Map();

function _findChangedInventory() {
  const changed = [];
  if (!Array.isArray(inventory)) return changed;
  for (const it of inventory) {
    if (!it || !it.id) continue;
    const key = JSON.stringify(it);
    if (window._inventoryHashes.get(it.id) !== key) {
      changed.push(it);
      window._inventoryHashes.set(it.id, key);
    }
  }
  return changed;
}

// 메모리에서 사라진 품목 (사용자가 설정에서 삭제) — 컬렉션에서도 제거 필요
function _findRemovedInventoryIds() {
  if (!Array.isArray(inventory)) return [];
  const live = new Set(inventory.map(it => it && it.id).filter(Boolean));
  const removed = [];
  for (const id of window._inventoryHashes.keys()) {
    if (!live.has(id)) removed.push(id);
  }
  return removed;
}

// ============================================
// Phase 3.1: Atomic stock 변경 (FieldValue.increment)
// ============================================
// 두 기기가 같은 품목 stock을 동시에 변경할 때 last-write-wins 회피.
// Firestore의 atomic increment 사용 — 서버에서 delta 합산.
// 메모리도 즉시 반영 (낙관적 업데이트). listener echo가 서버 최종값으로 정정.
//
// hash 캐시도 즉시 갱신 → Phase 3 hook이 redundant push 안 함
// (push했다간 절대값으로 덮어 increment 무력화).
async function adjustInventoryStock(itemId, delta) {
  if (!itemId || !delta) return;
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;

  // 1. 메모리 낙관적 업데이트
  item.stock = (item.stock || 0) + delta;

  // 2. hash 캐시 즉시 갱신 (Phase 3 hook이 절대값으로 push해 increment 덮는 것 방지)
  if (window._inventoryHashes) {
    window._inventoryHashes.set(item.id, JSON.stringify(item));
  }
  // localStorage도 즉시 갱신
  if (typeof saveToLocalStorage === 'function') saveToLocalStorage();

  // 3. Firestore atomic increment (서버 측 합산)
  if (!window.firebaseReady || !window.firebaseSetDoc || !window.firebaseIncrement) {
    console.warn('Firebase 준비 안 됨 — atomic stock 적용 못함, 메모리만 갱신');
    return;
  }
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'inventory', itemId);
    await window.firebaseSetDoc(docRef, {
      stock: window.firebaseIncrement(delta),
      _syncedAt: window.firebaseServerTimestamp(),
      _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
      _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
    }, { merge: true });
  } catch (err) {
    console.warn('atomic stock 적용 실패:', itemId, err && err.message);
    // 실패 시 메모리는 낙관적 상태 유지 — 다음 listener echo가 서버 정설로 교정
  }
}
window.adjustInventoryStock = adjustInventoryStock;

async function upsertInventoryDoc(it) {
  if (!window.firebaseReady || !window.firebaseSetDoc || !it || !it.id) return;
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'inventory', it.id);
    const payload = Object.assign({}, it, {
      _syncedAt: window.firebaseServerTimestamp(),
      _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
      _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
    });
    await window.firebaseSetDoc(docRef, payload);
  } catch (err) {
    console.warn('Phase 3 inventory upsert 실패:', it.id, err && err.message);
  }
}

async function upsertInventoryBatch(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  if (!window.firebaseReady || !window.firebaseWriteBatch) {
    for (let i = 0; i < items.length; i += 5) {
      const slice = items.slice(i, i + 5);
      await Promise.all(slice.map(it => upsertInventoryDoc(it)));
    }
    return;
  }
  const CHUNK = 450;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const batch = window.firebaseWriteBatch(window.firebaseDB);
    chunk.forEach(it => {
      if (!it || !it.id) return;
      const docRef = window.firebaseDoc(window.firebaseDB, 'inventory', it.id);
      const payload = Object.assign({}, it, {
        _syncedAt: window.firebaseServerTimestamp(),
        _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
        _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
      });
      batch.set(docRef, payload);
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error('inventory writeBatch 실패 (chunk', i / CHUNK, '):', err && err.message);
    }
  }
}

async function deleteInventoryDocs(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (!window.firebaseReady || !window.firebaseWriteBatch) {
    if (window.firebaseDeleteDoc) {
      for (const id of ids) {
        try {
          const docRef = window.firebaseDoc(window.firebaseDB, 'inventory', id);
          await window.firebaseDeleteDoc(docRef);
        } catch (e) {}
      }
    }
    return;
  }
  const CHUNK = 450;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const batch = window.firebaseWriteBatch(window.firebaseDB);
    chunk.forEach(id => {
      const docRef = window.firebaseDoc(window.firebaseDB, 'inventory', id);
      batch.delete(docRef);
    });
    try {
      await batch.commit();
      chunk.forEach(id => window._inventoryHashes.delete(id));
    } catch (err) {
      console.error('inventory delete batch 실패:', err && err.message);
    }
  }
}

// ============================================
// listener
// ============================================
function setupInventoryCollectionListener() {
  if (!window.firebaseReady) return;
  if (window._inventoryCollectionListenerActive) return;
  if (!window.firebaseOnSnapshot || !window.firebaseCollection) return;

  try {
    const col = window.firebaseCollection(window.firebaseDB, 'inventory');
    window.firebaseOnSnapshot(col, (snap) => {
      if (snap.size === 0 && Array.isArray(inventory) && inventory.length > 0) {
        console.log('⏸️ inventory 컬렉션 비어있음 — 메모리 보호 (mcBackfillInventoryCollection() 권장)');
        return;
      }
      const newInv = [];
      snap.forEach(doc => {
        const d = doc.data();
        const cleaned = {};
        for (const k in d) {
          if (k.charAt(0) !== '_') cleaned[k] = d[k];
        }
        newInv.push(cleaned);
      });
      console.log('🔄 inventory/ listener fired (' + newInv.length + '건)');

      const isTyping = (function() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'button') return true;
        if (el.tagName === 'TEXTAREA') return true;
        return false;
      })();
      if (isTyping) {
        window._pendingInventorySync = newInv;
        return;
      }
      _applyInventorySync(newInv);
    }, (err) => {
      console.error('inventory/ listener error:', err);
    });
    window._inventoryCollectionListenerActive = true;
    console.log('✓ Phase 3 inventory/ 컬렉션 listener 활성화');
  } catch (err) {
    console.error('inventory/ listener 등록 실패:', err);
  }
}

function _applyInventorySync(newInv) {
  if (typeof inventory === 'undefined' || !Array.isArray(inventory)) return;
  if (window._resetInProgress) {
    console.log('⏸️ reset 중 — inventory listener echo 무시');
    return;
  }
  window._inventoryHashes.clear();
  newInv.forEach(it => {
    if (it && it.id) window._inventoryHashes.set(it.id, JSON.stringify(it));
  });
  inventory.length = 0;
  newInv.forEach(it => inventory.push(it));
  // 대량 감소 가드 기준선 갱신 (false alarm 방지)
  if (window._lastCloudSnapshot) window._lastCloudSnapshot.inventoryCount = newInv.length;
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
    if (window._pendingInventorySync) {
      const data = window._pendingInventorySync;
      window._pendingInventorySync = null;
      _applyInventorySync(data);
    }
  }, 0);
}, true);

// ============================================
// force fetch
// ============================================
async function forceFetchInventoryCollection() {
  if (!window.firebaseReady || !window.firebaseCollection) return;
  try {
    if (!window.firebaseGetDocs) {
      const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
      window.firebaseGetDocs = getDocs;
    }
    const col = window.firebaseCollection(window.firebaseDB, 'inventory');
    const snap = await window.firebaseGetDocs(col);
    if (snap.size === 0 && Array.isArray(inventory) && inventory.length > 0) return;
    const newInv = [];
    snap.forEach(doc => {
      const d = doc.data();
      const cleaned = {};
      for (const k in d) if (k.charAt(0) !== '_') cleaned[k] = d[k];
      newInv.push(cleaned);
    });
    _applyInventorySync(newInv);
    console.log('🔄 force fetch inventory/ (' + newInv.length + '건)');
  } catch (err) {
    console.warn('inventory force fetch 실패:', err && err.message);
  }
}
window.forceFetchInventoryCollection = forceFetchInventoryCollection;

// ============================================
// 콘솔 함수
// ============================================
window.mcBackfillInventoryCollection = async function() {
  if (!window.firebaseReady) {
    console.error('Firebase 준비 안 됨');
    return;
  }
  const total = (inventory || []).length;
  if (total === 0) {
    console.log('백필할 inventory 없음');
    return;
  }
  if (!confirm('현재 ' + total + '개 품목을 inventory/ 컬렉션에 동기화합니다.\n\n안전: 멱등 (이미 있으면 덮어쓰기), 데이터 손실 없음.\nwriteBatch 사용 — 약 ' + Math.ceil(total / 450) + '회 commit\n계속?')) {
    return;
  }
  console.log('🔄 inventory 백필 시작: ' + total + '개');
  const t0 = Date.now();
  window._resetInProgress = true;
  try {
    await upsertInventoryBatch(inventory);
    window._inventoryHashes.clear();
    inventory.forEach(it => {
      if (it && it.id) window._inventoryHashes.set(it.id, JSON.stringify(it));
    });
  } finally {
    window._resetInProgress = false;
  }
  const dt = Date.now() - t0;
  console.log('✓ inventory 백필 완료: ' + total + '개 (' + dt + 'ms)');
  if (typeof showToast === 'function') showToast('inventory 컬렉션 백필 완료 (' + total + '개)', 'success');
};

window.mcCheckInventoryCollection = async function() {
  if (!window.firebaseReady) return;
  if (!window.firebaseGetDocs) {
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
    window.firebaseGetDocs = getDocs;
  }
  const col = window.firebaseCollection(window.firebaseDB, 'inventory');
  const snap = await window.firebaseGetDocs(col);
  console.log('inventory/ 컬렉션 문서 수:', snap.size);
  console.log('메모리 inventory 배열 수:', (inventory || []).length);
  if (snap.size !== (inventory || []).length) {
    console.warn('⚠️ 차이 있음 — mcBackfillInventoryCollection() 으로 동기화 권장');
  } else {
    console.log('✓ 동기화 상태 일치');
  }
};

// 1MB 영구 해소 토글
window.mcDisableSingleDocInventorySync = function() {
  if (!confirm('단일 문서 appData/main에서 inventory 필드 쓰기를 중단합니다.\n\n전제: inventory 컬렉션 정상 작동 (mcCheckInventoryCollection 로 확인).\n안전: 단일 문서의 기존 inventory 필드는 그대로 유지됨 (백업으로).\n\n계속?')) {
    return;
  }
  window._disableSingleDocInventorySync = true;
  try { localStorage.setItem('mc_disableSingleDocInventorySync', '1'); } catch(e) {}
  if (typeof logEvent === 'function') {
    logEvent('system', 'disable_single_doc_inventory', { summary: 'inventory 필드를 단일 문서에서 제외 (1MB 한도 해소)' });
  }
  console.log('✓ 단일 문서 inventory 쓰기 중단. 1MB 한도 해소.');
  if (typeof showToast === 'function') showToast('inventory 단일 문서 쓰기 중단', 'success');
};

window.mcEnableSingleDocInventorySync = function() {
  window._disableSingleDocInventorySync = false;
  try { localStorage.removeItem('mc_disableSingleDocInventorySync'); } catch(e) {}
  console.log('✓ 단일 문서 inventory 쓰기 재개');
};

// 부팅 시 토글 복원
try {
  if (localStorage.getItem('mc_disableSingleDocInventorySync') === '1') {
    window._disableSingleDocInventorySync = true;
  }
} catch(e) {}

// ============================================
// 자동 hook
// ============================================
if (typeof window !== 'undefined') {
  if (window.firebaseReady) {
    setTimeout(setupInventoryCollectionListener, 1400);
  } else {
    window.addEventListener('firebaseReady', () => {
      setTimeout(setupInventoryCollectionListener, 1400);
    }, { once: true });
  }
}

(function setupInventoryParallelWrite() {
  if (typeof window === 'undefined') return;
  function patch() {
    const original = window.saveAll;
    if (typeof original !== 'function' || original._phase3InventoryPatched) return;
    const prevImpl = original;
    window.saveAll = function() {
      const r = prevImpl.apply(this, arguments);
      clearTimeout(window._phase3InventoryDebounceTimer);
      window._phase3InventoryDebounceTimer = setTimeout(() => {
        if (window._resetInProgress) return;
        const changed = _findChangedInventory();
        const removed = _findRemovedInventoryIds();
        if (changed.length > 0) {
          console.log('📤 inventory 변경분 push: ' + changed.length + '개');
          upsertInventoryBatch(changed);
        }
        if (removed.length > 0) {
          console.log('🗑️ inventory 삭제분: ' + removed.length + '개');
          deleteInventoryDocs(removed);
        }
      }, 400);
      return r;
    };
    window.saveAll._phase3InventoryPatched = true;
    if (prevImpl._phase2Patched) window.saveAll._phase2Patched = true;
    if (prevImpl._phase3HistoryPatched) window.saveAll._phase3HistoryPatched = true;
    console.log('✓ Phase 3 inventory 변경분 hook 활성화');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(patch, 800));
  } else {
    setTimeout(patch, 800);
  }
})();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window._inventoryCollectionListenerActive) {
    forceFetchInventoryCollection();
  }
});
window.addEventListener('focus', () => {
  if (window._inventoryCollectionListenerActive) forceFetchInventoryCollection();
});
window.addEventListener('online', () => {
  if (window._inventoryCollectionListenerActive) forceFetchInventoryCollection();
});

// 폴링 (45초)
window._phase3InventoryPollTimer = window._phase3InventoryPollTimer || setInterval(() => {
  if (document.visibilityState === 'visible' && window._inventoryCollectionListenerActive) {
    forceFetchInventoryCollection();
  }
}, 45000);

// ============================================
// Phase 3 종합 진단
// ============================================
window.mcCheckPhase3Status = function() {
  console.log('=== Phase 3 상태 ===');
  console.log('Firebase 준비:', window.firebaseReady);
  console.log('---');
  console.log('history listener 활성:', !!window._historyCollectionListenerActive);
  console.log('history 변경분 hook:', !!(window.saveAll && window.saveAll._phase3HistoryPatched));
  console.log('history 단일문서 쓰기 중단:', !!window._disableSingleDocHistorySync);
  console.log('현재 history 수:', (typeof history !== 'undefined' && Array.isArray(history) ? history.length : 'N/A'));
  console.log('---');
  console.log('inventory listener 활성:', !!window._inventoryCollectionListenerActive);
  console.log('inventory 변경분 hook:', !!(window.saveAll && window.saveAll._phase3InventoryPatched));
  console.log('inventory 단일문서 쓰기 중단:', !!window._disableSingleDocInventorySync);
  console.log('현재 inventory 수:', (inventory || []).length);
  console.log('---');
  console.log('마이그레이션 순서 권장:');
  console.log('  1) mcBackfillHistoryCollection()  — 1481건 컬렉션화');
  console.log('  2) mcBackfillInventoryCollection() — 568개 컬렉션화');
  console.log('  3) 1주 운영 후 mcCheckHistoryCollection / mcCheckInventoryCollection 일치 확인');
  console.log('  4) mcDisableSingleDocHistorySync()  — 1MB 해소 (history)');
  console.log('  5) mcDisableSingleDocInventorySync() — 1MB 해소 (inventory)');
};
