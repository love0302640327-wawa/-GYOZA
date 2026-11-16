/* 餃作 GYOZA — 3D street scene: people come and go, queue at the door and walk into the shop.
 * Progressive enhancement: the 2D scene in #streetScene stays as the fallback if WebGL or three.js is unavailable.
 */
(function () {
  'use strict';
  var host = document.getElementById('streetScene');
  if (!host) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hasWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }
  if (!hasWebGL() || !('IntersectionObserver' in window)) return;

  function loadThree() {
    window.__loadThree = window.__loadThree || new Promise(function (resolve, reject) {
      if (window.THREE) return resolve();
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
    return window.__loadThree;
  }

  var started = false;
  var lazy = new IntersectionObserver(function (entries) {
    if (started || !entries.some(function (e) { return e.isIntersecting; })) return;
    started = true; lazy.disconnect();
    var font = document.fonts ? document.fonts.load('900 64px "Noto Serif TC"').catch(function () {}) : null;
    Promise.all([loadThree(), font]).then(init).catch(function () { /* keep 2D */ });
  }, { rootMargin: '400px' });
  lazy.observe(host);

  function init() {
    var T = window.THREE;
    var wrap = document.createElement('div');
    wrap.className = 'street3d';
    wrap.setAttribute('aria-hidden', 'true');
    var renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); }
    catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    wrap.appendChild(renderer.domElement);
    host.appendChild(wrap);
    host.classList.add('is-3d');
    window.dispatchEvent(new Event('resize')); // layout changed: let other widgets (booking button) re-measure

    var mobile = host.clientWidth < 768;
    var L = 15; // half length of the street
    var scene = new T.Scene();
    scene.background = new T.Color(0x140c09);
    scene.fog = new T.Fog(0x140c09, 16, 36);
    var camera = new T.PerspectiveCamera(30, 1, 0.1, 90);
    var lookAt = new T.Vector3(0.7, 1.45, 0);

    /* ---------- helpers ---------- */
    var matCache = {};
    function mat(color, opts) {
      var key = color + JSON.stringify(opts || {});
      if (!matCache[key]) matCache[key] = new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0, flatShading: true }, opts || {}));
      return matCache[key];
    }
    function box(w, h, d, m, x, y, z, parent) {
      var mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z); (parent || scene).add(mesh); return mesh;
    }
    function canvasTex(w, h, draw) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    /* ---------- lights ---------- */
    scene.add(new T.HemisphereLight(0x5a6890, 0x1a100c, 0.32));
    var moon = new T.DirectionalLight(0x9aaaf0, 0.28); moon.position.set(-6, 10, 8); scene.add(moon);
    var shopKey = new T.PointLight(0xffa860, 0.85, 9, 1.8); shopKey.position.set(0.6, 2.6, 2.6); scene.add(shopKey);

    /* ---------- ground ---------- */
    var street = new T.Mesh(new T.PlaneGeometry(80, 40), mat(0x16110e, { roughness: 0.95 }));
    street.rotation.x = -Math.PI / 2; street.position.set(0, 0, 8); scene.add(street);
    box(80, 0.12, 2.7, mat(0x3a2c24), 0, 0.06, 1.35);
    box(80, 0.15, 0.14, mat(0x5e4c40), 0, 0.075, 2.72);
    for (var i = -20; i <= 20; i += 2.2) {
      var dash = new T.Mesh(new T.PlaneGeometry(1.1, 0.09), mat(0xcdbb9f, { emissive: 0x2a2018 }));
      dash.rotation.x = -Math.PI / 2; dash.position.set(i, 0.005, 5.6); scene.add(dash);
    }
    // sidewalk tiles
    for (var tx = -20; tx <= 20; tx += 1.1) box(0.03, 0.005, 2.6, mat(0x2a1f19), tx, 0.123, 1.35);

    /* ---------- shop ---------- */
    var shop = new T.Group(); scene.add(shop);
    var wood = mat(0x2e1f18), dark = mat(0x140d0a);
    box(3.6, 3.2, 4, wood, -1.2, 1.6, -2, shop);   // left of door
    box(0.6, 3.2, 4, wood, 2.7, 1.6, -2, shop);    // right of door
    box(1.8, 1.1, 4, wood, 1.5, 2.65, -2, shop);   // above door
    // interior visible through the door
    var warm = new T.MeshStandardMaterial({ color: 0xffc58a, emissive: 0xff9a4d, emissiveIntensity: 0.55, roughness: 1 });
    box(1.8, 2.1, 0.05, warm, 1.5, 1.05, -3.6, shop);
    box(1.8, 0.02, 3.6, mat(0x6a4a36), 1.5, 0.01, -1.8, shop);
    box(0.05, 2.1, 3.6, mat(0x8a5a3a, { emissive: 0x3a1c0c }), 0.62, 1.05, -1.8, shop);
    box(0.05, 2.1, 3.6, mat(0x8a5a3a, { emissive: 0x3a1c0c }), 2.38, 1.05, -1.8, shop);
    box(0.9, 0.9, 0.5, mat(0x5a3a28), 1.5, 0.45, -3.1, shop); // counter
    var inLight = new T.PointLight(0xffa860, 1.1, 6, 1.6); inLight.position.set(1.5, 1.8, -1.6); shop.add(inLight);
    // door frame
    box(0.1, 2.2, 0.16, dark, 0.6, 1.1, 0.02, shop);
    box(0.1, 2.2, 0.16, dark, 2.4, 1.1, 0.02, shop);
    box(1.9, 0.12, 0.18, dark, 1.5, 2.14, 0.02, shop);
    // upper floor + roof
    box(6.8, 0.18, 1.3, dark, 0, 3.28, -0.15, shop);
    var roof = box(6.8, 0.14, 1.7, mat(0x2a1d17), 0, 3.6, -0.75, shop); roof.rotation.x = -0.38;
    box(5.6, 1.9, 3.2, mat(0x2f211b), 0, 4.55, -2.4, shop);
    var upWin = new T.MeshStandardMaterial({ color: 0x2b1c15, emissive: 0xff9a4d, emissiveIntensity: 0.22 });
    box(1.1, 0.7, 0.04, upWin, -1.6, 4.6, -0.79, shop); box(1.1, 0.7, 0.04, upWin, 0, 4.6, -0.79, shop); box(1.1, 0.7, 0.04, upWin, 1.6, 4.6, -0.79, shop);

    // sign
    var signTex = canvasTex(1024, 280, function (g, w, h) {
      g.fillStyle = '#d86f32'; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, w, h, 26); else g.rect(0, 0, w, h); g.fill();
      g.strokeStyle = 'rgba(255,250,241,.35)'; g.lineWidth = 6; g.strokeRect(18, 18, w - 36, h - 36);
      g.fillStyle = '#fffaf1'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 150px "Noto Serif TC", serif'; g.fillText('餃　作', w / 2, h / 2 - 18);
      g.font = '700 34px sans-serif'; g.fillText('G Y O Z A', w / 2, h - 46);
    });
    var sign = new T.Mesh(new T.PlaneGeometry(2.7, 0.74), new T.MeshBasicMaterial({ map: signTex, toneMapped: false }));
    sign.position.set(0, 2.66, 0.03); shop.add(sign);

    // shop window with a painted, glowing interior (chef at the griddle)
    var winTex = canvasTex(512, 300, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd8a3'); gr.addColorStop(1, '#e9873f');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(90,50,30,.25)'; for (var k = 0; k < 6; k++) g.fillRect(30 + k * 80, 30, 50, 60);
      g.fillStyle = '#5a3a2a'; g.beginPath(); g.arc(380, 120, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fffaf1'; g.fillRect(350, 64, 60, 30); g.beginPath(); g.moveTo(320, 260); g.quadraticCurveTo(380, 150, 440, 260); g.fill();
      g.fillStyle = '#7a4a2f'; g.fillRect(0, 210, w, 90);
      g.fillStyle = '#2b1c15'; g.beginPath(); g.ellipse(200, 210, 120, 26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f8f1e5'; [130, 175, 220, 265].forEach(function (x) { g.beginPath(); g.ellipse(x, 200, 22, 12, 0, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = '#d9a35a'; [130, 175, 220, 265].forEach(function (x) { g.beginPath(); g.ellipse(x, 207, 20, 5, 0, 0, Math.PI * 2); g.fill(); });
    });
    var win = new T.Mesh(new T.PlaneGeometry(2.4, 1.4), new T.MeshBasicMaterial({ map: winTex, toneMapped: false }));
    win.position.set(-1.5, 1.25, 0.012); shop.add(win);
    box(2.6, 0.1, 0.12, dark, -1.5, 1.98, 0.04, shop); box(2.6, 0.14, 0.3, dark, -1.5, 0.5, 0.1, shop);
    box(0.1, 1.5, 0.12, dark, -2.75, 1.25, 0.04, shop); box(0.1, 1.5, 0.12, dark, -0.25, 1.25, 0.04, shop);
    var winGlow = new T.PointLight(0xffa860, 0.7, 4.5, 1.8); winGlow.position.set(-1.5, 1.3, 0.9); shop.add(winGlow);

    // noren curtains
    var noren = [];
    [0, 1, 2].forEach(function (k) {
      var tex = canvasTex(160, 220, function (g, w, h) {
        g.fillStyle = '#a9502d'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w, 14);
        if (k === 1) { g.fillStyle = '#fffaf1'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 96px "Noto Serif TC", serif'; g.fillText('餃', w / 2, h / 2 + 6); }
      });
      var geo = new T.PlaneGeometry(0.56, 0.74); geo.translate(0, -0.37, 0);
      var m = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, emissive: 0x3a1206, roughness: 1 }));
      m.position.set(0.9 + k * 0.6, 2.08, 0.08); shop.add(m); noren.push(m);
    });

    // lanterns
    var lanterns = [];
    [-3.3, 3.3].forEach(function (x) {
      var g = new T.Group(); g.position.set(x, 3.15, 0.45); shop.add(g);
      var cord = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.35, 4), dark); cord.position.y = -0.17; g.add(cord);
      var body = new T.Mesh(new T.SphereGeometry(0.28, 16, 12), (function () { var m = new T.MeshBasicMaterial({ color: 0xd1301a, toneMapped: false }); m.color.convertSRGBToLinear(); return m; })());
      body.scale.set(1, 1.3, 1); body.position.y = -0.72; g.add(body);
      var cap1 = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.08, 12), dark); cap1.position.y = -0.36; g.add(cap1);
      var cap2 = cap1.clone(); cap2.position.y = -1.08; g.add(cap2);
      var l = new T.PointLight(0xff6a3a, 0.9, 5, 1.8); l.position.y = -0.72; g.add(l);
      lanterns.push(g);
    });

    // steam rising from the griddle
    var steamTex = canvasTex(64, 64, function (g) {
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    var steam = [];
    for (var s = 0; s < 10; s++) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData.t = s / 10; sp.userData.x = rnd(-0.35, 0.35); scene.add(sp); steam.push(sp);
    }

    /* ---------- neighbourhood ---------- */
    function windowsTex(cols, rows) {
      return canvasTex(cols * 32, rows * 40, function (g, w, h) {
        g.fillStyle = '#1a110d'; g.fillRect(0, 0, w, h);
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var lit = Math.random() < 0.45;
          g.fillStyle = lit ? pick(['#ffcf8a', '#ffb565', '#ffe2b0']) : '#2a1d17';
          g.fillRect(c * 32 + 7, r * 40 + 8, 18, 24);
        }
      });
    }
    function building(x, w, h, color) {
      var front = windowsTex(Math.max(2, Math.round(w * 1.4)), Math.max(2, Math.round(h * 1.1)));
      var side = mat(color);
      var face = new T.MeshStandardMaterial({ map: front, emissiveMap: front, emissive: 0xffffff, emissiveIntensity: 0.38, roughness: 1 });
      var m = new T.Mesh(new T.BoxGeometry(w, h, 4), [side, side, side, side, face, side]);
      m.position.set(x, h / 2, -2.2); scene.add(m);
      box(w + 0.2, 0.15, 0.6, dark, x, h, -0.1);
    }
    building(-5.3, 4.2, 5.4, 0x2b1f19); building(-9.8, 4.4, 7.2, 0x261b16); building(-14.4, 4.4, 4.8, 0x2e221b); building(-19, 4.6, 6.4, 0x271c17);
    building(5.4, 4.4, 4.6, 0x2d2019); building(10, 4.4, 6.8, 0x261b16); building(14.6, 4.4, 5.2, 0x2b1f19); building(19.2, 4.6, 7.6, 0x271c17);

    // street lamps
    [-7.2, 7.4].forEach(function (x) {
      box(0.1, 3.4, 0.1, dark, x, 1.7, 2.45);
      box(0.6, 0.06, 0.06, dark, x - 0.25, 3.38, 2.45);
      var head = new T.Mesh(new T.CylinderGeometry(0.12, 0.2, 0.18, 10), new T.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false }));
      head.position.set(x - 0.5, 3.28, 2.45); scene.add(head);
      var pl = new T.PointLight(0xffc88e, 1.1, 9, 1.6); pl.position.set(x - 0.5, 3.1, 2.45); scene.add(pl);
    });

    /* ---------- people ---------- */
    var legGeo = new T.BoxGeometry(0.13, 0.74, 0.15); legGeo.translate(0, -0.37, 0);
    var shoeGeo = new T.BoxGeometry(0.14, 0.07, 0.24); shoeGeo.translate(0, -0.74, 0.04);
    var armGeo = new T.BoxGeometry(0.1, 0.58, 0.11); armGeo.translate(0, -0.29, 0);
    var torsoGeo = new T.CylinderGeometry(0.18, 0.22, 0.64, 8);
    var headGeo = new T.SphereGeometry(0.14, 12, 10);
    var hairGeo = new T.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    var hatGeo = new T.CylinderGeometry(0.1, 0.17, 0.12, 12);
    var bagGeo = new T.BoxGeometry(0.22, 0.26, 0.12);
    var shadowTex = canvasTex(64, 64, function (g) {
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    var shadowMat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    var shadowGeo = new T.PlaneGeometry(0.75, 0.75);

    var COATS = [0xd86f32, 0x64705b, 0xe8dac5, 0xa9502d, 0x8a6a55, 0xc9b79c, 0x3d5a6c, 0x7b8a6e, 0xb6463a, 0xf3a366, 0x4a6b8a];
    var SKINS = [0xf1c9a5, 0xe0b08a, 0xc68f63, 0xf5d6ba, 0xa8744f];
    var HAIRS = [0x1e1511, 0x3b2a20, 0x5c3d2b, 0x9a8673];
    var PANTS = [0x2a2522, 0x3f3a36, 0x4b3c33, 0x5d5a6b, 0x2f3b45];

    function makePerson() {
      var g = new T.Group();
      var coat = mat(pick(COATS)), skin = mat(pick(SKINS)), pants = mat(pick(PANTS)), shoe = mat(0x140d0a);
      function leg(x) { var p = new T.Group(); p.position.set(x, 0.8, 0); p.add(new T.Mesh(legGeo, pants)); p.add(new T.Mesh(shoeGeo, shoe)); g.add(p); return p; }
      function arm(x) { var p = new T.Group(); p.position.set(x, 1.38, 0); p.add(new T.Mesh(armGeo, coat)); var hand = new T.Mesh(new T.SphereGeometry(0.055, 8, 6), skin); hand.position.y = -0.6; p.add(hand); g.add(p); return p; }
      var legL = leg(-0.085), legR = leg(0.085), armL = arm(-0.25), armR = arm(0.25);
      var torso = new T.Mesh(torsoGeo, coat); torso.position.y = 1.12; g.add(torso);
      var head = new T.Mesh(headGeo, skin); head.position.y = 1.58; g.add(head);
      if (Math.random() < 0.22) { var hat = new T.Mesh(hatGeo, mat(pick([0xe8dac5, 0x261a15, 0xd86f32]))); hat.position.y = 1.72; g.add(hat); }
      else { var hair = new T.Mesh(hairGeo, mat(pick(HAIRS))); hair.position.set(0, 1.6, -0.01); g.add(hair); }
      var bag = new T.Mesh(bagGeo, mat(0xfffaf1)); bag.position.set(0, -0.68, 0.02); bag.visible = false; armR.add(bag);
      var stripe = new T.Mesh(new T.BoxGeometry(0.225, 0.05, 0.125), mat(0xd86f32)); stripe.position.y = 0.04; bag.add(stripe);
      var sh = new T.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.13; g.add(sh);
      var s = rnd(0.92, 1.06); g.scale.set(s, s, s);
      scene.add(g);
      return { g: g, legL: legL, legR: legR, armL: armL, armR: armR, bag: bag, phase: Math.random() * 6, speed: rnd(0.95, 1.35), moving: false };
    }

    function turnTo(a, ang, dt) {
      var d = ang - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      a.g.rotation.y += d * Math.min(1, dt * 8);
    }
    function walkTo(a, x, z, dt) {
      var dx = x - a.g.position.x, dz = z - a.g.position.z, d = Math.hypot(dx, dz);
      if (d < 0.03) return true;
      var step = Math.min(d, a.speed * dt);
      a.g.position.x += dx / d * step; a.g.position.z += dz / d * step;
      turnTo(a, Math.atan2(dx, dz), dt); a.moving = true;
      return d - step < 0.03;
    }
    function animateLimbs(a, dt, t) {
      if (a.moving) a.phase += dt * a.speed * 7.5;
      var target = a.moving ? Math.sin(a.phase) * 0.55 : 0;
      a.swing = (a.swing || 0) + (target - (a.swing || 0)) * Math.min(1, dt * 10);
      a.legL.rotation.x = a.swing; a.legR.rotation.x = -a.swing;
      a.armL.rotation.x = -a.swing * 0.75; a.armR.rotation.x = a.bag.visible ? a.swing * 0.25 : a.swing * 0.75;
      a.g.position.y = a.moving ? Math.abs(Math.sin(a.phase)) * 0.035 : Math.sin(t * 2 + a.phase) * 0.006;
    }

    // passers-by along the sidewalk
    var walkers = [];
    var nWalk = mobile ? 4 : 7;
    for (var w = 0; w < nWalk; w++) {
      var a = makePerson(); a.dir = Math.random() < 0.5 ? 1 : -1; a.lane = rnd(1.85, 2.45);
      a.g.position.set(rnd(-L, L), 0, a.lane); a.g.rotation.y = a.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      walkers.push(a);
    }

    // customers: arrive → queue → walk in → (inside) → walk out with a bag → leave
    var DOOR_X = 1.5, LANE_Z = 1.65;
    function slot(k) { return k === 0 ? { x: DOOR_X, z: 1.0 } : { x: DOOR_X + 0.72 * k, z: 1.2 }; }
    var queue = [], customers = [], doorFreeAt = 0, now = 0;
    var nCust = mobile ? 4 : 6;
    function spawnArrival(a, delay) {
      a.state = 'offstage'; a.wait = delay; a.g.visible = false; a.bag.visible = false;
    }
    for (var c = 0; c < nCust; c++) {
      var cu = makePerson(); customers.push(cu);
      if (c < 3) { // start already queued so the scene is alive immediately
        queue.push(cu); cu.state = 'queue'; var p = slot(c); cu.g.position.set(p.x, 0, p.z); cu.g.rotation.y = c === 0 ? Math.PI : -Math.PI / 2; cu.waited = c === 0 ? 0.8 : 0;
      } else if (c === 3) { cu.state = 'inside'; cu.wait = 2.5; cu.g.visible = false; }
      else spawnArrival(cu, rnd(1, 6));
    }

    function updateCustomer(a, dt) {
      a.moving = false;
      switch (a.state) {
        case 'offstage':
          a.wait -= dt;
          if (a.wait <= 0 && queue.length < 4) {
            a.from = Math.random() < 0.5 ? -1 : 1;
            a.g.position.set(a.from * (L + rnd(0, 2)), 0, LANE_Z); a.g.visible = true; a.speed = rnd(1.0, 1.35);
            queue.push(a); a.state = 'queue'; a.waited = 0;
          }
          break;
        case 'queue': {
          var k = queue.indexOf(a), s = slot(k), p = a.g.position;
          var arrived;
          if (Math.abs(p.x - s.x) > 0.06 && p.z > LANE_Z - 0.1) arrived = walkTo(a, s.x, LANE_Z, dt) && false;
          else arrived = walkTo(a, s.x, s.z, dt);
          if (arrived) { turnTo(a, k === 0 ? Math.PI : -Math.PI / 2, dt); a.waited += dt; } else a.waited = 0;
          var someoneLeaving = customers.some(function (o) { return o.state === 'inside' && o.wait <= 0; });
          if (k === 0 && arrived && a.waited > 1.4 && now > doorFreeAt && !someoneLeaving) {
            queue.shift(); a.state = 'enter'; doorFreeAt = now + 3;
          }
          break;
        }
        case 'enter':
          if (walkTo(a, DOOR_X, -2.0, dt)) { a.state = 'inside'; a.wait = rnd(3.5, 7); a.g.visible = false; }
          break;
        case 'inside':
          a.wait -= dt;
          if (a.wait <= 0 && now > doorFreeAt) {
            doorFreeAt = now + 3; a.state = 'exit'; a.path = [[DOOR_X, 0.35], [DOOR_X - 0.75, 0.75], [DOOR_X - 1.1, 2.2]];
            a.g.position.set(DOOR_X, 0, -2.0); a.g.rotation.y = 0; a.g.visible = true; a.bag.visible = true;
          }
          break;
        case 'exit':
          if (walkTo(a, a.path[0][0], a.path[0][1], dt)) {
            a.path.shift();
            if (!a.path.length) { a.state = 'leave'; a.to = Math.random() < 0.6 ? -1 : 1; }
          }
          break;
        case 'leave':
          if (walkTo(a, a.to * (L + 2), 2.2, dt)) spawnArrival(a, rnd(2, 7));
          break;
      }
    }

    /* ---------- camera / resize ---------- */
    var pointer = 0, pointerTarget = 0;
    host.addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect(); pointerTarget = ((e.clientX - r.left) / r.width - 0.5) * 2;
    });
    host.addEventListener('pointerleave', function () { pointerTarget = 0; });
    function resize() {
      var w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var halfWidth = w < 768 ? 4.8 : 8.5, dist = 13;
      var vfov = 2 * Math.atan(halfWidth / dist / camera.aspect) * 180 / Math.PI;
      camera.fov = Math.max(20, Math.min(62, vfov));
      camera.updateProjectionMatrix();
      if (reduce) render(0, 0);
    }
    new ResizeObserver(resize).observe(host);

    /* ---------- loop ---------- */
    var clock = new T.Clock(), running = true, t = 0;
    function render(dt, time) {
      pointer += (pointerTarget - pointer) * Math.min(1, dt * 3);
      var orbit = (mobile ? 0.32 : 0.42) + Math.sin(time * 0.1) * 0.06 + pointer * 0.12;
      camera.position.set(lookAt.x + Math.sin(orbit) * 13, 4.6 + Math.sin(time * 0.08) * 0.15, Math.cos(orbit) * 13);
      camera.lookAt(lookAt);
      renderer.render(scene, camera);
    }
    function tick() {
      if (!running) return;
      requestAnimationFrame(tick);
      var dt = Math.min(clock.getDelta(), 0.05); t += dt; now = t;

      walkers.forEach(function (a) {
        a.g.position.x += a.dir * a.speed * dt; a.moving = true;
        if (a.g.position.x > L + 1) a.g.position.x = -L - 1; else if (a.g.position.x < -L - 1) a.g.position.x = L + 1;
        animateLimbs(a, dt, t);
      });
      customers.forEach(function (a) { updateCustomer(a, dt); if (a.g.visible) animateLimbs(a, dt, t); });
      if ((t % 1) < dt) host.dataset.flow = customers.map(function (a) { return a.state + (a.bag.visible ? '+bag' : ''); }).join(',');

      noren.forEach(function (m, i) { m.rotation.x = Math.sin(t * 1.6 + i * 1.1) * 0.08 - 0.03; });
      lanterns.forEach(function (g, i) { g.rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.07; });
      steam.forEach(function (sp) {
        var u = (sp.userData.t += dt * 0.28) % 1;
        sp.position.set(-1.5 + sp.userData.x + Math.sin(u * 6 + sp.userData.x * 9) * 0.08, 1.75 + u * 1.3, 0.25);
        var sc = 0.25 + u * 0.55; sp.scale.set(sc, sc, sc);
        sp.material.opacity = Math.sin(u * Math.PI) * 0.35;
      });
      render(dt, t);
    }

    if (reduce) {
      steam.forEach(function (sp, i) { sp.position.set(-1.5 + sp.userData.x, 1.8 + i * 0.12, 0.25); sp.scale.set(0.5, 0.5, 0.5); sp.material.opacity = 0.18; });
      walkers.forEach(function (a) { a.moving = true; a.phase = 1; animateLimbs(a, 1, 0); });
      var frames = 0; (function settle() { resize(); render(0, 0); if (++frames < 60) requestAnimationFrame(settle); })();
      return;
    }

    new IntersectionObserver(function (es) {
      var vis = es[0].isIntersecting && !document.hidden;
      if (vis && !running) { running = true; clock.getDelta(); tick(); }
      else if (!vis) running = false;
    }, { rootMargin: '80px' }).observe(host);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) running = false;
      else if (!running) { var r = host.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { running = true; clock.getDelta(); tick(); } }
    });
    resize(); tick();
  }
})();
