// ============================================
// 17-requests-collection.js: Phase 2 — 요청 per-document 컬렉션 (병렬 쓰기)
// ============================================
// 비파괴 마이그레이션 전략:
//   1. 기존 appData/main의 requests 배열은 그대로 유지 (읽기/쓰기 둘 다)
//   2. 모든 변경(생성/수정/취소/처리)을 동시에 requests/{id} 컬렉션에도 기록 (이중 쓰기)
//   3. 충분히 쌓인 후 (1~2주 검증) 읽기를 컬렉션으로 전환
//   4. 모든 디바이스 cutover 완료 후 단일 문서의 requests 필드 deprecated
//
// 이 단계만으로도 효과:
//   - requests/{id} 마다 개별 문서 → race condition 영향 격리
//   - 단일 문서가 wipe돼도 컬렉션에 백업 자동 존재
//   - 개별 요청 단위로 감사/조회 가능

// 단일 요청을 컬렉션에 upsert (멱등 — 같은 id로 여러 번 호출해도 안전)
async function upsertRequestDoc(req) {
  if (!window.firebaseReady || !window.firebaseSetDoc || !req || !req.id) return;
  try {
    const docRef = window.firebaseDoc(window.firebaseDB, 'requests', req.id);
    // 클라이언트가 메타 추가 (서버 시각, device id)
    const payload = Object.assign({}, req, {
      _syncedAt: window.firebaseServerTimestamp(),
      _device: (typeof getDeviceId === 'function' ? getDeviceId() : 'unknown'),
      _deviceLabel: (typeof getDeviceLabel === 'function' ? getDeviceLabel() : '')
    });
    await window.firebaseSetDoc(docRef, payload);
  } catch (err) {
    // 병렬 쓰기 실패는 silent (메인 흐름 막지 않음)
    console.warn('Phase 2 컬렉션 upsert 실패:', req.id, err && err.message);
  }
}

// 여러 요청 동시 upsert (배치)
async function upsertRequestsBatch(reqs) {
  if (!Array.isArray(reqs) || reqs.length === 0) return;
  // 병렬로 (소수만 동시에)
  const CONCURRENCY = 5;
  for (let i = 0; i < reqs.length; i += CONCURRENCY) {
    const batch = reqs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(r => upsertRequestDoc(r)));
  }
}

// 콘솔 함수: 현재 메모리의 모든 requests를 컬렉션으로 백필 (마이그레이션)
// 안전: 멱등 (이미 있으면 덮어씀, 데이터 손실 없음)
window.mcBackfillRequestsCollection = async function() {
  if (!window.firebaseReady) {
    console.error('Firebase 준비 안 됨');
    return;
  }
  const total = requests.length;
  if (total === 0) {
    console.log('백필할 requests 없음');
    return;
  }
  if (!confirm('현재 ' + total + '건의 요청을 requests/ 컬렉션에 동기화합니다.\n\n안전: 이미 있는 항목은 덮어쓰기만, 데이터 손실 없음.\n계속?')) {
    return;
  }
  console.log('🔄 백필 시작: ' + total + '건');
  let done = 0;
  for (let i = 0; i < requests.length; i += 5) {
    const batch = requests.slice(i, i + 5);
    await Promise.all(batch.map(r => upsertRequestDoc(r)));
    done += batch.length;
    if (done % 25 === 0 || done === total) console.log('  진행: ' + done + '/' + total);
  }
  console.log('✓ 백필 완료: ' + done + '건');
  if (typeof showToast === 'function') showToast('컬렉션 백필 완료 (' + done + '건)', 'success');
};

// 컬렉션의 요청 개수 확인 (디버깅)
window.mcCheckRequestsCollection = async function() {
  if (!window.firebaseReady) return;
  if (!window.firebaseGetDocs) {
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
    window.firebaseGetDocs = getDocs;
  }
  const col = window.firebaseCollection(window.firebaseDB, 'requests');
  const snap = await window.firebaseGetDocs(col);
  console.log('requests/ 컬렉션 문서 수:', snap.size);
  console.log('단일 문서의 requests 배열 수:', requests.length);
  if (snap.size !== requests.length) {
    console.warn('⚠️ 차이 있음 — mcBackfillRequestsCollection() 으로 동기화 권장');
  } else {
    console.log('✓ 동기화 상태 일치');
  }
};

// ============================================
// Phase 2 cutover: requests/ 컬렉션을 source of truth로
// ============================================
// 단일 문서 appData/main의 requests 필드 대신 컬렉션 listener로 sync.
// 효과:
//   - 두 기기가 동시에 다른 요청 만들어도 race condition 없음 (다른 문서)
//   - 한 요청 변경이 다른 요청에 영향 0
//   - 단일 문서가 wipe돼도 requests/ 컬렉션은 손상 안 됨

function setupRequestsCollectionListener() {
  if (!window.firebaseReady) return;
  if (window._requestsCollectionListenerActive) return;
  if (!window.firebaseOnSnapshot || !window.firebaseCollection) return;

  try {
    const col = window.firebaseCollection(window.firebaseDB, 'requests');
    window.firebaseOnSnapshot(col, (snap) => {
      // ⚠️ hasPendingWrites 필터 제거: PC가 자기 변경 중일 때 폰의 변경이
      // 같이 무시되던 버그. 자기 변경의 echo는 어차피 같은 데이터라 안전함.
      const newReqs = [];
      snap.forEach(doc => {
        const d = doc.data();
        const cleaned = {};
        for (const k in d) {
          if (k.charAt(0) !== '_') cleaned[k] = d[k];  // 메타 필드 (_syncedAt, _device 등) 제외
        }
        newReqs.push(cleaned);
      });
      console.log('🔄 requests/ listener fired (' + newReqs.length + '건, pending=' + (snap.metadata && snap.metadata.hasPendingWrites) + ')');

      // 사용자가 입력 중이면 sync 보류 (입력 깨짐 방지)
      const isTyping = (function() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'button') return true;
        if (el.tagName === 'TEXTAREA') return true;
        return false;
      })();
      if (isTyping) {
        window._pendingRequestsSync = newReqs;
        return;
      }
      _applyRequestsSync(newReqs);
    }, (err) => {
      console.error('requests/ listener error:', err);
    });
    window._requestsCollectionListenerActive = true;
    console.log('✓ Phase 2 cutover: requests/ 컬렉션 listener 활성화');
  } catch (err) {
    console.error('requests/ listener 등록 실패:', err);
  }
}

function _applyRequestsSync(newReqs) {
  // 전역 requests 배열을 교체 (in-place로 다른 모듈의 참조 유지)
  if (typeof requests === 'undefined') return;
  // 리셋 중이면 listener echo 무시 (중간 상태가 화면에 깜빡이는 것 방지)
  if (window._resetInProgress) {
    console.log('⏸️ reset 중 — listener echo 무시');
    return;
  }
  requests.length = 0;
  newReqs.forEach(r => requests.push(r));
  // 대량 감소 가드 기준선 갱신 — listener가 메모리를 교체했으므로 다음 saveToFirebase는
  // 이 새 기준에서 비교해야 함 (안 그러면 옛 단일문서 카운트 vs 새 컬렉션 카운트로 false alarm)
  if (window._lastCloudSnapshot) window._lastCloudSnapshot.requestsCount = newReqs.length;
  // localStorage 갱신 (오프라인 대비)
  if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
  // 헤더 + 현재 탭 재렌더링
  if (typeof updateHeaderStats === 'function') updateHeaderStats();
  if (typeof currentTab !== 'undefined') {
    const fnName = 'render' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
    const renderFn = window[fnName];
    if (typeof renderFn === 'function') renderFn();
  }
}

// 입력이 끝나면 보류된 sync 적용
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (window._pendingRequestsSync) {
      const data = window._pendingRequestsSync;
      window._pendingRequestsSync = null;
      _applyRequestsSync(data);
    }
  }, 0);
}, true);

// 백그라운드 탭 복귀/네트워크 재연결 시 강제 동기화
// 모바일 Chrome은 백그라운드 탭의 listener를 잠재움 → 깨어나도 자동으로 안 따라잡음
async function forceFetchRequestsCollection() {
  if (!window.firebaseReady || !window.firebaseCollection) return;
  try {
    if (!window.firebaseGetDocs) {
      const { getDocs } = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js');
      window.firebaseGetDocs = getDocs;
    }
    const col = window.firebaseCollection(window.firebaseDB, 'requests');
    const snap = await window.firebaseGetDocs(col);
    const newReqs = [];
    snap.forEach(doc => {
      const d = doc.data();
      const cleaned = {};
      for (const k in d) if (k.charAt(0) !== '_') cleaned[k] = d[k];
      newReqs.push(cleaned);
    });
    _applyRequestsSync(newReqs);
    console.log('🔄 force fetch requests/ (' + newReqs.length + '건)');
  } catch (err) {
    console.warn('force fetch 실패:', err && err.message);
  }
}

// 탭이 다시 보이면 강제 sync (백그라운드에서 잠들었다 깨는 케이스)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    forceFetchRequestsCollection();
  }
});

// 윈도우 포커스 들어올 때도
window.addEventListener('focus', () => {
  forceFetchRequestsCollection();
});

// 네트워크 재연결 시
window.addEventListener('online', () => {
  console.log('🌐 네트워크 재연결 — sync');
  forceFetchRequestsCollection();
});

// 폴링 백업: listener가 어떤 이유로든 잠들어도 따라잡기용 안전망.
// 탭이 활성일 때만 동작 (백그라운드일 땐 visibility 핸들러가 처리).
// 30초 간격 — Firestore 비용 절약 (50명 동시접속 시 5초 폴링은 무료 한도 초과 위험).
//   listener는 변경분만 read 비용 (거의 무료) → 평소엔 listener에 의존, 폴링은 안전망.
//   사용자 행동(visibility/focus/online) 시점엔 즉시 fetch되므로 30초여도 체감 OK.
window._phase2PollTimer = window._phase2PollTimer || setInterval(() => {
  if (document.visibilityState === 'visible' && window._requestsCollectionListenerActive) {
    forceFetchRequestsCollection();
  }
}, 30000);

// Firebase 준비되면 listener 활성화
if (typeof window !== 'undefined') {
  if (window.firebaseReady) {
    setTimeout(setupRequestsCollectionListener, 1000);
  } else {
    window.addEventListener('firebaseReady', () => {
      setTimeout(setupRequestsCollectionListener, 1000);
    }, { once: true });
  }
}

// 메인 saveAll에서 자동으로 호출되도록 hook
// 5-storage.js의 saveAll을 직접 수정하는 대신 monkey-patch (안전)
(function setupParallelWrite() {
  if (typeof window === 'undefined') return;
  // saveAll이 정의되기 전에 이 파일이 먼저 로드될 수 있음 → DOMContentLoaded 후 패치
  function patchSaveAll() {
    const original = window.saveAll;
    if (typeof original !== 'function' || original._phase2Patched) return;
    window.saveAll = function() {
      const r = original.apply(this, arguments);
      // 병렬 쓰기: 변경된 거 모두 (간단히 전체 upsert — 서버는 idempotent)
      // 디바운스 짧게 (300ms) — 실시간성 향상
      clearTimeout(window._phase2DebounceTimer);
      window._phase2DebounceTimer = setTimeout(() => {
        // 리셋 진행 중이면 push 안 함 (옛 데이터 부활 방지)
        if (window._resetInProgress) {
          console.log('⏸️ reset 중 — Phase 2 push 건너뜀');
          return;
        }
        if (Array.isArray(requests) && requests.length > 0) {
          upsertRequestsBatch(requests);
        }
      }, 300);
      return r;
    };
    window.saveAll._phase2Patched = true;
    console.log('✓ Phase 2 병렬 쓰기 hook 활성화 (디바운스 300ms)');
  }
  // 다른 스크립트가 다 로드된 후 patch
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(patchSaveAll, 500));
  } else {
    setTimeout(patchSaveAll, 500);
  }
})();

// 콘솔 진단: Phase 2 상태 한 번에 확인
window.mcCheckPhase2Status = function() {
  console.log('=== Phase 2 상태 ===');
  console.log('Firebase 준비:', window.firebaseReady);
  console.log('컬렉션 listener 활성:', window._requestsCollectionListenerActive);
  console.log('병렬 쓰기 hook:', !!(window.saveAll && window.saveAll._phase2Patched));
  console.log('현재 requests 수:', (requests || []).length);
  console.log('---');
  console.log('만약 listener 비활성이면: setupRequestsCollectionListener() 직접 호출 시도');
  console.log('또는 페이지 하드 리로드 (Ctrl+Shift+R)');
};
