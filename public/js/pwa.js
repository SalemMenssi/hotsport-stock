(function () {
  const installBtn = document.getElementById('installBtn');
  const banner = document.getElementById('pwaBanner');
  let deferred = null;
  let refreshing = false;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function showInstallUi(show) {
    if (isStandalone()) {
      if (installBtn) installBtn.hidden = true;
      if (banner) banner.hidden = true;
      return;
    }
    if (installBtn) installBtn.hidden = !show;
    if (banner && show && localStorage.getItem('hs_pwa_dismiss') !== '1') {
      banner.hidden = false;
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            // Soft-activate new SW on next load
            worker.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(() => {});

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Keep session; just reload to pick upgraded assets
      window.location.reload();
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    showInstallUi(true);
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    showInstallUi(false);
    localStorage.setItem('hs_pwa_dismiss', '1');
  });

  async function promptInstall() {
    if (!deferred) {
      // iOS / unsupported browsers: show tip
      const tip = document.getElementById('toast');
      if (tip) {
        tip.hidden = false;
        tip.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? 'Share → Add to Home Screen'
          : 'Use browser menu → Install app';
        clearTimeout(promptInstall._t);
        promptInstall._t = setTimeout(() => { tip.hidden = true; }, 3200);
      }
      return;
    }
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      deferred = null;
      showInstallUi(false);
    }
  }

  if (installBtn) installBtn.addEventListener('click', promptInstall);
  const pwaInstall = document.getElementById('pwaInstall');
  if (pwaInstall) pwaInstall.addEventListener('click', promptInstall);
  const dismiss = document.getElementById('pwaDismiss');
  if (dismiss) {
    dismiss.addEventListener('click', () => {
      if (banner) banner.hidden = true;
      localStorage.setItem('hs_pwa_dismiss', '1');
    });
  }

  // Hash deep-links for PWA shortcuts (#pos / #stock)
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace('#', '');
    if (id && window.__hsGo) window.__hsGo(id);
  });

  if (isStandalone()) showInstallUi(false);

  async function enablePush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch('/api/push/public-key', { credentials: 'same-origin' });
      const keyData = await keyRes.json();
      if (keyData.publicKey && 'PushManager' in window) {
        const pad = '='.repeat((4 - (keyData.publicKey.length % 4)) % 4);
        const raw = Uint8Array.from(atob(keyData.publicKey.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0));
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON())
        });
      }
    } catch (_) {}
  }

  window.__hsEnablePush = enablePush;
})();
