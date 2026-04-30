// ============================================
// service-worker.js: PWA 캐싱 (오프라인 지원)
// ============================================
// 전략: network-first.
// - 온라인일 때는 항상 네트워크에서 최신 파일 가져옴 (Vercel 자동 배포 즉시 반영)
// - 동시에 캐시 갱신
// - 네트워크 실패(오프라인 등) 시에만 캐시 사용
// → main에 push할 때마다 사용자는 자동으로 최신 버전 사용. 오프라인 안전망만 제공.

const CACHE_NAME = 'mc-inventory-cache-v1';

// 외부 도메인 (CDN, Firebase) — 캐싱 대상이 아니라 그대로 네트워크로 처리
function isExternal(url) {
  return url.includes('firebasejs')
    || url.includes('googleapis.com')
    || url.includes('firestore')
    || url.includes('cdn.tailwindcss.com')
    || url.includes('cdn.jsdelivr.net');
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // 옛 버전 캐시 정리
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // GET이 아닌 요청은 통과
  if (req.method !== 'GET') return;

  // 외부 리소스(Firebase/CDN)는 그대로 네트워크로
  if (isExternal(req.url)) return;

  // 정적 파일: network-first, fallback to cache
  e.respondWith(
    fetch(req)
      .then(response => {
        // 정상 응답이면 캐시 갱신
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
