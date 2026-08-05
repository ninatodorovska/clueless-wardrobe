/* ═══════════════════════════════════════════════════════
   Cross-origin isolation for static hosts.

   onnxruntime only runs multi-threaded when the page is
   crossOriginIsolated, which needs COOP/COEP response
   headers. GitHub Pages won't let you set headers, so this
   service worker re-serves every response with them attached.

   Running locally via START.bat you don't need this — serve.ps1
   sends the real headers and this script no-ops.

   Based on the widely-used coi-serviceworker pattern.
   If anything here fails the app still works, just single-
   threaded, so every path degrades quietly.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (typeof window === 'undefined') {
    /* ── service worker side ── */
    self.addEventListener('install', function () { self.skipWaiting(); });
    self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

    self.addEventListener('fetch', function (event) {
      var r = event.request;
      if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

      event.respondWith(
        fetch(r)
          .then(function (res) {
            if (res.status === 0) return res;               /* opaque, leave alone */
            var headers = new Headers(res.headers);
            headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
            headers.set('Cross-Origin-Opener-Policy', 'same-origin');
            headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
            return new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers: headers
            });
          })
          .catch(function (e) { console.error(e); })
      );
    });
    return;
  }

  /* ── page side ── */
  if (window.crossOriginIsolated) return;          /* real headers already present */
  if (!window.isSecureContext) return;             /* SW needs https or localhost */
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register(window.document.currentScript.src)
    .then(function (reg) {
      /* reload exactly once, so the SW can control this page */
      reg.addEventListener('updatefound', function () { /* noop */ });
      if (reg.active && !navigator.serviceWorker.controller) {
        if (!sessionStorage.getItem('coiReloaded')) {
          sessionStorage.setItem('coiReloaded', '1');
          window.location.reload();
        }
      }
    })
    .catch(function (err) { console.warn('COI service worker not registered:', err); });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!sessionStorage.getItem('coiReloaded')) {
      sessionStorage.setItem('coiReloaded', '1');
      window.location.reload();
    }
  });
})();
