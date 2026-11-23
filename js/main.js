(function () {
  "use strict";

  var SITE = window.SITE || {};
  var PROJECTS = window.PROJECTS || [];
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Only allow http(s) links so bad data can't inject javascript: URLs.
  function safeUrl(u) {
    try {
      var parsed = new URL(u, window.location.href);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
    } catch (e) {
      return null;
    }
  }

  // Only allow simple hex colors for the per-card accent.
  function safeColor(c) {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
  }

  function link(label, href, className) {
    var url = safeUrl(href);
    if (!url) return null;
    var a = el("a", className, label);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  /* ---------- Site chrome ---------- */
  function setupChrome() {
    var name = SITE.name || "Portfolio";
    document.title = name + " | Portfolio";
    $("site-name").textContent = name;
    $("brand-mark").textContent = SITE.brandEmoji || "⚡";
    $("hero-eyebrow").textContent = SITE.eyebrow || "";
    $("hero-prefix").textContent = SITE.heroPrefix || "";
    $("hero-tagline").textContent = SITE.tagline || "";
    $("footer-text").textContent = SITE.footer || "";

    var ghUrl = SITE.github && safeUrl(SITE.github);
    ["github-link", "hero-github"].forEach(function (id) {
      var a = $(id);
      if (ghUrl) a.href = ghUrl;
      else a.hidden = true;
    });

    if (SITE.about) {
      $("about-title").textContent = SITE.about.title || "";
      $("about-text").textContent = SITE.about.text || "";
      var box = $("principles");
      (SITE.about.principles || []).forEach(function (p) {
        var c = el("div", "principle reveal");
        c.appendChild(el("span", "principle-icon", p.icon || "✨"));
        c.appendChild(el("h3", null, p.title || ""));
        c.appendChild(el("p", null, p.text || ""));
        box.appendChild(c);
      });
    }
  }

  /* ---------- Theme ---------- */
  function setupTheme() {
    var root = document.documentElement;
    try {
      var saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
    } catch (e) { /* storage unavailable; ignore */ }

    $("theme-toggle").addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- Rotating headline ---------- */
  function setupRotator() {
    var words = SITE.heroWords || [];
    var node = $("rotator-word");
    if (!words.length) { node.textContent = ""; return; }
    node.textContent = words[0];
    if (reduceMotion || words.length < 2) return;

    var i = 0;
    setInterval(function () {
      node.classList.add("out");
      setTimeout(function () {
        i = (i + 1) % words.length;
        node.textContent = words[i];
        node.classList.remove("out");
      }, 280);
    }, 2400);
  }

  /* ---------- Ticker ---------- */
  function setupTicker() {
    var items = SITE.ticker || [];
    var track = $("ticker");
    if (!items.length) { track.parentNode.hidden = true; return; }
    // Two copies so the CSS loop is seamless.
    for (var copy = 0; copy < 2; copy++) {
      items.forEach(function (t) {
        track.appendChild(el("span", "ticker-item", t));
        track.appendChild(el("span", "ticker-dot", "✦"));
      });
    }
  }

  /* ---------- Emoji burst (click an icon) ---------- */
  function burst(source) {
    if (reduceMotion) return;
    var rect = source.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var emoji = source.textContent;
    for (var n = 0; n < 12; n++) {
      var p = el("span", "burst", emoji);
      p.setAttribute("aria-hidden", "true");
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      document.body.appendChild(p);
      var angle = (Math.PI * 2 * n) / 12 + Math.random() * 0.5;
      var dist = 60 + Math.random() * 70;
      var anim = p.animate([
        { transform: "translate(-50%, -50%) scale(.4)", opacity: 1 },
        { transform: "translate(calc(-50% + " + Math.cos(angle) * dist + "px), calc(-50% + " + Math.sin(angle) * dist + "px)) scale(1.1) rotate(" + (Math.random() * 120 - 60) + "deg)", opacity: 0 }
      ], { duration: 700 + Math.random() * 300, easing: "cubic-bezier(.2,.8,.3,1)" });
      anim.onfinish = (function (node) { return function () { node.remove(); }; })(p);
    }
  }

  /* ---------- Project cards ---------- */
  function card(p, index) {
    var c = el("article", "card reveal");
    var color = safeColor(p.color);
    if (color) c.style.setProperty("--c", color);

    var top = el("div", "card-top");
    top.appendChild(el("span", "card-num", (index + 1 < 10 ? "0" : "") + (index + 1)));
    var icon = el("button", "card-icon", p.icon || "✨");
    icon.type = "button";
    icon.setAttribute("aria-label", "Celebrate " + (p.name || "this project"));
    icon.addEventListener("click", function () { burst(icon); });
    top.appendChild(icon);
    c.appendChild(top);

    var body = el("div", "card-body");
    body.appendChild(el("h3", null, p.name || "Untitled"));
    body.appendChild(el("p", null, p.description || ""));

    if (p.tags && p.tags.length) {
      var tg = el("div", "card-tags");
      p.tags.forEach(function (t) { tg.appendChild(el("span", "chip", t)); });
      body.appendChild(tg);
    }

    var links = el("div", "card-links");
    var demo = p.demo ? link("Launch app ↗", p.demo, "btn btn-primary") : null;
    var repo = link("Source", p.url, "btn");
    if (demo) links.appendChild(demo);
    if (repo) links.appendChild(repo);
    if (links.childNodes.length) body.appendChild(links);

    c.appendChild(body);
    return c;
  }

  function renderProjects() {
    var grid = $("grid");
    PROJECTS.forEach(function (p, i) { grid.appendChild(card(p, i)); });
  }

  /* ---------- Scroll reveal ---------- */
  function setupReveal() {
    var nodes = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      nodes.forEach(function (n) { n.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    nodes.forEach(function (n, i) {
      n.style.transitionDelay = (i % 4) * 70 + "ms";
      io.observe(n);
    });
  }

  setupChrome();
  setupTheme();
  setupRotator();
  setupTicker();
  renderProjects();
  setupReveal();
})();
