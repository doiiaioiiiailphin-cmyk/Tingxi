/* =========================================================
   听隙 Tingxi · atmosphere.js
   缓慢流动的雾气、星点与月光 —— 全程 canvas，极轻量
   ========================================================= */
(function () {
  "use strict";

  const canvas = document.getElementById("atmosphere");
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, DPR = 1;
  let stars = [];
  let mists = [];
  let moon = null;
  let raf = null;
  let running = true;
  let t = 0;

  // 当前主题色（默认月光青），可由外部 setTheme 覆盖
  let theme = { r: 110, g: 168, b: 199 };

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth = window.innerWidth;
    H = canvas.clientHeight = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
  }

  function seed() {
    // 星点：稀疏，带轻微闪烁
    const count = Math.round((W * H) / 16000);
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.85,
      r: rand(0.4, 1.5),
      base: rand(0.15, 0.7),
      tw: rand(0.4, 1.6),     // 闪烁速度
      ph: Math.random() * Math.PI * 2,
    }));

    // 雾气：大团缓慢漂浮的柔光
    const mistCount = W < 640 ? 4 : 6;
    mists = new Array(mistCount).fill(0).map((_, i) => ({
      x: rand(0, W),
      y: rand(H * 0.2, H * 0.95),
      r: rand(W * 0.22, W * 0.42),
      vx: rand(-0.12, 0.12),
      vy: rand(-0.04, 0.04),
      a: rand(0.04, 0.1),
      warm: i % 2 === 0,
    }));

    // 月亮：右上偏中，柔光晕
    moon = {
      x: W * 0.74,
      y: H * 0.26,
      r: Math.max(50, Math.min(W, H) * 0.075),
    };
  }

  function rgba(r, g, b, a) { return `rgba(${r|0},${g|0},${b|0},${a})`; }

  function draw() {
    t += reduced ? 0.04 : 1;
    ctx.clearRect(0, 0, W, H);

    // —— 月光晕 ——
    const mg = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r * 7);
    mg.addColorStop(0, rgba(theme.r, theme.g, theme.b, 0.16));
    mg.addColorStop(0.4, rgba(theme.r, theme.g, theme.b, 0.05));
    mg.addColorStop(1, rgba(theme.r, theme.g, theme.b, 0));
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);

    // 月轮
    const mb = ctx.createRadialGradient(
      moon.x - moon.r * 0.3, moon.y - moon.r * 0.3, moon.r * 0.1,
      moon.x, moon.y, moon.r
    );
    mb.addColorStop(0, "rgba(248,250,255,0.95)");
    mb.addColorStop(0.7, "rgba(225,232,245,0.7)");
    mb.addColorStop(1, "rgba(200,212,232,0.0)");
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
    ctx.fillStyle = mb;
    ctx.fill();

    // —— 雾气 ——
    ctx.globalCompositeOperation = "lighter";
    for (const m of mists) {
      m.x += m.vx; m.y += m.vy;
      // 环绕
      if (m.x < -m.r) m.x = W + m.r;
      if (m.x > W + m.r) m.x = -m.r;
      if (m.y < -m.r) m.y = H + m.r;
      if (m.y > H + m.r) m.y = -m.r;

      const breath = 0.85 + 0.15 * Math.sin(t * 0.004 + m.x);
      const c = m.warm ? theme : { r: 70, g: 90, b: 140 };
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, rgba(c.r, c.g, c.b, m.a * breath));
      g.addColorStop(1, rgba(c.r, c.g, c.b, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // —— 星点 ——
    for (const s of stars) {
      const a = s.base * (0.55 + 0.45 * Math.sin(t * 0.02 * s.tw + s.ph));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(235,240,250,${a})`;
      ctx.fill();
    }

    if (running) raf = requestAnimationFrame(draw);
  }

  function start() {
    if (raf) return;
    running = true;
    raf = requestAnimationFrame(draw);
  }
  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // 外部接口：更新主题色
  window.TingxiAtmosphere = {
    setTheme(rgb) {
      if (rgb) theme = { r: rgb[0], g: rgb[1], b: rgb[2] };
    },
  };

  // 可见性优化：切到后台暂停
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  window.addEventListener("resize", resize, { passive: true });
  resize();
  start();
})();
