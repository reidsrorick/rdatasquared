/* ==========================================================================
   shell.js — the one place the site's structure is defined. Injects the shared
   masthead, the "spine" chain navigation (with the current page marked), and
   the prev/next footer. Every page sets two attributes on <body>:
       data-page="caesar"   — which stop we're on (or "home")
       data-root=".."        — relative path back to the site root
   Classic script, no imports, so it runs straight off file://.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.shell = (function () {
  "use strict";

  // THE SPINE. Order is the argument. `id` matches body[data-page].
  const PAGES = [
    { id: "encoding",     file: "lessons/00-encoding-hashing-encryption.html", n: "0", short: "Encoding≠Crypto" },
    { id: "caesar",       file: "lessons/01-caesar.html",                      n: "1", short: "Caesar" },
    { id: "substitution", file: "lessons/02-substitution.html",                n: "2", short: "Substitution" },
    { id: "vigenere",     file: "lessons/03-vigenere.html",                    n: "3", short: "Vigenère" },
    { id: "otp",          file: "lessons/04-one-time-pad.html",                n: "4", short: "One-time pad" },
    { id: "ecb",          file: "lessons/05-block-ciphers-ecb.html",           n: "5", short: "Block / ECB" },
    { id: "modes",        file: "lessons/06-modes-malleability.html",          n: "6", short: "Modes / AEAD" },
    { id: "dh",           file: "lessons/07-diffie-hellman.html",              n: "7", short: "Diffie–Hellman" },
    { id: "rsa",          file: "lessons/08-rsa.html",                         n: "8", short: "RSA" },
    { id: "diy",          file: "lessons/09-dont-roll-your-own.html",          n: "9", short: "Don't roll your own" },
  ];

  function href(root, file) { return root.replace(/\/$/, "") + "/" + file; }

  function build() {
    const body = document.body;
    const root = body.getAttribute("data-root") || ".";
    const current = body.getAttribute("data-page") || "home";

    // ---- skip link ----
    const skip = document.createElement("a");
    skip.className = "skip-link";
    skip.href = "#main";
    skip.textContent = "Skip to content";
    body.insertBefore(skip, body.firstChild);

    // ---- masthead ----
    const head = document.createElement("header");
    head.className = "masthead";
    head.innerHTML =
      '<div class="masthead__bar">' +
        '<a class="masthead__title" href="' + href(root, "index.html") + '">' +
          'The Broken Chain</a>' +
        '<span class="masthead__meta">a field manual in cryptanalysis</span>' +
      '</div>';

    // ---- chain nav ----
    const nav = document.createElement("nav");
    nav.className = "chain";
    nav.setAttribute("aria-label", "Lesson spine");
    const frag = [];
    frag.push('<a class="chain__link" href="' + href(root, "index.html") +
      '"' + (current === "home" ? ' aria-current="page"' : "") + '>▚ home</a>');
    PAGES.forEach(function (p) {
      frag.push('<span class="chain__sep">→</span>');
      frag.push('<a class="chain__link" href="' + href(root, p.file) + '"' +
        (p.id === current ? ' aria-current="page"' : "") +
        ' title="' + p.short + '">' + p.n + ' ' + p.short + "</a>");
    });
    nav.innerHTML = frag.join("");

    body.insertBefore(nav, skip.nextSibling);
    body.insertBefore(head, nav);

    // ---- prev/next footer ----
    const idx = PAGES.findIndex(function (p) { return p.id === current; });
    const foot = document.createElement("footer");
    foot.className = "site-foot";
    let prev = "", next = "";
    if (current === "home") {
      next = PAGES[0];
    } else if (idx >= 0) {
      prev = idx > 0 ? PAGES[idx - 1] : { file: "index.html", short: "home" };
      next = idx < PAGES.length - 1 ? PAGES[idx + 1] : null;
    }
    const prevHtml = prev
      ? '<a href="' + href(root, prev.file) + '">← ' + prev.short + "</a>"
      : "<span></span>";
    const nextHtml = next
      ? '<a href="' + href(root, next.file) + '">' + (next.short) + " →</a>"
      : '<span>end of the chain</span>';
    foot.innerHTML =
      '<div class="site-foot__nav">' + prevHtml +
      '<span>Every cipher here is a tombstone for the one before it.</span>' +
      nextHtml + "</div>";
    body.appendChild(foot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }

  return { PAGES };
})();
