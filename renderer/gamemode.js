// =============================================================================
// Mode Game: keyboard + mouse laptop -> sentuhan multi-jari di HP (game apa pun)
//   WASD          -> joystick kiri (jari 10)
//   gerak mouse   -> geser kamera (jari 11), bisa tanpa batas (jari diangkat lalu turun lagi)
//   klik / tombol -> ketuk titik di layar (jari 20+), tahan selama tombol ditahan
// Posisi tombol disimpan per profil di localStorage, bisa digeser lewat editor (Alt+E).
// Pintasan: Alt+G nyala/mati, Alt+E editor, Alt+J ganti preset. Esc melepas mouse (jeda).
// Memakai variabel dari mirror.js: canvas, stage, sessionInfo, controlEnabled, showToast.
// =============================================================================
(function () {
  const POINTER_JOY = 10;
  const POINTER_CAM = 11;
  const POINTER_BTN0 = 20;
  const STORE_KEY = 'emumir.gamemode.v1';
  const OLD_STORE_KEY = 'pairly.gamemode.v1';   // nama lama, dibaca sekali supaya preset tidak hilang
  const CAM_IDLE_MS = 90;       // diam segini -> jari kamera diangkat
  const KEY_LABEL = (c) => c.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', 'L').replace('Right', 'R')
    .replace('Space', 'Spasi').replace('Mouse0', 'Klik kiri').replace('Mouse2', 'Klik kanan')
    .replace('Mouse1', 'Klik tengah').replace('Mouse3', 'M-Back').replace('Mouse4', 'M-Fwd');

  const HOME = null;   // belum ada preset dipilih: tombol tidak muncul, input normal
  // Koordinat tombol 0..1 (relatif ke layar HP). Tidak ada preset bawaan: buat sendiri lewat menu preset.
  function fixProfile(p) {
    if (!Array.isArray(p.pkgs)) p.pkgs = [];
    p.ui = Object.assign({ show: true, opacity: 0.6, size: 1 }, p.ui || {});
    if (!p.joystick) p.joystick = { x: 0.15, y: 0.68, r: 0.13 };
    if (!p.camera) p.camera = { x: 0.62, y: 0.38, sens: 1.0, box: 0.14 };
    if (!p.keys) p.keys = {};
    return p;
  }

  const JOY_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };

  // ---- Penyimpanan profil ----
  let store;
  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY) || 'null');
      if (raw && raw.profiles) {
        if (typeof raw.auto !== 'boolean') raw.auto = true;
        if (!raw.profiles[raw.active]) raw.active = HOME;
        for (const id of Object.keys(raw.profiles)) fixProfile(raw.profiles[id]);
        return raw;
      }
    } catch (e) { /* abaikan */ }
    return { active: HOME, auto: true, profiles: {} };
  }
  // Salinan di berkas (gamemode.json) supaya preset tidak hilang kalau penyimpanan WebView dibersihkan.
  let fileRev = 0;
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* abaikan */ }
    try {
      fileRev += 1;
      if (window.api && window.api.gmPresetsSet) window.api.gmPresetsSet({ rev: fileRev, store: store });
    } catch (e) { /* abaikan */ }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  store = loadStore();
  setTimeout(async () => {
    // awal: kalau berkas sudah ada, itu sumber utama. Kalau belum, tulis dari sini.
    try {
      const f = window.api && window.api.gmPresetsGet ? await window.api.gmPresetsGet() : null;
      if (f && f.store && f.store.profiles && typeof f.rev === 'number') {
        for (const id of Object.keys(f.store.profiles)) fixProfile(f.store.profiles[id]);
        if (!f.store.profiles[f.store.active]) f.store.active = HOME;
        store = f.store; fileRev = f.rev;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* abaikan */ }
        refreshBadge();
      } else saveStore();
    } catch (e) { /* abaikan */ }
  }, 800);
  const noPreset = () => !store.active || !store.profiles[store.active];
  const EMPTY_PROFILE = { name: 'Belum ada preset', joystick: { x: 0, y: 0, r: 0 }, camera: { x: 0, y: 0, sens: 1, box: 0 }, keys: {}, ui: { show: false, opacity: 0, size: 1 } };
  const profile = () => (noPreset() ? EMPTY_PROFILE : store.profiles[store.active]);

  // ---- State ----
  let active = false;
  let editing = false;
  let locked = false;
  const joyHeld = new Set();            // KeyW/A/S/D yang sedang ditahan
  let joyDown = false;
  const btnDown = new Map();            // code -> pointerId yang sedang turun
  let camDown = false, camX = 0, camY = 0, camIdle = null;
  let camDX = 0, camDY = 0, camRaf = 0;

  const badge = document.createElement('div');
  badge.className = 'game-badge hidden';
  stage.appendChild(badge);
  const overlay = document.getElementById('gmOverlay');
  const btnGame = document.getElementById('btnGame');
  const btnGameEdit = document.getElementById('btnGameEdit');
  const btnGamePreset = document.getElementById('btnGamePreset');

  // ---- Kirim sentuhan ----
  function dims() { return sessionInfo ? { w: sessionInfo.width, h: sessionInfo.height } : null; }
  function touch(action, id, nx, ny) {
    const d = dims();
    if (!d) return;
    window.api.sendTouch({
      action, pointerId: id,
      x: Math.min(Math.max(nx, 0), 1) * d.w,
      y: Math.min(Math.max(ny, 0), 1) * d.h,
      screenWidth: d.w, screenHeight: d.h,
      actionButton: 0, buttons: 0,
    });
  }

  // ---- Joystick (WASD) ----
  function updateJoystick() {
    const d = dims();
    if (!d) return;
    const j = profile().joystick;
    let vx = 0, vy = 0;
    for (const k of joyHeld) { vx += JOY_KEYS[k][0]; vy += JOY_KEYS[k][1]; }
    const len = Math.hypot(vx, vy);
    if (len === 0) {
      if (joyDown) { touch(1, POINTER_JOY, j.x, j.y); joyDown = false; }
      return;
    }
    vx /= len; vy /= len;
    // jari bergerak sejauh r (tinggi layar) dari pusat; kompensasi rasio supaya lingkaran bulat
    const rx = (j.r * d.h) / d.w, ry = j.r;
    if (!joyDown) { touch(0, POINTER_JOY, j.x, j.y); joyDown = true; }
    touch(2, POINTER_JOY, j.x + vx * rx, j.y + vy * ry);
  }

  // ---- Kamera (gerak mouse) ----
  function camRelease() {
    clearTimeout(camIdle); camIdle = null;
    if (camDown) { touch(1, POINTER_CAM, camX, camY); camDown = false; }
  }
  function camFlush() {
    camRaf = 0;
    const d = dims();
    if (!d || !locked) { camDX = camDY = 0; return; }
    const c = profile().camera;
    const dx = camDX, dy = camDY;
    camDX = camDY = 0;
    if (dx === 0 && dy === 0) return;
    // 1 px mouse -> sens px layar HP (skala dari ukuran canvas ke layar HP)
    const rect = canvas.getBoundingClientRect();
    const scale = (d.h / rect.height) * c.sens;
    if (!camDown) { camX = c.x; camY = c.y; touch(0, POINTER_CAM, camX, camY); camDown = true; }
    camX += (dx * scale) / d.w;
    camY += (dy * scale) / d.h;
    const bx = c.box, by = c.box * (d.w / d.h) * 0.6;
    const out = camX < c.x - bx || camX > c.x + bx || camY < c.y - by || camY > c.y + by;
    if (out) {
      // keluar kotak: angkat jari, turun lagi di tengah (kamera tetap lanjut)
      touch(1, POINTER_CAM, camX, camY);
      camX = c.x; camY = c.y;
      touch(0, POINTER_CAM, camX, camY);
    } else {
      touch(2, POINTER_CAM, camX, camY);
    }
    clearTimeout(camIdle);
    camIdle = setTimeout(camRelease, CAM_IDLE_MS);
  }
  function camMove(dx, dy) {
    camDX += dx; camDY += dy;
    if (!camRaf) camRaf = requestAnimationFrame(camFlush);
  }

  // ---- Tombol (keyboard + klik mouse) ----
  function keyId(code) {
    const codes = Object.keys(profile().keys);
    return POINTER_BTN0 + Math.max(0, codes.indexOf(code));
  }
  function pressBtn(code) {
    const k = profile().keys[code];
    if (!k || btnDown.has(code)) return false;
    const id = keyId(code);
    btnDown.set(code, id);
    touch(0, id, k.x, k.y);
    return true;
  }
  function releaseBtn(code) {
    const id = btnDown.get(code);
    if (id === undefined) return;
    const k = profile().keys[code];
    btnDown.delete(code);
    if (k) touch(1, id, k.x, k.y);
  }

  function releaseAll() {
    joyHeld.clear();
    if (joyDown) { const j = profile().joystick; touch(1, POINTER_JOY, j.x, j.y); joyDown = false; }
    camRelease();
    for (const code of Array.from(btnDown.keys())) releaseBtn(code);
  }

  // ---- Nyala / mati ----
  function refreshBadge() {
    const none = noPreset();
    const playing = active && locked && !editing && !none;
    badge.classList.toggle('hidden', !active || playing);
    badge.textContent = 'MODE GAME · ' + (none ? 'belum ada preset' : profile().name) + (editing ? ' · EDIT' : (none ? ' · buat lewat menu preset' : (locked ? '' : ' · klik untuk lanjut')));
    btnGame.classList.toggle('active', active);
    btnGameEdit.classList.toggle('active', editing);
    btnGameEdit.classList.toggle('hidden', !active || none);
    btnGamePreset.classList.toggle('hidden', !active);
    btnGamePreset.textContent = (none ? 'Preset' : profile().name) + ' \u25BE';
    renderPlayOverlay();
  }

  function setActive(on) {
    if (on && (!sessionInfo || !controlEnabled)) { showToast('belum ada layar atau kontrol mati', true); return; }
    if (on === active) return;
    active = on;
    if (!on) {
      setEditing(false);
      releaseAll();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      showToast('mode game mati');
    } else {
      lastPkg = null;
      canvas.focus();
      showToast(noPreset() ? 'Mode game nyala. Buat preset lewat menu Preset' : profile().name + ': klik layar untuk tangkap mouse. Alt+E = atur tombol');
    }
    refreshBadge();
  }

  // ---- Deteksi app di HP: layar utama/app lain -> Home, game -> presetnya ----
  let lastPkg = null;
  let polling = false;
  const IGNORE_PKG = /^(com\.android\.systemui|com\.android\.launcher\d*\.recents)$/;

  function presetForPkg(pkg) {
    for (const id of Object.keys(store.profiles)) {
      if ((store.profiles[id].pkgs || []).indexOf(pkg) >= 0) return id;
    }
    return null;
  }

  function autoSwitchTo(id, pkg) {
    if (id === store.active) return;
    releaseAll();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    store.active = id;
    saveStore();
    if (editing) renderEditor();
    refreshBadge();
    showToast('otomatis: ' + profile().name);
  }

  async function pollForeground() {
    if (polling || !active || !store.auto || editing || !mirrorSerial) return;
    polling = true;
    try {
      const r = await window.api.phoneForeground(mirrorSerial);
      if (!r || !r.ok || !r.pkg || IGNORE_PKG.test(r.pkg)) return;
      if (!active || editing) return;
      // ganti hanya saat app berubah, jadi pilihan manual (Alt+J) tidak ditimpa terus
      if (r.pkg === lastPkg) return;
      lastPkg = r.pkg;
      const match = presetForPkg(r.pkg);
      if (match) autoSwitchTo(match, r.pkg);
    } catch (e) { /* adb mati: biarkan manual */ }
    finally { polling = false; }
  }
  setInterval(pollForeground, 2000);

  function lockMouse() {
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (e) { /* abaikan */ } });
    } catch (e) {
      try { canvas.requestPointerLock(); } catch (e2) { /* abaikan */ }
    }
  }

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (active && !locked) releaseAll();
    refreshBadge();
  });
  window.addEventListener('blur', () => { if (active) releaseAll(); });

  function selectPreset(id) {
    if (!store.profiles[id]) return;
    releaseAll();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    store.active = id;
    lastPkg = null;
    saveStore();
    if (editing) renderEditor();
    refreshBadge();
    showToast('preset: ' + profile().name);
  }

  function cycleProfile() {
    const ids = Object.keys(store.profiles);
    if (!ids.length) { showToast('belum ada preset. Buat lewat menu Preset', true); return; }
    selectPreset(ids[(ids.indexOf(store.active) + 1) % ids.length]);
  }

  function newId() { let i = 1; while (store.profiles['g' + i]) i++; return 'g' + i; }

  function newPreset() {
    const name = 'Preset ' + (Object.keys(store.profiles).length + 1);
    const id = newId();
    store.profiles[id] = fixProfile({ name });
    releaseAll();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    store.active = id;
    lastPkg = null;
    saveStore();
    if (editing) renderEditor(); else setEditing(true);
    refreshBadge();
    showToast('preset baru: ' + name + '. Tambah tombol, geser ke tempatnya, ganti nama.');
  }

  function duplicatePreset() {
    if (noPreset()) { showToast('belum ada preset untuk diduplikat', true); return; }
    const copy = clone(profile());
    copy.name = copy.name + ' (2)';
    const id = newId();
    store.profiles[id] = fixProfile(copy);
    releaseAll();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    store.active = id;
    lastPkg = null;
    saveStore();
    if (editing) renderEditor();
    refreshBadge();
    showToast('preset diduplikat: ' + copy.name);
  }

  // ---- Dropdown preset (daftar preset, + New preset, Duplicate) ----
  const menu = document.createElement('div');
  menu.className = 'gm-menu hidden';
  document.body.appendChild(menu);
  function closeMenu() { menu.classList.add('hidden'); }
  function menuItem(icon, label, on, disabled, onClick) {
    const it = document.createElement('div');
    it.className = 'gm-mi' + (on ? ' on' : '') + (disabled ? ' off' : '');
    const ic = document.createElement('span'); ic.className = 'gm-ic'; ic.textContent = icon;
    const tx = document.createElement('span'); tx.textContent = label;
    it.append(ic, tx);
    if (!disabled) it.addEventListener('click', () => { closeMenu(); onClick(); });
    return it;
  }
  function openMenu() {
    menu.textContent = '';
    const ids = Object.keys(store.profiles);
    for (const id of ids) menu.append(menuItem(id === store.active ? '\u2713' : '', store.profiles[id].name, id === store.active, false, () => selectPreset(id)));
    if (ids.length) { const sep = document.createElement('div'); sep.className = 'gm-sep'; menu.append(sep); }
    menu.append(menuItem('+', 'New preset', false, false, newPreset));
    menu.append(menuItem('\u29C9', 'Duplicate', false, noPreset(), duplicatePreset));
    const r = btnGamePreset.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 200)) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    menu.classList.remove('hidden');
  }
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !btnGamePreset.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') closeMenu(); }, true);
  window.addEventListener('blur', closeMenu);

  // ---- Input: tangkap sebelum handler mirror.js (capture) ----
  const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

  canvas.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.code === 'KeyG') { swallow(e); setActive(!active); return; }
      if (active && e.code === 'KeyE') { swallow(e); if (noPreset()) { showToast('belum ada preset. Buat lewat menu Preset', true); return; } setEditing(!editing); return; }
      if (active && e.code === 'KeyJ') { swallow(e); cycleProfile(); return; }
      if (active && !noPreset() && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        swallow(e);
        const c = profile().camera;
        c.sens = Math.min(5, Math.max(0.1, +(c.sens * (e.code === 'BracketRight' ? 1.1 : 1 / 1.1)).toFixed(2)));
        saveStore();
        if (editing) { gmSens.value = Math.round(c.sens * 100); gmSensVal.textContent = c.sens.toFixed(2); }
        showToast('sens kamera: ' + c.sens.toFixed(2));
        return;
      }
    }
    if (!active || noPreset()) return;
    swallow(e);
    if (editing) { onEditorKey(e); return; }
    if (e.repeat) return;
    if (JOY_KEYS[e.code]) { joyHeld.add(e.code); updateJoystick(); return; }
    pressBtn(e.code);
  }, true);

  canvas.addEventListener('keyup', (e) => {
    if (!active || noPreset()) return;
    swallow(e);
    if (JOY_KEYS[e.code]) { joyHeld.delete(e.code); updateJoystick(); return; }
    releaseBtn(e.code);
  }, true);

  canvas.addEventListener('pointerdown', (e) => {
    if (!active || noPreset()) return;
    swallow(e);
    canvas.focus();
    if (editing) return;
    if (!locked) { lockMouse(); return; }
    pressBtn('Mouse' + e.button);
  }, true);

  canvas.addEventListener('pointerup', (e) => {
    if (!active || noPreset()) return;
    swallow(e);
    releaseBtn('Mouse' + e.button);
  }, true);

  canvas.addEventListener('pointercancel', (e) => { if (active && !noPreset()) { swallow(e); releaseAll(); } }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (!active || noPreset()) return;
    swallow(e);
    if (locked && !editing) camMove(e.movementX || 0, e.movementY || 0);
  }, true);

  canvas.addEventListener('wheel', (e) => { if (active && !noPreset()) swallow(e); }, { capture: true, passive: false });
  canvas.addEventListener('auxclick', (e) => { if (active && !noPreset()) swallow(e); }, true);
  canvas.addEventListener('contextmenu', (e) => { if (active && !noPreset()) swallow(e); }, true);

  // ===========================================================================
  // Editor: geser titik tombol di atas layar
  // ===========================================================================
  let addingKey = false;
  const panel = document.createElement('div');
  panel.className = 'gm-panel hidden';
  panel.innerHTML =
    '<b>Atur tombol</b> <span class="gm-sub" id="gmProfileName"></span><br>' +
    'Geser titik ke posisi tombol di game. Klik kanan titik = hapus. Putar roda mouse di titik = kecil/besar.<br>' +
    '<button id="gmAdd">+ Tombol</button> ' +
    '<button id="gmReset">Reset preset</button> ' +
    '<button id="gmDone">Selesai</button>' +
    '<div class="gm-row">' +
    '<label class="gm-chk"><input type="checkbox" id="gmShow"> Tampilkan tombol saat main</label>' +
    '</div>' +
    '<div class="gm-row">' +
    '<label>Sens kamera <input type="range" id="gmSens" min="10" max="500" step="5"> <span id="gmSensVal"></span></label> ' +
    '<label>Transparan <input type="range" id="gmOpacity" min="10" max="100" step="5"> <span id="gmOpacityVal"></span></label> ' +
    '<label>Ukuran <input type="range" id="gmSize" min="40" max="150" step="5"> <span id="gmSizeVal"></span></label>' +
    '</div>' +
    '<div class="gm-row">' +
    '<label class="gm-chk"><input type="checkbox" id="gmAuto"> Otomatis ganti preset (deteksi app di HP)</label> ' +
    '<input type="text" id="gmPkgs" class="gm-wide" placeholder="package game, pisah koma"> ' +
    '</div>' +
    '<div class="gm-row">' +
    '<input type="text" id="gmName" maxlength="24" placeholder="nama game"> ' +
    '<button id="gmRename">Ganti nama</button> ' +
    '<button id="gmDel">Hapus preset</button>' +
    '</div>';
  stage.appendChild(panel);
  const gmSensVal = panel.querySelector('#gmSensVal');
  const gmShow = panel.querySelector('#gmShow');
  const gmOpacity = panel.querySelector('#gmOpacity');
  const gmOpacityVal = panel.querySelector('#gmOpacityVal');
  const gmSize = panel.querySelector('#gmSize');
  const gmSizeVal = panel.querySelector('#gmSizeVal');
  const gmName = panel.querySelector('#gmName');
  const gmAuto = panel.querySelector('#gmAuto');
  const gmPkgs = panel.querySelector('#gmPkgs');

  // ---- Lapisan tombol saat main (tanpa background, transparan bisa diatur) ----
  const playLayer = document.createElement('div');
  playLayer.className = 'gm-play hidden';
  stage.appendChild(playLayer);

  function placeLayer(el) {
    const r = canvas.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    el.style.left = (r.left - s.left) + 'px';
    el.style.top = (r.top - s.top) + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
  }

  const scaleOf = (p, obj) => Math.min(Math.max((obj && obj.sc) || 1, 0.3), 2.5) * p.ui.size;

  // ---- Tampilan tombol: WASD = D-pad (cincin merah), klik mouse = ikon mouse ----
  const MOUSE_ICON = { 'Klik kiri': 'icons/mouse-left.png', 'Klik kanan': 'icons/mouse-right.png' };
  function buildFace(el, cls, label) {
    el.textContent = '';
    if (cls.indexOf('joy') >= 0) {
      el.classList.add('dpad');
      for (const k of ['W', 'A', 'S', 'D']) {
        const b = document.createElement('i');
        b.className = 'dp dp-' + k.toLowerCase();
        b.textContent = k;
        el.appendChild(b);
      }
    } else if (MOUSE_ICON[label]) {
      el.classList.add('mouse');
      const img = document.createElement('img');
      img.src = MOUSE_ICON[label];
      img.draggable = false;
      img.alt = label;
      el.appendChild(img);
    } else {
      el.textContent = label;
    }
  }

  function renderPlayOverlay() {
    const p = profile();
    const showIt = active && !editing && !noPreset() && p.ui && p.ui.show;
    playLayer.classList.toggle('hidden', !showIt);
    playLayer.textContent = '';
    if (!showIt) return;
    placeLayer(playLayer);
    playLayer.style.opacity = String(p.ui.opacity);
    const add = (label, cls, pos) => {
      const m = document.createElement('div');
      m.className = 'gm-tag ' + cls;
      buildFace(m, cls, label);
      m.style.left = (pos.x * 100) + '%';
      m.style.top = (pos.y * 100) + '%';
      m.style.transform = 'translate(-50%,-50%) scale(' + scaleOf(p, pos) + ')';
      playLayer.appendChild(m);
    };
    add('WASD', 'joy', p.joystick);
    for (const code of Object.keys(p.keys)) add(KEY_LABEL(code), 'key', p.keys[code]);
  }

  function setEditing(on) {
    if (on === editing) return;
    editing = on;
    addingKey = false;
    if (on) {
      releaseAll();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      renderEditor();
    } else {
      overlay.classList.add('hidden');
      overlay.textContent = '';
      panel.classList.add('hidden');
      saveStore();
    }
    refreshBadge();
  }

  function placeOverlay() { placeLayer(overlay); }

  function mkMarker(label, cls, getPos, setPos, onDelete) {
    const m = document.createElement('div');
    m.className = 'gm-marker ' + cls;
    buildFace(m, cls, label);
    const put = () => {
      const p = getPos();
      m.style.left = (p.x * 100) + '%';
      m.style.top = (p.y * 100) + '%';
      m.style.transform = 'translate(-50%,-50%) scale(' + scaleOf(profile(), p) + ')';
    };
    put();
    m.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      const p = getPos();
      const cur = p.sc || 1;
      p.sc = Math.min(2.5, Math.max(0.3, +(cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(3)));
      put();
      saveStore();
    }, { passive: false });
    m.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { e.preventDefault(); if (onDelete) { onDelete(); renderEditor(); } return; }
      e.preventDefault(); e.stopPropagation();
      m.setPointerCapture(e.pointerId);
      m.dataset.drag = '1';
    });
    m.addEventListener('pointermove', (e) => {
      if (m.dataset.drag !== '1') return;
      const r = overlay.getBoundingClientRect();
      setPos(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1));
      put();
    });
    const end = () => { if (m.dataset.drag === '1') { m.dataset.drag = ''; saveStore(); } };
    m.addEventListener('pointerup', end);
    m.addEventListener('pointercancel', end);
    m.addEventListener('contextmenu', (e) => e.preventDefault());
    overlay.appendChild(m);
  }

  function renderEditor() {
    const p = profile();
    placeOverlay();
    overlay.classList.remove('hidden');
    panel.classList.remove('hidden');
    overlay.textContent = '';
    panel.querySelector('#gmProfileName').textContent = '(' + p.name + ')';
    gmSensVal.textContent = p.camera.sens.toFixed(2);
    gmSens.value = Math.round(p.camera.sens * 100);
    gmShow.checked = !!p.ui.show;
    gmOpacity.value = Math.round(p.ui.opacity * 100);
    gmOpacityVal.textContent = Math.round(p.ui.opacity * 100) + '%';
    gmSize.value = Math.round(p.ui.size * 100);
    gmSizeVal.textContent = Math.round(p.ui.size * 100) + '%';
    gmName.value = p.name;
    gmAuto.checked = !!store.auto;
    gmPkgs.value = (p.pkgs || []).join(', ');
    mkMarker('WASD', 'joy', () => p.joystick, (x, y) => { p.joystick.x = x; p.joystick.y = y; });
    mkMarker('Kamera', 'cam', () => p.camera, (x, y) => { p.camera.x = x; p.camera.y = y; });
    for (const code of Object.keys(p.keys)) {
      mkMarker(KEY_LABEL(code), 'key', () => p.keys[code], (x, y) => { p.keys[code].x = x; p.keys[code].y = y; },
        () => { delete p.keys[code]; saveStore(); });
    }
  }

  function onEditorKey(e) {
    if (!addingKey) return;
    if (e.code === 'Escape') { addingKey = false; showToast('batal'); return; }
    if (JOY_KEYS[e.code] || e.code.startsWith('Alt')) return;
    profile().keys[e.code] = profile().keys[e.code] || { x: 0.5, y: 0.5 };
    addingKey = false;
    saveStore();
    renderEditor();
    showToast('tombol ' + KEY_LABEL(e.code) + ' ditambah di tengah. Geser ke tempatnya.');
  }

  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.querySelector('#gmAdd').addEventListener('click', () => {
    addingKey = true;
    canvas.focus();
    showToast('tekan tombol keyboard yang mau ditambah (Esc batal)');
  });
  const gmSens = panel.querySelector('#gmSens');
  gmSens.addEventListener('input', () => {
    const c = profile().camera;
    c.sens = gmSens.value / 100;
    gmSensVal.textContent = c.sens.toFixed(2);
    saveStore();
  });
  panel.querySelector('#gmReset').addEventListener('click', () => {
    const old = store.profiles[store.active];
    store.profiles[store.active] = fixProfile({ name: old.name, pkgs: old.pkgs });
    saveStore();
    renderEditor();
  });

  // ---- Tampil saat main, transparan, ukuran (per preset/game) ----
  gmShow.addEventListener('change', () => { profile().ui.show = gmShow.checked; saveStore(); });
  gmOpacity.addEventListener('input', () => {
    profile().ui.opacity = gmOpacity.value / 100;
    gmOpacityVal.textContent = gmOpacity.value + '%';
    saveStore();
  });
  gmSize.addEventListener('input', () => {
    profile().ui.size = gmSize.value / 100;
    gmSizeVal.textContent = gmSize.value + '%';
    saveStore();
    renderEditor();
  });

  // ---- Preset per game: ganti nama, hapus (preset baru dan duplikat ada di menu Preset) ----
  panel.querySelector('#gmRename').addEventListener('click', () => {
    const name = gmName.value.trim();
    if (!name) { showToast('isi nama dulu', true); return; }
    profile().name = name;
    saveStore();
    renderEditor();
    refreshBadge();
  });
  panel.querySelector('#gmDel').addEventListener('click', () => {
    const gone = profile().name;
    releaseAll();
    delete store.profiles[store.active];
    store.active = Object.keys(store.profiles)[0] || HOME;
    saveStore();
    if (noPreset()) setEditing(false); else renderEditor();
    refreshBadge();
    showToast('preset ' + gone + ' dihapus');
  });
  gmAuto.addEventListener('change', () => { store.auto = gmAuto.checked; lastPkg = null; saveStore(); });
  gmPkgs.addEventListener('change', () => {
    profile().pkgs = gmPkgs.value.split(/[\s,;]+/).filter((x) => /^[A-Za-z][\w]*(\.[\w]+)+$/.test(x));
    gmPkgs.value = profile().pkgs.join(', ');
    lastPkg = null;
    saveStore();
  });
  gmPkgs.addEventListener('keydown', (e) => e.stopPropagation());
  gmPkgs.addEventListener('keyup', (e) => e.stopPropagation());
  // ketik nama: jangan bocor ke game
  gmName.addEventListener('keydown', (e) => e.stopPropagation());
  gmName.addEventListener('keyup', (e) => e.stopPropagation());
  panel.querySelector('#gmDone').addEventListener('click', () => setEditing(false));

  new ResizeObserver(() => { if (editing) placeOverlay(); else renderPlayOverlay(); }).observe(stage);
  window.addEventListener('resize', () => { if (editing) placeOverlay(); else renderPlayOverlay(); });

  btnGame.addEventListener('click', () => setActive(!active));
  btnGameEdit.addEventListener('click', () => setEditing(!editing));
  btnGamePreset.addEventListener('click', () => { if (menu.classList.contains('hidden')) openMenu(); else closeMenu(); });
  refreshBadge();
})();
