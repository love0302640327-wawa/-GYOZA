/* 餃作 GYOZA — 3D tilt + moving glare on [data-tilt] cards (desktop mouse only). */
(function () {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var current = null, pending = null, raf = 0;

  function reset(el) {
    el.classList.remove('tilting');
    el.style.transform = '';
  }
  function apply() {
    raf = 0;
    var e = pending, el = e && e.target && e.target.closest ? e.target.closest('[data-tilt]') : null;
    if (current && current !== el) reset(current);
    current = el;
    if (!el) return;
    if (!el.querySelector(':scope > .tilt-glare')) {
      var glare = document.createElement('span');
      glare.className = 'tilt-glare'; glare.setAttribute('aria-hidden', 'true');
      el.appendChild(glare);
    }
    var r = el.getBoundingClientRect();
    var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    var y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    var max = parseFloat(el.getAttribute('data-tilt')) || 8;
    el.classList.add('tilting');
    el.style.transform = 'perspective(' + Math.round(r.width * 2.4 + 400) + 'px) rotateX(' + ((0.5 - y) * max * 2).toFixed(2) +
      'deg) rotateY(' + ((x - 0.5) * max * 2).toFixed(2) + 'deg) translateY(-6px) scale(1.02)';
    el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
  }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    pending = e; if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener('pointerout', function (e) {
    if (!e.relatedTarget && current) { reset(current); current = null; }
  });
  addEventListener('blur', function () { if (current) { reset(current); current = null; } });
})();
