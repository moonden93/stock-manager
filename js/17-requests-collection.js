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
      // 너무 자주 부르면 안 되니까 디바운스
      clearTimeout(window._phase2DebounceTimer);
      window._phase2DebounceTimer = setTimeout(() => {
        if (Array.isArray(window.requests) && window.requests.length > 0) {
          upsertRequestsBatch(window.requests);
        }
      }, 1500);
      return r;
    };
    window.saveAll._phase2Patched = true;
    console.log('✓ Phase 2 병렬 쓰기 hook 활성화');
  }
  // 다른 스크립트가 다 로드된 후 patch
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(patchSaveAll, 500));
  } else {
    setTimeout(patchSaveAll, 500);
  }
})();
