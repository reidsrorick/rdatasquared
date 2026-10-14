/* Shared renderer: turns RULES into semantic HTML. Each design styles it with CSS. */
(function () {
  // Spicy is the primary tab: first in the switch and the default.
  var NAMES = ["spicy", "uno"].filter(function (n) { return window.RULES[n]; });

  function block(b) {
    switch (b.type) {
      case "p":
        return '<p>' + b.text + '</p>';
      case "list":
        return '<ul class="list">' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join("") + '</ul>';
      case "steps":
        return '<ol class="steps">' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join("") + '</ol>';
      case "cards":
        return '<div class="cardgrid">' + b.items.map(function (c) {
          return '<div class="gc gc-' + c.color + '"><span class="gc-sym" aria-hidden="true">' + c.sym +
            '</span><div class="gc-body"><b>' + c.name + '</b><p>' + c.desc + '</p></div></div>';
        }).join("") + '</div>';
      case "points":
        return '<dl class="points">' + b.items.map(function (i) {
          return '<div><dt>' + i.label + '</dt><dd>' + i.pts + '</dd></div>';
        }).join("") + '</dl>';
      case "callout":
        return '<aside class="callout"><b>' + b.title + '</b><p>' + b.text + '</p></aside>';
    }
    return "";
  }

  var SHARE_URL = "https://rdatasquared.com/uno";

  var QR_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
    '<path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z"/></svg>';

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function mount(opts) {
    opts = opts || {};
    var app = document.getElementById("app");
    var game = (location.hash.replace("#", "").split("/")[0]);
    if (NAMES.indexOf(game) < 0) {
      try { game = localStorage.getItem("uno-game"); } catch (e) {}
    }
    if (NAMES.indexOf(game) < 0) game = NAMES[0];

    function render() {
      var g = window.RULES[game];
      app.setAttribute("data-game", game);
      document.title = g.title + " Rules";

      var switchHtml = '<div class="switch" role="group" aria-label="Choose game">' + NAMES.map(function (n) {
        return '<button type="button" data-game="' + n + '" aria-pressed="' + (n === game) + '">' + window.RULES[n].label + '</button>';
      }).join("") + '</div>';

      var hero = '<header class="hero"><div class="hero-inner"><div class="hero-top"><p class="eyebrow">' + g.eyebrow + '</p>' +
        '<button type="button" class="qr-top" data-share aria-label="Show QR code">' + QR_ICON + '<span>QR</span></button></div><h1>' + g.title +
        '</h1><p class="tag">' + g.tagline + '</p><ul class="meta">' + g.meta.map(function (m) {
          return '<li><span>' + m.k + '</span><b>' + m.v + '</b></li>';
        }).join("") + '</ul></div></header>';

      var toc = '<nav class="toc" aria-label="Sections">' + g.sections.map(function (s, i) {
        return '<a href="#' + game + '/' + s.id + '"><i>' + (i + 1) + '</i><span>' + s.title + '</span></a>';
      }).join("") + '</nav>';

      var secs = '<main class="sections">' + g.sections.map(function (s, i) {
        var inner = s.blocks.map(block).join("");
        var num = '<span class="num">' + pad(i + 1) + '</span>';
        if (opts.accordion) {
          return '<details class="sec" id="' + game + '-' + s.id + '"' + (i === 0 ? " open" : "") + '><summary>' + num +
            '<h2>' + s.title + '</h2><span class="chev" aria-hidden="true"></span></summary><div class="sec-body">' + inner + '</div></details>';
        }
        return '<section class="sec" id="' + game + '-' + s.id + '"><div class="sec-head">' + num + '<h2>' + s.title +
          '</h2></div><div class="sec-body">' + inner + '</div></section>';
      }).join("") + '</main>';

      var foot = '<footer class="foot"><button type="button" class="share-btn" data-share>Show QR code</button>' +
        '<p>Made for game night. Draft layout. Rules subject to house debate.</p></footer>';

      var dialog = '<dialog class="qr-dialog" aria-labelledby="qr-title"><form method="dialog">' +
        '<h2 id="qr-title">Scan to open the rules</h2>' +
        '<img src="qr.svg?v=3" width="260" height="260" alt="QR code linking to ' + SHARE_URL + '">' +
        '<a class="qr-url" href="' + SHARE_URL + '">rdatasquared.com/uno</a>' +
        '<div class="qr-actions"><a class="qr-dl" href="qr.svg" download="uno-rules-qr.svg">Download</a>' +
        '<button class="qr-close">Close</button></div></form></dialog>';

      app.innerHTML = switchHtml + hero + toc + secs + foot + dialog;
    }

    function setGame(n) {
      game = n;
      try { localStorage.setItem("uno-game", n); } catch (e) {}
      history.replaceState(null, "", "#" + n);
      render();
      window.scrollTo(0, 0);
    }

    app.addEventListener("click", function (e) {
      var dlg = app.querySelector(".qr-dialog");
      if (e.target.closest("[data-share]")) { if (dlg && dlg.showModal) dlg.showModal(); return; }
      if (e.target === dlg) { dlg.close(); return; } // backdrop click
      var btn = e.target.closest("button[data-game]");
      if (btn) { setGame(btn.getAttribute("data-game")); return; }
      var a = e.target.closest(".toc a");
      if (a) {
        e.preventDefault();
        var parts = a.getAttribute("href").slice(1).split("/");
        var el = document.getElementById(parts[0] + "-" + parts[1]);
        if (el) {
          if (el.tagName === "DETAILS") el.open = true;
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });

    window.addEventListener("hashchange", function () {
      var n = location.hash.replace("#", "").split("/")[0];
      if (NAMES.indexOf(n) >= 0 && n !== game) { game = n; render(); }
    });

    render();
  }

  window.RulesApp = { mount: mount };
})();
