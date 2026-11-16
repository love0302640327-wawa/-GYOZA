/* 餃作 GYOZA — floating 3D gyoza in the hero (procedural geometry, no model files). */
(function () {
  'use strict';
  var hero = document.getElementById('top');
  if (!hero) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { var c = document.createElement('canvas'); if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) return; } catch (e) { return; }

  window.__loadThree = window.__loadThree || new Promise(function (resolve, reject) {
    if (window.THREE) return resolve();
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  window.__loadThree.then(init).catch(function () {});

  /* A gyoza: a squashed sphere bent into a crescent, flat crispy bottom, pleated pinched ridge. */
  function gyozaGeometry(T) {
    var g = new T.SphereGeometry(1, 64, 32), pos = g.attributes.position, colors = [];
    var crust = new T.Color(0x8a3f12).convertSRGBToLinear(), crust2 = new T.Color(0xd08a38).convertSRGBToLinear(), dough = new T.Color(0xe9d6b4).convertSRGBToLinear(), dough2 = new T.Color(0xd9bf96).convertSRGBToLinear(), tmp = new T.Color();
    function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var X = x * 1.55, Y = y * 0.66, Z = z * 0.62;
      var ridge = smooth(0.2, 0.62, Y);                          // 0 at belly, 1 at the top seam
      Z *= 1 - ridge * 0.78;                                     // pinch the seam thin
      Y += Math.sin(X * 8.5) * 0.045 * ridge;                    // pleats
      Z += Math.sin(X * 8.5 + 1.2) * 0.05 * ridge;
      if (Y < -0.2) Y = -0.2 + (Y + 0.2) * 0.12;                 // pan-fried flat bottom
      Z += X * X * 0.17;                                         // crescent bend
      Y -= X * X * 0.05;
      pos.setXYZ(i, X, Y, Z);
      // colour: golden crust on the bottom, pale dough above, a few toasty specks
      var b = 1 - smooth(-0.19, 0.04, Y), speck = (Math.sin(X * 37) * Math.sin(Z * 41) > 0.82) ? 0.25 : 0;
      tmp.copy(dough).lerp(dough2, ridge * 0.6 + Math.random() * 0.08);
      var cr = crust.clone().lerp(crust2, 0.55 + Math.sin(X * 6 + Z * 9) * 0.25 - speck);
      tmp.lerp(cr, b);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }

  function init() {
    var T = window.THREE;
    var renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    var canvas = renderer.domElement;
    canvas.className = 'hero3d';
    canvas.setAttribute('aria-hidden', 'true');
    hero.insertBefore(canvas, hero.firstChild);
    hero.classList.add('has-hero3d');

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 14);
    scene.add(new T.HemisphereLight(0xffe2c0, 0x2a160c, 0.45));
    var key = new T.DirectionalLight(0xffd2a0, 0.95); key.position.set(-4, 6, 8); scene.add(key);
    var rim = new T.DirectionalLight(0xff8a3a, 1.6); rim.position.set(6, -2, -6); scene.add(rim);
    var fill = new T.PointLight(0xffa860, 0.8, 30); fill.position.set(2, -3, 6); scene.add(fill);

    var geo = gyozaGeometry(T);
    var mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
    var glowTex = (function () {
      var cv = document.createElement('canvas'); cv.width = cv.height = 128; var g = cv.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,170,90,.9)'); gr.addColorStop(0.4, 'rgba(255,120,40,.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; return t;
    })();

    // placements in screen fractions (fx: -1 left … 1 right, fy: -1 bottom … 1 top), depth (+ is closer), size
    var desktop = [
      [0.07, 0.62, 0.5, 1.0], [0.18, -0.4, 1.8, 0.75], [-0.12, -0.93, -1.2, 0.8], [0.97, 0.82, -2.5, 1.25],
      [0.8, -0.9, 2.4, 0.8], [-0.3, 0.92, -3.5, 0.65], [-1.0, -0.62, -2, 0.9]
    ];
    var phone = [[-0.55, 0.86, 0, 0.95], [0.62, 0.76, 1, 0.85], [0.08, 0.97, -2.5, 0.7]];
    var items = [];
    function build() {
      items.forEach(function (it) { scene.remove(it.g); });
      items = [];
      var list = hero.clientWidth < 768 ? phone : desktop;
      list.forEach(function (p, i) {
        var g = new T.Group();
        var mesh = new T.Mesh(geo, mat); g.add(mesh);
        var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.55, blending: T.AdditiveBlending }));
        glow.scale.set(5, 3.6, 1); glow.position.z = -0.8; g.add(glow);
        g.scale.setScalar(p[3]);
        mesh.rotation.set(-0.55 + Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.6 - 0.3);
        scene.add(g);
        items.push({ g: g, mesh: mesh, size: p[3], fx: p[0], fy: p[1], z: p[2], seed: i * 1.7 + Math.random(), spin: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.15) });
      });
      place(0);
    }
    function place(scroll) {
      var vh = Math.tan(camera.fov * Math.PI / 360);
      var fit = Math.min(1, Math.max(0.3, vh * camera.position.z * camera.aspect / 7.7));
      items.forEach(function (it) {
        it.g.scale.setScalar(it.size * fit);
        var dist = camera.position.z - it.z;
        it.baseX = it.fx * vh * dist * camera.aspect * 0.92;
        it.baseY = it.fy * vh * dist * 0.88;
      });
    }

    var w = 0, h = 0;
    function resize() {
      var nw = hero.clientWidth, nh = hero.clientHeight; if (!nw || !nh) return;
      var rebuild = (nw < 768) !== (w < 768) || !items.length;
      w = nw; h = nh;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (rebuild) build(); else place();
      if (reduce) frame(0, 0);
    }
    new ResizeObserver(resize).observe(hero);

    var px = 0, py = 0, tx = 0, ty = 0;
    addEventListener('pointermove', function (e) { tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

    function frame(t, dt) {
      px += (tx - px) * Math.min(1, dt * 2.5); py += (ty - py) * Math.min(1, dt * 2.5);
      var r = hero.getBoundingClientRect(), scroll = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      items.forEach(function (it) {
        var depth = (it.z + 4) / 6; // 0 far … 1 near
        var k = it.g.scale.x;
        it.g.position.set(
          it.baseX + (px * (0.25 + depth * 0.7) + Math.sin(t * 0.4 + it.seed) * 0.15) * k,
          it.baseY + (-py * (0.15 + depth * 0.5) + Math.sin(t * 0.8 + it.seed) * 0.22) * k + scroll * (2 + depth * 7) * k,
          it.z
        );
        it.mesh.rotation.y += it.spin * dt;
        it.mesh.rotation.x = -0.5 + Math.sin(t * 0.5 + it.seed) * 0.3 + scroll * 1.2;
        it.mesh.rotation.z = Math.sin(t * 0.35 + it.seed * 2) * 0.25;
      });
      renderer.render(scene, camera);
    }

    if (reduce) { resize(); var n = 0; (function settle() { resize(); frame(0, 0); if (++n < 60) requestAnimationFrame(settle); })(); return; }

    var running = true, last = performance.now(), t = 0;
    function loop(now) {
      if (!running) return;
      requestAnimationFrame(loop);
      var dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
      frame(t, dt);
    }
    function setRunning(v) { if (v && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); } else if (!v) running = false; }
    new IntersectionObserver(function (es) { setRunning(es[0].isIntersecting && !document.hidden); }).observe(hero);
    document.addEventListener('visibilitychange', function () { var r = hero.getBoundingClientRect(); setRunning(!document.hidden && r.bottom > 0); });
    resize(); requestAnimationFrame(loop);
  }
})();
