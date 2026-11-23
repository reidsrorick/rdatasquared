(function () {
  "use strict";

  var SITE = window.SITE || {};
  var PROJECTS = (window.PROJECTS || []).slice().sort(function (a, b) {
    return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
  });

  var grid = document.getElementById("grid");
  var tagsEl = document.getElementById("tags");
  var searchEl = document.getElementById("search");
  var countEl = document.getElementById("count");
  var emptyEl = document.getElementById("empty");

  var activeTag = null;
  var query = "";

  // Only allow http(s) links so a typo or bad data can't inject javascript: URLs.
  function safeUrl(u) {
    try {
      var parsed = new URL(u, window.location.href);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
    } catch (e) {
      return null;
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
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
    var name = SITE.name || "Projects";
    document.title = SITE.title ? SITE.title + " | " + name : name;
    document.getElementById("site-name").textContent = name;
    document.getElementById("hero-title").textContent = SITE.title || "My Projects";
    document.getElementById("hero-tagline").textContent = SITE.tagline || "";
    document.getElementById("footer-text").textContent = SITE.footer || "";

    var gh = document.getElementById("github-link");
    var ghUrl = SITE.github && safeUrl(SITE.github);
    if (ghUrl) gh.href = ghUrl;
    else gh.hidden = true;
  }

  /* ---------- Theme ---------- */
  function setupTheme() {
    var root = document.documentElement;
    try {
      var saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
    } catch (e) { /* storage unavailable; ignore */ }

    document.getElementById("theme-toggle").addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- Tags ---------- */
  function buildTags() {
    var seen = {};
    PROJECTS.forEach(function (p) {
      (p.tags || []).forEach(function (t) { seen[t] = true; });
    });
    var all = Object.keys(seen).sort();
    tagsEl.textContent = "";
    if (!all.length) { tagsEl.hidden = true; return; }

    function makeBtn(label, tag) {
      var b = el("button", "tag-btn", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(activeTag === tag));
      b.addEventListener("click", function () {
        activeTag = tag;
        buildTags();
        render();
      });
      return b;
    }

    tagsEl.appendChild(makeBtn("All", null));
    all.forEach(function (t) { tagsEl.appendChild(makeBtn(t, t)); });
  }

  /* ---------- Cards ---------- */
  function card(p) {
    var c = el("article", "card");

    var h = el("h2");
    h.appendChild(document.createTextNode(p.name || "Untitled"));
    if (p.featured) h.appendChild(el("span", "badge badge-featured", "Featured"));
    c.appendChild(h);

    c.appendChild(el("p", null, p.description || ""));

    if (p.tags && p.tags.length) {
      var tg = el("div", "card-tags");
      p.tags.forEach(function (t) { tg.appendChild(el("span", "chip", t)); });
      c.appendChild(tg);
    }

    var links = el("div", "card-links");
    var repo = link("View on GitHub", p.url, "btn btn-primary");
    var demo = p.demo ? link("Live demo", p.demo, "btn") : null;
    if (repo) links.appendChild(repo);
    if (demo) links.appendChild(demo);
    if (links.childNodes.length) c.appendChild(links);

    return c;
  }

  function matches(p) {
    if (activeTag && (p.tags || []).indexOf(activeTag) === -1) return false;
    if (!query) return true;
    var hay = [p.name, p.description].concat(p.tags || []).join(" ").toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function render() {
    var list = PROJECTS.filter(matches);
    grid.textContent = "";
    list.forEach(function (p) { grid.appendChild(card(p)); });
    emptyEl.hidden = list.length > 0;
    countEl.textContent = list.length + " of " + PROJECTS.length + " project" + (PROJECTS.length === 1 ? "" : "s");
  }

  searchEl.addEventListener("input", function () {
    query = searchEl.value.trim().toLowerCase();
    render();
  });

  setupChrome();
  setupTheme();
  buildTags();
  render();
})();
