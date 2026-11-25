// Tooltip kecil untuk sidebar (Liner: ikon polos, label muncul di kanan).
// Satu elemen melayang, posisi fixed, supaya tidak terpotong overflow sidebar.
(function () {
  'use strict';
  var tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);
  var timer = 0;

  function show(el) {
    var text = el.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    var r = el.getBoundingClientRect();
    tip.style.left = Math.round(r.right + 12) + 'px';
    tip.style.top = '0px';
    var h = tip.offsetHeight;
    tip.style.top = Math.round(r.top + r.height / 2 - h / 2) + 'px';
    tip.classList.add('on');
  }
  function hide() { clearTimeout(timer); tip.classList.remove('on'); }

  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return hide();
    clearTimeout(timer);
    timer = setTimeout(function () { show(el); }, 250);
  });
  document.addEventListener('mouseout', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('mousedown', hide);
})();
