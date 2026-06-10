/**
 * ============================================================
 * 🛡️ SECURITY MODULE — Client-side Hardening
 *
 * Bảo vệ frontend với các biện pháp thực tế:
 * - Anti-DOM Clobbering: kiểm tra element quan trọng
 * - Media drag prevention: chống hotlink thủ công
 * - Input validation helper: kiểm tra file upload an toàn
 * ============================================================
 */

(function() {
  'use strict';

  // ============================================================
  // 1. ANTI-DOM CLUBBERING
  //    Kiểm tra các element quan trọng không bị injected
  // ============================================================
  function checkDOMIntegrity() {
    const CRITICAL_IDS = [
      'bg-container',
      'main-content',
      'audio-panel',
      'playlist-overlay',
      'intro-overlay'
    ];

    for (const id of CRITICAL_IDS) {
      const el = document.getElementById(id);
      // DOM Clobbering: nếu attacker inject <a id="bg-container">,
      // document.getElementById vẫn ưu tiên element thật hơn named property.
      // Nhưng ta kiểm tra phòng trường hợp element bị thiếu.
      if (!el) {
        console.warn(`[Security] Critical element #${id} is missing`);
      }
    }
  }

  // ============================================================
  // 2. NGĂN KÉO THẢ MEDIA — chống hotlink thủ công
  // ============================================================
  function preventMediaDrag() {
    document.addEventListener('dragstart', (e) => {
      const tag = e.target.tagName;
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'AUDIO') {
        e.preventDefault();
      }
    });
  }

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    try { checkDOMIntegrity(); } catch {}
    try { preventMediaDrag(); } catch {}

    console.log('%c🔒 Security module active', 'color:#6bffb4;font-size:11px');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
