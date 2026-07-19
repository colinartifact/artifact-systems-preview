/* ============================================================
   Scroll reveals + infrastructure node lattice.
   ============================================================ */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Theme toggle ---------- */

  var toggleBtn = document.getElementById("theme-toggle");
  var animTimer = null;
  var WIPE_MS = 1800;

  // Shared easing for the theme boundary and the pulse ring, so both
  // travel as one wave.
  function wipeEase(p) {
    return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  }

  // An ASCII signal pulse: concentric rings of hex glyphs riding just
  // behind the theme boundary as it expands from the button.
  function playPulse(x, y, next) {
    if (reduceMotion) return;
    var cvs = document.createElement("canvas");
    cvs.className = "theme-pulse";
    document.body.appendChild(cvs);
    // Let the hero engine drop to half rate while the pulse sweeps.
    document.dispatchEvent(new CustomEvent("themepulse", { detail: { active: true } }));
    var pctx = cvs.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var vw = window.innerWidth, vh = window.innerHeight;
    cvs.width = Math.round(vw * dpr);
    cvs.height = Math.round(vh * dpr);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";

    var HEXC = "0123456789abcdef";
    var seed = Math.floor(Math.random() * 1e9);
    // Matches the mask front: ray to the farthest corner plus the
    // band depth, so the wave fully exits the screen.
    var rayLen = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
    var maxR = rayLen + 260;
    // A thick glyph band IS the visible edge of the change: the
    // leading ring sits right on the boundary at full strength, then
    // the band decays over ~300px behind it. One fill style per pulse
    // and one alpha per ring keep the draw batched and fast; organic
    // texture comes from hash-based gaps and radial jitter instead of
    // per-glyph alpha strings.
    pctx.fillStyle = next === "light" ? "rgb(20,20,20)" : "rgb(242,242,242)";
    // [distance behind the front, alpha, font px]
    var RINGS = [
      [8, 1.0, 14],
      [30, 0.95, 13],
      [56, 0.85, 12],
      [86, 0.7, 12],
      [120, 0.55, 11],
      [158, 0.4, 10],
      [200, 0.28, 9],
      [246, 0.16, 9],
      [296, 0.08, 8]
    ];
    var start = performance.now();

    function cleanup() {
      if (!cvs.parentNode) return;
      cvs.remove();
      document.dispatchEvent(new CustomEvent("themepulse", { detail: { active: false } }));
    }

    function frame(now) {
      var p = Math.min(1, (now - start) / WIPE_MS);
      var e = wipeEase(p);
      pctx.clearRect(0, 0, vw, vh);
      var front = e * maxR;
      // Hold full strength through most of the sweep, then dissolve.
      var fade = 1 - Math.pow(p, 4);

      for (var k = 0; k < RINGS.length; k++) {
        var rk = front - RINGS[k][0];
        if (rk <= 4) continue;
        pctx.globalAlpha = Math.min(1, RINGS[k][1] * fade);
        pctx.font = RINGS[k][2] + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        var count = Math.max(14, Math.floor((2 * Math.PI * rk) / 8));
        for (var i = 0; i < count; i++) {
          var hh = (Math.imul(i + 1, 2654435761) + k * 40503 + seed) >>> 0;
          if ((hh >> 6) % 7 === 0) continue; // organic gaps in the band
          var ang = (i / count) * Math.PI * 2 + k * 0.13;
          var rj = rk + ((hh >> 8) % 13) - 6;
          var gx = x + Math.cos(ang) * rj;
          var gy = y + Math.sin(ang) * rj;
          if (gx < -14 || gx > vw + 14 || gy < -14 || gy > vh + 14) continue;
          pctx.fillText(HEXC[hh & 15], gx, gy);
        }
      }
      pctx.globalAlpha = 1;

      if (p < 1) requestAnimationFrame(frame);
      else cleanup();
    }
    requestAnimationFrame(frame);
    // Safety net: never leave the overlay behind if frames stop.
    setTimeout(cleanup, WIPE_MS + 500);
  }

  function applyTheme(next, crossfade, instant) {
    var root = document.documentElement;
    if (crossfade && !reduceMotion) {
      root.classList.add("theme-anim");
      clearTimeout(animTimer);
      animTimer = setTimeout(function () {
        root.classList.remove("theme-anim");
      }, 1350);
    }
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("as-theme", next); } catch (e) {}
    if (toggleBtn) {
      toggleBtn.setAttribute(
        "aria-label",
        next === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
    document.dispatchEvent(new CustomEvent("themechange", {
      detail: { theme: next, instant: !!instant }
    }));
  }

  if (toggleBtn) {
    // Sync the label with whatever the head script applied.
    var current = document.documentElement.getAttribute("data-theme") || "dark";
    toggleBtn.setAttribute(
      "aria-label",
      current === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
    toggleBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";

      // Preferred path: a slow signal pulse that emanates from the
      // toggle itself; the theme boundary and an ASCII glyph ring
      // travel outward as one wave. Falls back to the whole-page
      // cross-fade (still with the pulse) where the View Transitions
      // API is unavailable.
      var rect = toggleBtn.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;

      if (!reduceMotion && typeof document.startViewTransition === "function") {
        try {
          var vt = document.startViewTransition(function () {
            applyTheme(next, false, true);
            // Created inside the update callback so the canvas is
            // captured with its own view-transition layer and can
            // paint glyphs across BOTH sides of the theme boundary.
            playPulse(x, y, next);
          });
          vt.ready.then(function () {
            // No hard clip edge: the new theme is revealed through a
            // soft radial mask whose ~250px feather is exactly where
            // the glyph band rides, so the characters ARE the border.
            // Color-stop percentages resolve along the gradient ray,
            // which keeps the wipe anchored and full-coverage even
            // when a hosting page scales the site.
            var vw = window.innerWidth, vh = window.innerHeight;
            var xp = (x / vw) * 100;
            var yp = (y / vh) * 100;
            var rayLen = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
            var STEPS = 48;
            var frames = [];
            var clipFrames = [];
            // The clip circle rides 90px beyond the mask front: fully
            // inside the mask's transparent zone, so it is invisible
            // while the mask works, yet it still delivers the radial
            // sweep in browsers that ignore animated mask images.
            var clipRef = Math.hypot(vw, vh) / Math.SQRT2;
            for (var i = 0; i <= STEPS; i++) {
              var front = wipeEase(i / STEPS) * (rayLen + 260);
              var inn = Math.max(0, ((front - 250) / rayLen) * 100).toFixed(2);
              var out = Math.max(0.05, (front / rayLen) * 100).toFixed(2);
              frames.push(
                "radial-gradient(circle farthest-corner at " + xp + "% " + yp + "%, " +
                "black 0%, black " + inn + "%, transparent " + out + "%)"
              );
              clipFrames.push(
                "circle(" + (((front + 90) / clipRef) * 100).toFixed(2) +
                "% at " + xp + "% " + yp + "%)"
              );
            }
            // Animate a single mask property: doubling up with the
            // -webkit- alias makes the browser rasterize the mask
            // twice per frame.
            var maskProp = (window.CSS && CSS.supports &&
              CSS.supports("mask-image", "linear-gradient(#000,#fff)"))
              ? "maskImage" : "webkitMaskImage";
            var kf = { clipPath: clipFrames };
            kf[maskProp] = frames;
            document.documentElement.animate(kf, {
              duration: WIPE_MS,
              easing: "linear",
              pseudoElement: "::view-transition-new(root)"
            });
          }).catch(function () {});
          return;
        } catch (err) { /* fall through to the cross-fade */ }
      }
      playPulse(x, y, next);
      applyTheme(next, true, false);
    });
  }

  /* ---------- Reveal on scroll ---------- */

  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Jurisdiction map (infrastructure panel) ----------
     A dotted world map (rasterized offline from real country
     outlines, equirectangular, lat 72N..56S) with one breathing
     node per jurisdiction at its true coordinates. Static under
     reduced motion. */

  var canvas = document.getElementById("lattice-ascii");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var cssW = 0, cssH = 0, dpr = 1;

  var WORLD = [
    "         ##                #######   ## #########        #############                     ##           #     ## ######################################        #",
    "#     #######################   #     ### ##   ###       ###########                   ##########      #   ### #################################################",
    "####  # ##################################     #####    ########        ##            ######### ##  ############################################################",
    "         ###############################  ##    ###      #####        ###           ##### ##################################################################### ",
    "      ################################      ####          ###                     ######  ############################################################## ####   ",
    "        ####      ####################       ####  #                              ######   ####################################################### ##  ##       ",
    "           #         ###################      #######                        ##     #### # ###################################################        ###       ",
    "       #              #####################  #########                      # #          ###################################################         ###        ",
    "                     # ##################### ##########                     # ### ##############################################################     #          ",
    "                       ############################ # #                          ############################################################# #                ",
    "                          #########################   ##                      ################################################################                  ",
    "                         ############################                          ##############  # ####   #####################################                   ",
    "                         ########################                           #######  # ######     ###  #####################################   ##               ",
    "                         #######################                            #####     #  #### ### ####  ##################################    #                 ",
    "                         ######################                             ####         #  ##########  ############################    #     #                 ",
    "                          ####################                               #   ####        ## ######################################  ##   ##                 ",
    "                           ##################                                ########           #####################################     ###                   ",
    "                            ################                                ###########  ##    #######################################                          ",
    "                              ######## #   #                                ######################### ################################                          ",
    "                             # ######      #                              ##################### ###### ###############################                          ",
    "                              # #####                                    ######################  #####  #  #  #######################                           ",
    "                                 ####      #                             ####################### #########     ##################### #                          ",
    "                                 ####   #     #                          #######################  ########      #######  ######                                 ",
    "                                  #######    # # ##                      ######################## #######       #####     #####                                 ",
    "                                     ####                                ########################  ####          ###      ######     #                          ",
    "                                        ###                              ############################            ###        #####     #                         ",
    "                                          #                              ##########################   #           #           ##      #                         ",
    "                                            # #######                     ############################            #                 #                           ",
    "                                              ########                     ###########################             #        #          #                        ",
    "                                              ###########                   #      ##################                      # #     ##                           ",
    "                                             ############                           ################                        ##   ###                            ",
    "                                            ##############                          ###############                         ##  ####                            ",
    "                                            ################                        ##############                           ##  ### #     # #                  ",
    "                                            ###################                      ############                             #      #      #####  #            ",
    "                                            #####################                     ############                             ###            ###               ",
    "                                             ###################                      ############                                     #       # #              ",
    "                                              #################                       ############                                                              ",
    "                                              #################                       ############   #                                    ##   #                ",
    "                                               ################                      #############  ##                                 ######  ##               ",
    "                                                 #############                       ###########    ##                                ###########               ",
    "                                                 #############                        #########     ##                              ##############              ",
    "                                                 ############                         ##########   ##                              ################             ",
    "                                                 ##########                            ########     #                              #################            ",
    "                                                ##########                             #######                                     #################            ",
    "                                                ##########                              ######                                     #################            ",
    "                                                #########                               #####                                      ######  #########            ",
    "                                                ########                                ##                                         ##       #######             ",
    "                                                #######                                                                                       #####          #  ",
    "                                               ######                                                                                                         # ",
    "                                               ####                                                                                             ##          #   ",
    "                                                ###                                                                                                         #   ",
    "                                               ###                                                                                                        ##    ",
    "                                               ####                                                                                                             ",
    "                                              ###                                                                                                               ",
    "                                               ##                                                                                                               ",
    "                                                ###                                                                                                             ",
  ];
  var MAP_COLS = 160, MAP_ROWS = 56;
  var LAT_TOP = 72, LAT_BOT = -56;

  // One node per jurisdiction, at real coordinates.
  var NODES = [
    { lat: 39.0, lon: -77.5, phase: 0.0 },  // United States (Ashburn)
    { lat: 51.5, lon: -0.13, phase: 1.3 },  // United Kingdom (London)
    { lat: 47.4, lon: 8.55, phase: 2.4 },   // Switzerland (Zurich)
    { lat: 50.1, lon: 8.68, phase: 3.6 },   // Germany (Frankfurt)
    { lat: 1.35, lon: 103.82, phase: 4.9 }  // Singapore
  ];

  function nodeCell(n) {
    return {
      c: Math.floor(((n.lon + 180) / 360) * MAP_COLS),
      r: Math.floor(((LAT_TOP - n.lat) / (LAT_TOP - LAT_BOT)) * MAP_ROWS)
    };
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    cssW = Math.max(rect.width, 1);
    cssH = Math.max(rect.height, 1);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
  }

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

  function draw(t) {
    ctx.clearRect(0, 0, cssW, cssH);

    easeTheme();

    // On narrow panels the full grid smears; sample 2x2 blocks so the
    // map stays legible at every size.
    var step = cssW / MAP_COLS < 3.5 ? 2 : 1;
    var cellW = (cssW / MAP_COLS) * step;
    var cellH = (cssH / MAP_ROWS) * step;

    // Land dots. Light mode needs real ink or the map goes illegible.
    var dotGray = Math.round(80 + (112 - 80) * themeMix);
    ctx.font = (step === 1 ? 7 : 9) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = "rgb(" + dotGray + "," + dotGray + "," + dotGray + ")";
    for (var r = 0; r < MAP_ROWS; r += step) {
      for (var c = 0; c < MAP_COLS; c += step) {
        var land = false;
        for (var rr = r; rr < r + step && rr < MAP_ROWS && !land; rr++) {
          for (var cc = c; cc < c + step && cc < MAP_COLS; cc++) {
            if (WORLD[rr].charAt(cc) === "#") { land = true; break; }
          }
        }
        if (!land) continue;
        ctx.fillText("·", (c / step + 0.5) * cellW, (r / step + 0.5) * cellH);
      }
    }

    // Jurisdiction nodes, breathing gently out of phase.
    ctx.font = '12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    NODES.forEach(function (n) {
      var breath = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.7 + n.phase);
      var gDark = 130 + breath * 90;
      var gLight = 120 - breath * 85;
      var gray = Math.round(gDark + (gLight - gDark) * themeMix);
      var cell = nodeCell(n);
      ctx.fillStyle = "rgb(" + gray + "," + gray + "," + gray + ")";
      ctx.fillText("@", (cell.c / step + 0.5) * cellW, (cell.r / step + 0.5) * cellH);
    });
  }

  var running = false;
  var last = 0;
  var t = 0;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 50) return; // 20fps is plenty for a breathing dot
    t += Math.min(now - last, 100) * 0.001;
    last = now;
    draw(t);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  if ("IntersectionObserver" in window && !reduceMotion) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !document.hidden) start(); else stop();
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  document.addEventListener("themechange", function (e) {
    var d = e.detail || {};
    var next = typeof d === "string" ? d : d.theme;
    var instant = typeof d === "object" && d.instant;
    themeFrom = themeMix;
    themeStart = performance.now();
    themeTarget = next === "light" ? 1 : 0;
    if (instant || !running) {
      themeMix = themeTarget;
      if (!running) draw(0);
    }
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reduceMotion) draw(0);
    }, 120);
  });

  resize();
  draw(0);
})();
