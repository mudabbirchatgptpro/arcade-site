// Phase 9: heads-up toast renderer.
// Listens for `notification:set` IPC events from the launcher, swaps
// the toast text, replays the slide-in animation, and (optionally)
// auto-fades after a delay. Sticky toasts stay until they're
// explicitly replaced or the BrowserView is dismounted.
(function () {
  var $toast = document.getElementById('toast');
  if (!$toast) return;

  var fadeTimer = null;

  function showToast(message, autoFadeMs, sticky) {
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }

    // Clear classes, set text, force a layout, then add `visible` so
    // the CSS transition replays even if the toast was already on
    // screen with a previous message.
    $toast.classList.remove('visible', 'fading');
    $toast.textContent = message;
    void $toast.offsetWidth; // force layout
    requestAnimationFrame(function () {
      $toast.classList.add('visible');
    });

    if (autoFadeMs && autoFadeMs > 0 && !sticky) {
      fadeTimer = setTimeout(function () {
        $toast.classList.remove('visible');
        $toast.classList.add('fading');
      }, autoFadeMs);
    }
  }

  if (window.arcadeOverlay && typeof window.arcadeOverlay.onNotification === 'function') {
    window.arcadeOverlay.onNotification(function (payload) {
      if (!payload || typeof payload.message !== 'string') return;
      showToast(payload.message, payload.autoFadeMs, payload.sticky);
    });
  }
})();
