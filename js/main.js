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
    $("hero-eyebrow").textContent = SITE.eyebrow || "";
    $("hero-prefix").textContent = SITE.heroPrefix || "";
    $("hero-tagline").textContent = SITE.tagline || "";
    $("footer-text").textContent = SITE.footer || "";

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

  /* ---------- Live preview: this week's movie ---------- */
  function metaContent(doc, prop) {
    var m = doc.querySelector('meta[property="' + prop + '"]');
    return m ? (m.getAttribute("content") || "").trim() : "";
  }

  // Reads the page's public link-preview tags (og:title / og:description / og:image),
  // which name this week's pick. The page is parsed as inert HTML (no scripts run).
  // Falls back silently to the normal card if anything goes wrong.
  function loadMoviePreview(cfg, panel, heading) {
    var page = safeUrl(cfg && cfg.page);
    if (!page || !window.fetch || !window.DOMParser) return;

    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;

    fetch(page, { credentials: "omit", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error("bad status");
        return r.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");

        // Only trust the tags when they describe a weekly pick.
        var desc = metaContent(doc, "og:description");
        var prefix = /^This week's pick:\s*/i;
        if (!prefix.test(desc)) return;

        var title = metaContent(doc, "og:title");
        var site = metaContent(doc, "og:site_name");
        if (site && title.slice(-(site.length + 3)) === " - " + site) {
          title = title.slice(0, -(site.length + 3));
        }
        if (!title) return;

        var pick = el("div", "pick");
        pick.appendChild(el("span", "pick-label", "This week's pick"));
        pick.appendChild(el("strong", "pick-title", title));
        var meta = desc.replace(prefix, "");
        if (meta) pick.appendChild(el("span", "pick-meta", meta));
        heading.parentNode.insertBefore(pick, heading.nextSibling);

        // Only https images are used.
        var poster = metaContent(doc, "og:image");
        poster = /^https:\/\//i.test(poster) ? safeUrl(poster) : null;
        if (poster) {
          var img = new Image();
          img.className = "card-bg";
          img.alt = "Image from " + title;
          img.decoding = "async";
          img.referrerPolicy = "no-referrer";
          img.onload = function () {
            panel.classList.add("has-image");
            panel.insertBefore(img, panel.firstChild);
            requestAnimationFrame(function () { img.classList.add("show"); });
          };
          img.src = poster;
        }
      })
      .catch(function () { /* keep the normal card */ })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------- Project cards ---------- */
  function card(p, index) {
    var c = el("article", "card reveal" + (p.featured ? " card-wide" : ""));
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
    var heading = el("h3", null, p.name || "Untitled");
    body.appendChild(heading);
    body.appendChild(el("p", null, p.description || ""));

    if (p.tags && p.tags.length) {
      var tg = el("div", "card-tags");
      p.tags.forEach(function (t) { tg.appendChild(el("span", "chip", t)); });
      body.appendChild(tg);
    }

    var links = el("div", "card-links");
    var demo = p.demo ? link("Launch app ↗", p.demo, "btn btn-primary") : null;
    if (demo) links.appendChild(demo);
    if (links.childNodes.length) body.appendChild(links);

    c.appendChild(body);
    if (p.preview && p.preview.type === "movie") loadMoviePreview(p.preview, top, heading);
    return c;
  }

  function renderProjects() {
    var grid = $("grid");
    PROJECTS.forEach(function (p, i) { grid.appendChild(card(p, i)); });

    // With an odd number of regular cards, widen the last one so no card sits alone in a half row.
    var regular = grid.querySelectorAll(".card:not(.card-wide)");
    if (regular.length % 2 === 1) regular[regular.length - 1].classList.add("card-wide");
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
