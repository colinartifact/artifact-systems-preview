/* ============================================================
   ASCII hero field.
   Live Ethereum mainnet data (blocks, hashes, transactions,
   fetched from public JSON-RPC endpoints) drifts left to right
   in per-row lanes. Traveling brightness packets ride the same
   motion, so the text reads as data in transit. The company
   mark holds a constant quiet presence and is revealed strongly
   wherever the stream collides with it, to a degree that rises
   and falls with a slow traveling envelope. Grayscale only.
   The cursor lifts local luminance by a small, eased amount;
   it never distorts or displaces the field.
   ============================================================ */

(function () {
  "use strict";

  var canvas = document.getElementById("hero-ascii");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var HEX = "0123456789abcdef";

  var CELL_W = 6;
  var CELL_H = 10;
  var FONT_SIZE = 7.5;

  var cols = 0, rows = 0, dpr = 1;
  var cssW = 0, cssH = 0;

  // Per-row lane parameters. Each active lane carries ONE streak: a
  // bright head with a fading tail, sweeping left to right, then dead
  // time before it wraps around again. Inactive lanes stay dark except
  // where the mark sits.
  var rowSpeed = [];
  var rowPhase = [];
  var rowPeriod = [];   // px of travel per streak cycle (>> viewport)
  var rowTail = [];     // streak tail length in px
  var rowActive = [];   // whether this lane carries a streak at all
  var rowPhasePx = [];  // where in the cycle this lane starts
  var rowHasLogo = [];  // whether the mark occupies any cell of the row

  // Cursor state. Target follows the pointer, the drawn position
  // eases toward it so the brightening feels weighted, not twitchy.
  var mx = -1e4, my = -1e4;      // eased
  var tx = -1e4, ty = -1e4;      // target
  var CURSOR_RADIUS = 170;       // px
  var CURSOR_LIFT = 0.16;        // max luminance lift, deliberately small

  var running = false;
  var inView = true;
  var lastFrame = 0;
  var FRAME_MS = 15; // ~60fps; sub-pixel scrolling needs the full rate
  var t = 0;

  // Theme: 0 = dark, 1 = light. Tweened on a clock with the same
  // duration and ease-in-out shape as the page's CSS transition,
  // so the canvas drifts between palettes in step with everything else.
  var THEME_DUR = 1200;
  var themeTarget = document.documentElement.getAttribute("data-theme") === "light" ? 1 : 0;
  var themeMix = themeTarget;
  var themeFrom = themeMix;
  var themeStart = -1;

  function easeTheme() {
    if (themeMix === themeTarget) return;
    if (themeStart < 0) { themeMix = themeTarget; return; }
    var p = Math.min(1, (performance.now() - themeStart) / THEME_DUR);
    var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    themeMix = themeFrom + (themeTarget - themeFrom) * e;
    if (p >= 1) themeMix = themeTarget;
  }

  // Company mark, sampled to per-cell alpha. The ripple field flows
  // through it; the mark reads as a quiet lift in luminance.
  var logoImg = null;
  var logoAlpha = null;
  var LOGO_SRC_SIZE = 80.32; // the mark occupies the left square of the lockup

  // Mark placement. Set in sampleLogo() as soon as the grid exists.
  var logoCx = 0;
  var logoCy = 0;
  var logoR = 1;

  /* ---------- Live Ethereum data ----------
     The lane text is harvested from the latest mainnet block over
     JSON-RPC. WHERE the data comes from is decided entirely by
     js/rpc-config.js (window.ARTIFACT_RPC): a primary Artifact
     Systems endpoint when configured, public fallbacks otherwise,
     rotating on failure. Until the first response lands, or if every
     endpoint is unreachable, lanes carry deterministic hex filler so
     the field is never empty. */

  var rpcConfig = window.ARTIFACT_RPC || {};
  var RPC_ENDPOINTS = (rpcConfig.primary ? [rpcConfig.primary] : [])
    .concat(rpcConfig.fallbacks || []);
  if (!RPC_ENDPOINTS.length) {
    RPC_ENDPOINTS = ["https://ethereum-rpc.publicnode.com"];
  }
  var RPC_HEADERS = rpcConfig.headers || {};
  var rpcIndex = 0;
  var POLL_MS = rpcConfig.pollMs || 12000; // mainnet block time
  var dataPool = [];
  var poolGeneration = 0;
  var lanes = [];

  function fallbackPool() {
    var pool = [];
    for (var i = 0; i < 48; i++) {
      var s = "0x";
      for (var j = 0; j < 64; j++) {
        s += HEX[Math.floor(hash(i * 977 + j * 131 + 7) * 16) & 15];
      }
      pool.push(i % 3 === 0 ? "TX " + s : s);
    }
    return pool;
  }

  function hexDec(h) {
    var n = parseInt(h, 16);
    return isFinite(n) ? String(n) : "";
  }

  function buildPool(block) {
    var p = [];
    p.push("ETH MAINNET  BLOCK " + hexDec(block.number) + "  TS " + hexDec(block.timestamp));
    p.push("HASH " + block.hash);
    p.push("PARENT " + block.parentHash);
    if (block.stateRoot) p.push("STATEROOT " + block.stateRoot);
    if (block.miner) p.push("PROPOSER " + block.miner);
    p.push("GASUSED " + hexDec(block.gasUsed) + "  GASLIMIT " + hexDec(block.gasLimit));
    if (block.baseFeePerGas) {
      p.push("BASEFEE " + (parseInt(block.baseFeePerGas, 16) / 1e9).toFixed(2) + " GWEI");
    }
    var txs = block.transactions || [];
    for (var i = 0; i < txs.length && i < 80; i++) {
      var tx = txs[i];
      if (typeof tx === "string") { p.push("TX " + tx); continue; }
      if (tx.hash) p.push("TX " + tx.hash);
      if (tx.from) p.push("FROM " + tx.from + (tx.to ? "  TO " + tx.to : "  CONTRACT CREATION"));
      if (tx.value && tx.value !== "0x0") {
        var eth = parseInt(tx.value, 16) / 1e18;
        if (isFinite(eth) && eth > 0) p.push("VALUE " + eth.toFixed(4) + " ETH");
      }
    }
    return p;
  }

  // Each row stitches together entries from the pool, long enough to
  // wrap seamlessly.
  var laneGen = [];
  var nextRefreshRow = 0;
  var lastLaneRefresh = 0;

  function buildLane(r) {
    var n = dataPool.length;
    var s = "";
    var idx = Math.floor(hash(r * 7919 + poolGeneration * 104729) * n);
    var minLen = cols + 120;
    while (s.length < minLen) {
      s += dataPool[idx % n] + "   ";
      idx += 1 + (r % 3);
    }
    return s;
  }

  function assignLanes() {
    if (!rows || !dataPool.length) return;
    lanes = new Array(rows);
    laneGen = new Array(rows);
    for (var r = 0; r < rows; r++) {
      lanes[r] = buildLane(r);
      laneGen[r] = poolGeneration;
    }
  }

  // When a new block arrives, swap ONE lane at a time on a slow
  // round-robin, and only while that lane's lit region is fully
  // offscreen. Swapping a lane whose streak (or logo collision) is
  // visible replaces glyphs mid-glow and reads as flicker.
  function refreshOneLane() {
    if (!rows || !dataPool.length || !lanes.length) return;
    for (var tries = 0; tries < rows; tries++) {
      var r = nextRefreshRow;
      nextRefreshRow = (nextRefreshRow + 1) % rows;
      if (laneGen[r] === poolGeneration) continue;
      if (rowActive[r]) {
        var head = (t * rowSpeed[r] + rowPhasePx[r]) % rowPeriod[r];
        // Lit while head < viewport + reveal tail; add margin.
        if (head < cssW + rowTail[r] * 2 + 60) continue;
      }
      lanes[r] = buildLane(r);
      laneGen[r] = poolGeneration;
      return;
    }
  }

  var pollTimer = null;
  function fetchBlock() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(fetchBlock, POLL_MS);
    if (document.hidden) return;
    var url = RPC_ENDPOINTS[rpcIndex % RPC_ENDPOINTS.length];
    var headers = { "Content-Type": "application/json" };
    for (var hk in RPC_HEADERS) {
      if (Object.prototype.hasOwnProperty.call(RPC_HEADERS, hk)) {
        headers[hk] = RPC_HEADERS[hk];
      }
    }
    fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getBlockByNumber", params: ["latest", true]
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.result) throw new Error("empty result");
        dataPool = buildPool(json.result);
        poolGeneration++;
        if (!running) {
          // No frame loop to stagger through; swap everything at once.
          assignLanes();
          draw(t);
        }
      })
      .catch(function () {
        rpcIndex++; // rotate to the next public endpoint
      });
  }

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return (n >>> 0) / 4294967295;
  }

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    cssW = Math.max(rect.width, 1);
    cssH = Math.max(rect.height, 1);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT_SIZE + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    cols = Math.ceil(cssW / CELL_W) + 1;
    rows = Math.ceil(cssH / CELL_H) + 1;

    rowSpeed = new Array(rows);
    rowPhase = new Array(rows);
    rowPeriod = new Array(rows);
    rowTail = new Array(rows);
    rowActive = new Array(rows);
    rowPhasePx = new Array(rows);
    for (var r = 0; r < rows; r++) {
      var h1 = hash(r * 92821 + 13);
      var h2 = hash(r * 68917 + 47);
      var h3 = hash(r * 41381 + 89);
      var h4 = hash(r * 53077 + 17);
      var h5 = hash(r * 911 + 3);
      rowSpeed[r] = 34 + h1 * 72;                 // px/s, always left to right
      rowPhase[r] = h3 * Math.PI * 2;
      rowPeriod[r] = cssW * (1.8 + h2 * 2.8);     // long dead time between passes
      rowTail[r] = 70 + h3 * 160;                 // comet tail length
      rowActive[r] = h4 < 0.6;                    // only some lanes carry streaks
      rowPhasePx[r] = h5 * rowPeriod[r];
    }

    assignLanes();
    sampleLogo();
  }

  // Rasterize the mark at grid resolution and keep one alpha value
  // per cell. Placement: center-right on desktop, upper-center on
  // small screens where the copy spans the full width.
  function sampleLogo() {
    logoAlpha = null;
    if (!cols || !rows) return;

    var size, cx, cy;
    if (cssW < 768) {
      size = Math.min(cssW, cssH) * 0.68;
      cx = cssW * 0.5;
      cy = cssH * 0.38;
    } else {
      size = Math.min(cssH * 0.76, cssW * 0.55);
      cx = cssW * 0.67;
      cy = cssH * 0.52;
    }
    // Keep the mark's top edge clear of the fixed nav bar.
    cy = Math.max(cy, 84 + size / 2);

    // The ripple emitters live here even before the image loads.
    logoCx = cx;
    logoCy = cy;
    logoR = size / 2;

    if (!logoImg) return;

    var off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    var octx = off.getContext("2d");
    // The mark is a fine-lined sketch; at cell resolution its strokes
    // average to faint alpha. Draw it several times with sub-cell
    // offsets to fatten the strokes into readable glyph mass.
    var offsets = [
      [0, 0],
      [0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55],
      [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]
    ];
    for (var o = 0; o < offsets.length; o++) {
      octx.drawImage(
        logoImg,
        0, 0, LOGO_SRC_SIZE, LOGO_SRC_SIZE,
        (cx - size / 2) / CELL_W + offsets[o][0],
        (cy - size / 2) / CELL_H + offsets[o][1],
        size / CELL_W, size / CELL_H
      );
    }
    var data = octx.getImageData(0, 0, cols, rows).data;
    logoAlpha = new Float32Array(cols * rows);
    for (var i = 0; i < cols * rows; i++) {
      // Sub-linear curve lifts thin-stroke cells toward full presence.
      logoAlpha[i] = Math.pow(data[i * 4 + 3] / 255, 0.55);
    }

    // Rows the mark never touches can be skipped entirely when their
    // lane carries no streak.
    rowHasLogo = new Array(rows);
    for (var rr = 0; rr < rows; rr++) {
      var hit = false;
      for (var cc = 0; cc < cols; cc++) {
        if (logoAlpha[rr * cols + cc] > 0) { hit = true; break; }
      }
      rowHasLogo[rr] = hit;
    }
  }

  function rasterizeLogo(text) {
    // The file ships with only a viewBox; drawImage needs explicit
    // dimensions to rasterize reliably.
    var svg = text.indexOf('width="') === -1
      ? text.replace("<svg ", '<svg width="528" height="80.32" ')
      : text;
    var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    var img = new Image();
    img.onload = function () {
      logoImg = img;
      URL.revokeObjectURL(url);
      sampleLogo();
      if (!running) draw(t);
    };
    img.src = url;
  }

  function loadLogo() {
    // Self-contained bundles (e.g. the shareable preview) embed the
    // SVG text directly instead of fetching it.
    if (window.ARTIFACT_LOGO_SVG) {
      rasterizeLogo(window.ARTIFACT_LOGO_SVG);
      return;
    }
    fetch("assets/ArtifactSystems_White_Logo.svg")
      .then(function (res) { return res.text(); })
      .then(rasterizeLogo)
      .catch(function () { /* field simply renders without the mark */ });
  }

  // (Stream math lives inline in draw(): each row is a lane of packets
  // drifting left to right, with a slow traveling envelope that makes
  // the flow, and the reveal it causes, rise and fall.)

  function draw(time) {
    ctx.clearRect(0, 0, cssW, cssH);

    // Ease cursor toward target.
    mx += (tx - mx) * 0.08;
    my += (ty - my) * 0.08;

    easeTheme();

    var invRad2 = 1 / (2 * CURSOR_RADIUS * CURSOR_RADIUS);

    for (var r = 0; r < rows; r++) {
      var lane = lanes[r];
      if (!lane) continue;
      var active = rowActive[r];
      var hasLogo = rowHasLogo[r];
      if (!active && !hasLogo) continue; // dark lane, nothing to draw

      var llen = lane.length;
      var y = r * CELL_H + CELL_H / 2;
      var spd = rowSpeed[r], ph = rowPhase[r];
      var tail = rowTail[r];

      // One streak per lane: its head position cycles over a period
      // much longer than the viewport, so most of the time the lane
      // rests dark. Pass strength varies slowly, pass to pass.
      var head = (time * spd + rowPhasePx[r]) % rowPeriod[r];
      var strength = 0.72 + 0.28 * Math.sin(time * 0.31 + ph * 1.7);

      // Continuous scroll: glyphs glide with sub-cell precision at the
      // streak velocity, so the motion never steps or stutters.
      var px = time * spd;
      var shift = Math.floor(px / CELL_W);
      // Snap the sub-cell offset to whole pixels. A glyph at a
      // fractional x re-rasterizes its anti-aliased edges every frame
      // (crisp at integer x, blurred at half x) — that twinkle is the
      // flicker. Whole-pixel positions rasterize identically frame to
      // frame; motion steps 1px at a time, still smooth at these speeds.
      var frac = Math.round(px - shift * CELL_W);

      for (var c = -1; c < cols; c++) {
        var ci = (c - shift) % llen;
        if (ci < 0) ci += llen;
        var ch = lane.charAt(ci);
        if (ch === " ") continue; // gaps between records draw nothing

        var x = c * CELL_W + CELL_W / 2 + frac;
        var la = logoAlpha ? logoAlpha[r * cols + Math.max(0, c)] : 0;

        // Streak intensity: bright head, exponential comet tail. The
        // reveal wave uses a longer, softer tail so a passing streak
        // lights a broad swath of the mark.
        var st = 0, rev = 0;
        if (active) {
          var d = head - x;
          if (d >= 0) {
            if (d < tail) {
              // Steep falloff from head to tail, plus a hot spot on the
              // leading tip. The tip boost is mostly independent of the
              // pass strength, so every streak leads with a bright head
              // even on its weaker passes.
              st = Math.exp(-d / (tail * 0.22)) * strength;
              if (d < 24) st += (1 - d / 24) * (0.75 + 0.25 * strength);
            }
            if (la > 0 && d < tail * 2) rev = Math.exp(-d / (tail * 0.7)) * strength;
          }
        }

        // The mark holds a firm constant silhouette; streaks passing
        // through it flare it to full strength.
        var lum;
        if (la > 0) {
          lum = Math.min(1, la * (0.4 + rev * 1.05) + st * 0.15);
        } else if (st > 0.02) {
          lum = Math.min(1, st * 0.78);
        } else {
          continue;
        }

        // Cursor: gaussian falloff, luminance lift only.
        var dx = x - mx, dy = y - my;
        var g = Math.exp(-(dx * dx + dy * dy) * invRad2);
        var lift = g * CURSOR_LIFT;

        var total = lum + lift;
        if (total < 0.02) continue; // below the visible floor

        var v = Math.min(1, total);
        // Gray endpoints resolve to the page background (black in dark,
        // white in light) as v -> 0, and a soft alpha ramp fades the
        // faintest glyphs instead of switching them on and off frame to
        // frame. Together these remove the shimmer at streak edges.
        var alpha = total < 0.12 ? (total - 0.02) / 0.1 : 1;
        var gDark = v * 180;               // 0 (bg) -> 180 on black
        var gLight = 255 - v * 225;        // 255 (bg) -> 30 on white; darker = more visible
        var gray = Math.round(gDark + (gLight - gDark) * themeMix);
        ctx.fillStyle = "rgba(" + gray + "," + gray + "," + gray + "," + alpha.toFixed(3) + ")";
        ctx.fillText(ch, x, y);
      }
    }
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS) return;
    var dt = Math.min(now - lastFrame, 100);
    lastFrame = now;
    t += dt * 0.001;
    // Fold fresh block data in one lane at a time, never all at once.
    if (now - lastLaneRefresh > 280) {
      lastLaneRefresh = now;
      refreshOneLane();
    }
    draw(t);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function stop() { running = false; }

  // Static single frame + cursor-only redraws under reduced motion.
  var staticRedrawQueued = false;
  function staticRedraw() {
    if (staticRedrawQueued) return;
    staticRedrawQueued = true;
    requestAnimationFrame(function () {
      staticRedrawQueued = false;
      mx = tx; my = ty;
      draw(4.2);
    });
  }

  canvas.parentElement.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    tx = e.clientX - rect.left;
    ty = e.clientY - rect.top;
    if (reduceMotion) staticRedraw();
  });
  canvas.parentElement.addEventListener("pointerleave", function () {
    tx = -1e4; ty = -1e4;
    if (reduceMotion) staticRedraw();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (reduceMotion) return;
      if (inView && !document.hidden) start(); else stop();
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener("visibilitychange", function () {
    if (reduceMotion) return;
    if (document.hidden) stop(); else if (inView) start();
  });

  // While the theme pulse sweeps, drop to half rate so the pulse
  // overlay and mask reveal get the frame budget.
  document.addEventListener("themepulse", function (e) {
    FRAME_MS = e.detail && e.detail.active ? 33 : 15;
  });

  document.addEventListener("themechange", function (e) {
    var d = e.detail || {};
    var next = typeof d === "string" ? d : d.theme;
    var instant = typeof d === "object" && d.instant;
    themeFrom = themeMix;
    themeStart = performance.now();
    themeTarget = next === "light" ? 1 : 0;
    if (instant || !running) {
      // Under the circular wipe the reveal itself is the animation,
      // so the canvas swaps palette at once; same when no loop runs.
      themeMix = themeTarget;
      if (!running) draw(t);
    }
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      draw(t); // repaint immediately; the loop may be paused or throttled
    }, 120);
  });

  // Instant filler until real chain data lands. Self-contained bundles
  // ship a baked snapshot of a real block instead.
  dataPool = (window.ARTIFACT_SNAPSHOT_POOL && window.ARTIFACT_SNAPSHOT_POOL.length)
    ? window.ARTIFACT_SNAPSHOT_POOL
    : fallbackPool();
  resize();
  loadLogo();
  fetchBlock(); // begin polling the public RPC endpoints
  // Paint one frame immediately so the field is present even before
  // the first animation frame fires (throttled or hidden tabs).
  t = 4.2;
  draw(t);
  if (!reduceMotion) start();

  // QA hook, active only when the page is loaded with #debug.
  if (window.location.hash === "#debug") {
    window.__asciiDraw = function (time, cursorX, cursorY) {
      if (typeof cursorX === "number") { tx = mx = cursorX; ty = my = cursorY; }
      draw(time);
    };
  }
})();
