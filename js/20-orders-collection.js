// ============================================
// 20-orders-collection.js: 입고 주문 per-document 컬렉션
// ============================================
// 2026-05-12 추가. 입고 탭에 "주문 → 입고 완료" 흐름 도입.
// 패턴: Phase 2 (requests-collection)와 동일.
//   - per-doc 컬렉션 orders/{id} (단일 문서엔 안 씀 — 처음부터 컬렉션만)
//   - listener as source of truth
//   - 모든 변경 즉시 upsert (debounce 우회 — race 차단)
//   - hash diff hook (saveAll에 monkey-patch)
//
// 데이터 모델 (orders/{id}):
//   {
//     id, date, status ('pending'/'received'/'cancelled'),
//     orderedBy, memo,
//     items: [{ itemId, vendor, name, qty, price, unit }],
//     receivedDate (입고 완료 시),
//     cancelReason (취소 시),
//     editHistory (수정 이력)
//   }

async function upsertOrderDoc(o) {
  if (!window.firebaseReady || !window.firebaseSetDoc || !o || !o.id) return;
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'orders', o.id);
    const payload = Object.assign({}, o, {
      _syncedAt: window.firebaseServerTimestamp(),
      _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
      _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
    });
    await window.firebaseSetDoc(docRef, payload);
  } catch (err) {
    console.warn('orders 컬렉션 upsert 실패:', o.id, err && err.message);
  }
}

async function upsertOrdersBatch(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return;
  const CONCURRENCY = 5;
  for (let i = 0; i < arr.length; i += CONCURRENCY) {
    const slice = arr.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(o => upsertOrderDoc(o)));
  }
}

// 컬렉션 → 메모리 (listener as source of truth)
function setupOrdersCollectionListener() {
  if (!window.firebaseReady) return;
  if (window._ordersCollectionListenerActive) return;
  if (!window.firebaseOnSnapshot || !window.firebaseCollection) return;

  try {
    const col = window.firebaseCollection(window.firebaseDB, 'orders');
    window.firebaseOnSnapshot(col, (snap) => {
      const newOrders = [];
      snap.forEach(doc => {
        const d = doc.data();
        const cleaned = {};
        for (const k in d) {
          if (k.charAt(0) !== '_') cleaned[k] = d[k];
        }
        newOrders.push(cleaned);
      });
      console.log('🔄 orders/ listener fired (' + newOrders.length + '건, pending=' + (snap.metadata && snap.metadata.hasPendingWrites) + ')');

      const isTyping = (function() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'button') return true;
        if (el.tagName === 'TEXTAREA') return true;
        return false;
      })();
      if (isTyping) {
        window._pendingOrdersSync = newOrders;
        return;
      }
      _applyOrdersSync(newOrders);
    }, (err) => {
      console.error('orders/ listener error:', err);
    });
    window._ordersCollectionListenerActive = true;
    console.log('✓ orders/ 컬렉션 listener 활성화');
  } catch (err) {
    console.error('orders/ listener 등록 실패:', err);
  }
}

// orders 변경분 hash 캐시 — listener echo가 동일 데이터를 가져왔을 때 재렌더 스킵
// (사용자가 방금 쓴 데이터가 listener로 돌아왔을 때 불필요한 renderInbound 막아서
//  버튼 클릭 누락/UI 지연 방지)
function _hashOrdersForSync(arr) {
  return arr.slice()
    .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
    .map(o => (o.id || '') + '|' + (o.status || '') + '|' + JSON.stringify(o.items || []) +
              '|' + (o.receivedDate || '') + '|' + (o.cancelledDate || '') +
              '|' + JSON.stringify(o.partialReceiveHistory || []) +
              '|' + JSON.stringify(o.editHistory || []))
    .join('||');
}

function _applyOrdersSync(newOrders) {
  if (typeof orders === 'undefined' || !Array.isArray(orders)) return;
  if (window._resetInProgress) return;

  // 변경분 없으면 재렌더 스킵 (echo 가드)
  const newHash = _hashOrdersForSync(newOrders);
  if (newHash === window._lastOrdersSyncHash) return;
  window._lastOrdersSyncHash = newHash;

  orders.length = 0;
  newOrders.forEach(o => orders.push(o));
  if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  // debounced 재렌더 (다른 listener echo와 합쳐져 한 번만 실행 → UI 지연 방지)
  if (typeof debouncedReRenderCurrentTab === 'function') {
    debouncedReRenderCurrentTab();
  } else if (typeof currentTab !== 'undefined') {
    const fnName = 'render' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
    const renderFn = window[fnName];
    if (typeof renderFn === 'function') renderFn();
  }
}

// 입력 끝나면 보류된 sync 적용
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (window._pendingOrdersSync) {
      const data = window._pendingOrdersSync;
      window._pendingOrdersSync = null;
      _applyOrdersSync(data);
    }
  }, 0);
}, true);

// 강제 fetch (visibility/focus/online + 폴링)
async function forceFetchOrdersCollection() {
  if (!window.firebaseReady || !window.firebaseCollection) return;
  try {
    if (!window.firebaseGetDocs) {
      const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
      window.firebaseGetDocs = getDocs;
    }
    const col = window.firebaseCollection(window.firebaseDB, 'orders');
    const snap = await window.firebaseGetDocs(col);
    const newOrders = [];
    snap.forEach(doc => {
      const d = doc.data();
      const cleaned = {};
      for (const k in d) if (k.charAt(0) !== '_') cleaned[k] = d[k];
      newOrders.push(cleaned);
    });
    _applyOrdersSync(newOrders);
    console.log('🔄 force fetch orders/ (' + newOrders.length + '건)');
  } catch (err) {
    console.warn('orders force fetch 실패:', err && err.message);
  }
}
window.forceFetchOrdersCollection = forceFetchOrdersCollection;

// 콘솔 함수
window.mcCheckOrdersCollection = async function() {
  if (!window.firebaseReady) return;
  if (!window.firebaseGetDocs) {
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
    window.firebaseGetDocs = getDocs;
  }
  const col = window.firebaseCollection(window.firebaseDB, 'orders');
  const snap = await window.firebaseGetDocs(col);
  console.log('orders/ 컬렉션 문서 수:', snap.size);
  console.log('메모리 orders 배열 수:', orders.length);
  console.log(snap.size === orders.length ? '✓ 일치' : '⚠️ 차이 있음');
};

// 이벤트 핸들러 (visibility / focus / online)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window._ordersCollectionListenerActive) {
    forceFetchOrdersCollection();
  }
});
window.addEventListener('focus', () => {
  if (window._ordersCollectionListenerActive) forceFetchOrdersCollection();
});
window.addEventListener('online', () => {
  if (window._ordersCollectionListenerActive) forceFetchOrdersCollection();
});

// 주기 타이머 폴링 제거 (2026-06-11): 컬렉션 전체 재읽기라 무료 read 한도 소진 기여.
// 실시간은 onSnapshot listener(델타), 깨우기는 visibility/focus/online 핸들러가 담당.
// window._ordersPollTimer 제거됨.

// Firebase 준비되면 listener 활성화
if (typeof window !== 'undefined') {
  if (window.firebaseReady) {
    setTimeout(setupOrdersCollectionListener, 1500);
  } else {
    window.addEventListener('firebaseReady', () => {
      setTimeout(setupOrdersCollectionListener, 1500);
    }, { once: true });
  }
}
