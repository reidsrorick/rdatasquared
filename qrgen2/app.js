/* QR Code Creator — client-side only.
   Content-type builders + qr-code-styling wrapper. */
(function () {
  "use strict";

  /* ---------------- helpers ---------------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const intOr = (v, d) => (Number.isFinite(+v) ? Math.round(+v) : d);

  // Escape for vCard / iCalendar text values (RFC 6350 / 5545).
  const escICal = (s) =>
    String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");

  // Escape for WIFI: payloads.
  const escWifi = (s) =>
    String(s || "").replace(/([\\;,:"'])/g, "\\$1");

  const ensureScheme = (u) => {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(mailto|tel|sms):/i.test(u)) return u;
    return "https://" + u.replace(/^\/+/, "");
  };

  const digits = (s) => String(s || "").replace(/[^\d+]/g, "");

  // datetime-local -> 20260901T090000  |  date -> 20260901
  function icalDate(v, dateOnly) {
    if (!v) return "";
    if (dateOnly) return v.replace(/-/g, "");
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return "";
    return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`;
  }

  function foldICal(lines) {
    // Wrap the VCALENDAR body; keep it readable, most scanners are lenient.
    return lines.filter((l) => l !== null && l !== undefined && l !== "").join("\r\n");
  }

  /* ---------------- content types ---------------- */
  const TYPES = [
    {
      id: "url",
      label: "Website",
      fields: [{ name: "url", label: "URL", type: "url", placeholder: "example.com", value: "" }],
      build: (v) => ensureScheme(v.url),
    },
    {
      id: "text",
      label: "Text",
      fields: [{ name: "text", label: "Plain text", type: "textarea", placeholder: "Anything…", value: "" }],
      build: (v) => v.text,
    },
    {
      id: "email",
      label: "Email",
      fields: [
        { name: "to", label: "Send to", type: "email", placeholder: "name@example.com" },
        { name: "subject", label: "Subject", type: "text" },
        { name: "body", label: "Message", type: "textarea" },
      ],
      build: (v) => {
        if (!v.to) return "";
        const q = [];
        if (v.subject) q.push("subject=" + encodeURIComponent(v.subject));
        if (v.body) q.push("body=" + encodeURIComponent(v.body));
        return "mailto:" + v.to + (q.length ? "?" + q.join("&") : "");
      },
    },
    {
      id: "phone",
      label: "Phone",
      fields: [{ name: "phone", label: "Phone number", type: "tel", placeholder: "+1 555 123 4567" }],
      build: (v) => (v.phone ? "tel:" + digits(v.phone) : ""),
    },
    {
      id: "sms",
      label: "SMS",
      fields: [
        { name: "phone", label: "Phone number", type: "tel", placeholder: "+1 555 123 4567" },
        { name: "message", label: "Message", type: "textarea" },
      ],
      build: (v) => {
        if (!v.phone) return "";
        return "SMSTO:" + digits(v.phone) + (v.message ? ":" + v.message : "");
      },
    },
    {
      id: "wifi",
      label: "WiFi",
      fields: [
        { name: "ssid", label: "Network name (SSID)", type: "text" },
        { name: "password", label: "Password", type: "text" },
        {
          name: "enc",
          label: "Security",
          type: "select",
          value: "WPA",
          options: [
            ["WPA", "WPA / WPA2 / WPA3"],
            ["WEP", "WEP"],
            ["nopass", "None (open)"],
          ],
        },
        { name: "hidden", label: "Hidden network", type: "checkbox" },
      ],
      build: (v) => {
        if (!v.ssid) return "";
        const enc = v.enc === "nopass" ? "nopass" : v.enc;
        let s = `WIFI:T:${enc};S:${escWifi(v.ssid)};`;
        if (enc !== "nopass") s += `P:${escWifi(v.password)};`;
        if (v.hidden) s += "H:true;";
        return s + ";";
      },
    },
    {
      id: "vcard",
      label: "Contact (vCard)",
      fields: [
        { name: "first", label: "First name", type: "text", half: true },
        { name: "last", label: "Last name", type: "text", half: true },
        { name: "org", label: "Organization", type: "text", half: true },
        { name: "title", label: "Job title", type: "text", half: true },
        { name: "phoneMobile", label: "Mobile phone", type: "tel", half: true },
        { name: "phoneWork", label: "Work phone", type: "tel", half: true },
        { name: "email", label: "Email", type: "email", half: true },
        { name: "website", label: "Website", type: "url", half: true },
        { name: "street", label: "Street address", type: "text" },
        { name: "city", label: "City", type: "text", half: true },
        { name: "state", label: "State / Region", type: "text", half: true },
        { name: "zip", label: "Postal code", type: "text", half: true },
        { name: "country", label: "Country", type: "text", half: true },
        { name: "note", label: "Note", type: "textarea" },
      ],
      build: (v) => {
        const name = `${v.first || ""} ${v.last || ""}`.trim();
        if (!name && !v.org && !v.email && !v.phoneMobile) return "";
        const L = [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `N:${escICal(v.last)};${escICal(v.first)};;;`,
          `FN:${escICal(name || v.org)}`,
          v.org ? `ORG:${escICal(v.org)}` : "",
          v.title ? `TITLE:${escICal(v.title)}` : "",
          v.phoneMobile ? `TEL;TYPE=CELL:${digits(v.phoneMobile)}` : "",
          v.phoneWork ? `TEL;TYPE=WORK,VOICE:${digits(v.phoneWork)}` : "",
          v.email ? `EMAIL;TYPE=INTERNET:${escICal(v.email)}` : "",
          v.website ? `URL:${escICal(ensureScheme(v.website))}` : "",
          v.street || v.city || v.state || v.zip || v.country
            ? `ADR;TYPE=HOME:;;${escICal(v.street)};${escICal(v.city)};${escICal(v.state)};${escICal(v.zip)};${escICal(v.country)}`
            : "",
          v.note ? `NOTE:${escICal(v.note)}` : "",
          "END:VCARD",
        ];
        return foldICal(L);
      },
    },
    {
      id: "event",
      label: "Calendar event",
      fields: [
        { name: "title", label: "Event title", type: "text" },
        { name: "location", label: "Location", type: "text" },
        { name: "allday", label: "All-day event", type: "checkbox" },
        { name: "start", label: "Starts", type: "datetime-local", half: true },
        { name: "end", label: "Ends", type: "datetime-local", half: true },
        { name: "description", label: "Description", type: "textarea" },
      ],
      build: (v) => {
        if (!v.title || !v.start) return "";
        const allDay = !!v.allday;
        const s = allDay ? v.start.slice(0, 10) : v.start;
        const e = allDay ? (v.end || v.start).slice(0, 10) : v.end;
        const dtPrefix = allDay ? ";VALUE=DATE:" : ":";
        const L = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//QR Code Creator//EN",
          "BEGIN:VEVENT",
          `SUMMARY:${escICal(v.title)}`,
          v.location ? `LOCATION:${escICal(v.location)}` : "",
          v.description ? `DESCRIPTION:${escICal(v.description)}` : "",
          `DTSTART${dtPrefix}${icalDate(s, allDay)}`,
          e ? `DTEND${dtPrefix}${icalDate(e, allDay)}` : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ];
        return foldICal(L);
      },
    },
    {
      id: "geo",
      label: "Location",
      fields: [
        { name: "lat", label: "Latitude", type: "text", placeholder: "40.7128", half: true },
        { name: "lng", label: "Longitude", type: "text", placeholder: "-74.0060", half: true },
        { name: "query", label: "…or a place name", type: "text", placeholder: "Statue of Liberty" },
      ],
      build: (v) => {
        if (v.query && !(v.lat && v.lng))
          return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v.query);
        if (v.lat && v.lng) return `geo:${v.lat.trim()},${v.lng.trim()}`;
        return "";
      },
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      fields: [
        {
          name: "kind",
          label: "Profile type",
          type: "select",
          value: "in",
          options: [
            ["in", "Personal profile"],
            ["company", "Company page"],
          ],
        },
        { name: "handle", label: "Username / slug", type: "text", placeholder: "jane-doe" },
      ],
      build: (v) => {
        const h = String(v.handle || "").trim().replace(/^.*linkedin\.com\/(in|company)\//i, "").replace(/\/+$/, "");
        return h ? `https://www.linkedin.com/${v.kind}/${h}` : "";
      },
    },
    {
      id: "discord",
      label: "Discord",
      fields: [
        {
          name: "kind",
          label: "Link type",
          type: "select",
          value: "invite",
          options: [
            ["invite", "Server invite"],
            ["user", "User profile"],
          ],
        },
        { name: "value", label: "Invite code or user ID", type: "text", placeholder: "aBcD123" },
      ],
      build: (v) => {
        const x = String(v.value || "").trim().replace(/^.*discord\.(gg|com)\/(invite\/)?/i, "").replace(/^users\//i, "");
        if (!x) return "";
        return v.kind === "user" ? `https://discord.com/users/${x}` : `https://discord.gg/${x}`;
      },
    },
    {
      id: "spotify",
      label: "Spotify",
      fields: [{ name: "value", label: "Spotify link or URI", type: "text", placeholder: "https://open.spotify.com/… or spotify:track:…" }],
      build: (v) => {
        let x = String(v.value || "").trim();
        if (!x) return "";
        const m = x.match(/^spotify:([a-z]+):([A-Za-z0-9]+)$/i);
        if (m) return `https://open.spotify.com/${m[1]}/${m[2]}`;
        return ensureScheme(x);
      },
    },
    {
      id: "x",
      label: "X / Twitter",
      fields: [{ name: "handle", label: "Handle", type: "text", placeholder: "@username" }],
      build: (v) => {
        const h = String(v.handle || "").trim().replace(/^@/, "").replace(/^.*(?:twitter|x)\.com\//i, "").replace(/\/+$/, "");
        return h ? `https://x.com/${h}` : "";
      },
    },
    {
      id: "youtube",
      label: "YouTube",
      fields: [{ name: "url", label: "Video or channel URL", type: "url", placeholder: "https://youtube.com/…" }],
      build: (v) => ensureScheme(v.url),
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      fields: [
        { name: "phone", label: "Phone number (with country code)", type: "tel", placeholder: "+1 555 123 4567" },
        { name: "message", label: "Prefilled message", type: "textarea" },
      ],
      build: (v) => {
        const n = digits(v.phone).replace(/^\+/, "");
        if (!n) return "";
        return `https://wa.me/${n}` + (v.message ? "?text=" + encodeURIComponent(v.message) : "");
      },
    },
    {
      id: "paypal",
      label: "PayPal",
      fields: [
        { name: "user", label: "PayPal.Me username", type: "text", placeholder: "janedoe", half: true },
        { name: "amount", label: "Amount (optional)", type: "text", placeholder: "25.00", half: true },
      ],
      build: (v) => {
        const u = String(v.user || "").trim().replace(/^.*paypal\.me\//i, "").replace(/\/+$/, "");
        if (!u) return "";
        return `https://www.paypal.com/paypalme/${u}` + (v.amount ? "/" + encodeURIComponent(v.amount) : "");
      },
    },
    {
      id: "crypto",
      label: "Crypto",
      fields: [
        {
          name: "coin",
          label: "Currency",
          type: "select",
          value: "bitcoin",
          options: [
            ["bitcoin", "Bitcoin"],
            ["ethereum", "Ethereum"],
            ["litecoin", "Litecoin"],
            ["dogecoin", "Dogecoin"],
          ],
        },
        { name: "address", label: "Wallet address", type: "text" },
        { name: "amount", label: "Amount (optional)", type: "text", half: true },
        { name: "label", label: "Label (optional)", type: "text", half: true },
      ],
      build: (v) => {
        if (!v.address) return "";
        const q = [];
        if (v.amount) q.push("amount=" + encodeURIComponent(v.amount));
        if (v.label) q.push("label=" + encodeURIComponent(v.label));
        return `${v.coin}:${v.address.trim()}` + (q.length ? "?" + q.join("&") : "");
      },
    },
  ];

  /* ---------------- style defaults ---------------- */
  const STYLE_DEFAULTS = {
    fgColor: "#000000",
    bgColor: "#ffffff",
    bgTransparent: false,
    dotStyle: "square",
    cornerSquareStyle: "",
    cornerDotStyle: "",
    cornerColor: "#000000",
    cornerColorLink: true,
    ecLevel: "Q",
    sizePx: 320,
    marginPx: 16,
    logoSize: 0.4,
    logoMargin: 6,
    hideBgDots: true,
  };

  /* ---------------- state ---------------- */
  const tabsEl = $("typeTabs");
  const formEl = $("contentForm");
  const holderEl = $("qrHolder");
  const errEl = $("qrError");
  const peekEl = $("dataPeek");
  const LS_KEY = "qrcc.v1";

  let activeType = TYPES[0];
  let logoDataUrl = null;
  let qr = null;
  let updateTimer = null;

  /* ---------------- form rendering ---------------- */
  function fieldNode(f) {
    const isCheck = f.type === "checkbox";
    const label = document.createElement("label");
    label.className = "fld" + (isCheck ? " check" : "") + (f.half ? "" : " wide");

    let control;
    if (f.type === "textarea") {
      control = document.createElement("textarea");
    } else if (f.type === "select") {
      control = document.createElement("select");
      f.options.forEach(([val, txt]) => {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = txt;
        control.appendChild(o);
      });
    } else {
      control = document.createElement("input");
      control.type = f.type;
    }
    control.name = f.name;
    if (f.placeholder) control.placeholder = f.placeholder;

    const saved = loadContent()[activeType.id]?.[f.name];
    if (isCheck) {
      control.checked = saved != null ? !!saved : !!f.value;
    } else if (saved != null && saved !== "") {
      control.value = saved;
    } else if (f.value != null) {
      control.value = f.value;
    }

    const span = document.createElement("span");
    span.innerHTML = f.label;

    if (isCheck) {
      label.append(control, span);
    } else {
      label.append(span, control);
    }
    return label;
  }

  function renderForm(type) {
    formEl.innerHTML = "";
    const f = type.fields;
    let i = 0;
    while (i < f.length) {
      if (f[i].half && f[i + 1] && f[i + 1].half) {
        const row = document.createElement("div");
        row.className = "row2";
        row.append(fieldNode(f[i]), fieldNode(f[i + 1]));
        formEl.append(row);
        i += 2;
      } else {
        formEl.append(fieldNode(f[i]));
        i += 1;
      }
    }
  }

  function readValues() {
    const v = {};
    activeType.fields.forEach((f) => {
      const el = formEl.elements[f.name];
      if (!el) return;
      v[f.name] = f.type === "checkbox" ? el.checked : el.value.trim();
    });
    return v;
  }

  /* ---------------- tabs ---------------- */
  function buildTabs() {
    TYPES.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t.label;
      b.dataset.id = t.id;
      b.addEventListener("click", () => selectType(t.id));
      tabsEl.appendChild(b);
    });
  }

  function selectType(id) {
    activeType = TYPES.find((t) => t.id === id) || TYPES[0];
    [...tabsEl.children].forEach((b) => b.classList.toggle("active", b.dataset.id === activeType.id));
    renderForm(activeType);
    persist();
    scheduleUpdate();
  }

  /* ---------------- persistence ---------------- */
  function loadRoot() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function loadContent() {
    return loadRoot().content || {};
  }
  function persist() {
    try {
      const root = loadRoot();
      root.type = activeType.id;
      root.style = {};
      Object.keys(STYLE_DEFAULTS).forEach((k) => {
        const el = $(k);
        root.style[k] = el.type === "checkbox" ? el.checked : el.value;
      });
      root.content = root.content || {};
      root.content[activeType.id] = readValues();
      localStorage.setItem(LS_KEY, JSON.stringify(root));
    } catch {
      /* storage unavailable — ignore */
    }
  }

  function restoreStyle() {
    const s = loadRoot().style || {};
    Object.keys(STYLE_DEFAULTS).forEach((k) => {
      const el = $(k);
      const val = k in s ? s[k] : STYLE_DEFAULTS[k];
      if (el.type === "checkbox") el.checked = typeof val === "boolean" ? val : val === "true";
      else el.value = val;
    });
  }

  /* ---------------- qr options ---------------- */
  function buildData() {
    try {
      return activeType.build(readValues()) || "";
    } catch (e) {
      return "";
    }
  }

  function qrOptions(data) {
    const size = clamp(intOr($("sizePx").value, 320), 128, 2000);
    const fg = $("fgColor").value;
    const cornerColor = $("cornerColorLink").checked ? fg : $("cornerColor").value;
    const transparent = $("bgTransparent").checked;
    const cs = $("cornerSquareStyle").value;
    const cd = $("cornerDotStyle").value;
    return {
      width: size,
      height: size,
      type: "canvas",
      data: data,
      image: logoDataUrl || undefined,
      margin: clamp(intOr($("marginPx").value, 16), 0, 120),
      qrOptions: { errorCorrectionLevel: $("ecLevel").value },
      imageOptions: {
        hideBackgroundDots: $("hideBgDots").checked,
        imageSize: parseFloat($("logoSize").value),
        margin: parseInt($("logoMargin").value, 10),
        crossOrigin: "anonymous",
      },
      dotsOptions: { color: fg, type: $("dotStyle").value },
      backgroundOptions: { color: transparent ? "rgba(255,255,255,0)" : $("bgColor").value },
      cornersSquareOptions: { color: cornerColor, type: cs || undefined },
      cornersDotOptions: { color: cornerColor, type: cd || undefined },
    };
  }

  function render() {
    const data = buildData();
    peekEl.textContent = data || "— fill in the fields above —";

    if (!data) {
      holderEl.innerHTML = "";
      qr = null;
      errEl.hidden = true;
      return;
    }

    try {
      const opts = qrOptions(data);
      if (!qr) {
        qr = new QRCodeStyling(opts);
        holderEl.innerHTML = "";
        qr.append(holderEl);
      } else {
        qr.update(opts);
      }
      errEl.hidden = true;
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent =
        "Couldn't build this QR code: " +
        (e && e.message ? e.message : "the content may be too long for the chosen error-correction level.");
    }
  }

  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      render();
      persist();
    }, 140);
  }

  /* ---------------- logo handling ---------------- */
  function setLogo(dataUrl) {
    logoDataUrl = dataUrl || null;
    const actions = $("logoActions");
    if (dataUrl) {
      $("logoThumb").src = dataUrl;
      actions.hidden = false;
      // Nudge error correction up so the code still scans behind a logo.
      const ec = $("ecLevel");
      if (ec.value === "L" || ec.value === "M") ec.value = "Q";
    } else {
      actions.hidden = true;
      $("logoFile").value = "";
    }
    scheduleUpdate();
  }

  function loadImageFile(file, resetInputOnError) {
    if (!file || !/^image\//.test(file.type)) {
      flashLogoHint("That doesn't look like an image.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      flashLogoHint("Image is over 3 MB — please use a smaller one.");
      if (resetInputOnError) $("logoFile").value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.onerror = () => flashLogoHint("Couldn't read that image.");
    reader.readAsDataURL(file);
  }

  let hintTimer = null;
  function flashLogoHint(msg) {
    const el = $("logoHint");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("warn");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      el.textContent = el.dataset.default;
      el.classList.remove("warn");
    }, 4000);
  }

  $("logoFile").addEventListener("change", (e) => {
    loadImageFile(e.target.files && e.target.files[0], true);
  });
  $("logoClear").addEventListener("click", () => setLogo(null));

  // Paste an image anywhere on the page (clipboard from a screenshot tool,
  // "copy image" in a browser, an image file copied in the OS file manager…).
  window.addEventListener("paste", (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    // Don't hijack a paste the user means for a text field.
    if (tag === "TEXTAREA" || tag === "INPUT") {
      const items = e.clipboardData && e.clipboardData.items;
      const hasImage = items && [...items].some((it) => it.type.indexOf("image") === 0);
      if (!hasImage) return;
    }
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.kind === "file" && it.type.indexOf("image") === 0) {
        e.preventDefault();
        loadImageFile(it.getAsFile());
        return;
      }
    }
  });

  // Drag & drop an image onto the logo panel.
  const dropZone = $("logoDrop");
  if (dropZone) {
    ["dragenter", "dragover"].forEach((ev) =>
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.add("dragging");
      })
    );
    ["dragleave", "dragend", "drop"].forEach((ev) =>
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === "drop" || e.target === dropZone) dropZone.classList.remove("dragging");
      })
    );
    dropZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadImageFile(file);
    });
  }

  /* ---------------- export ---------------- */
  function currentFileName() {
    return ($("fileName").value.trim() || "qr-code").replace(/[^\w.-]+/g, "-");
  }

  document.querySelectorAll(".dl").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ext = btn.dataset.ext;
      const data = buildData();
      if (!data) return;
      try {
        if (ext === "svg") {
          const svgQr = new QRCodeStyling(Object.assign(qrOptions(data), { type: "svg" }));
          await svgQr.download({ name: currentFileName(), extension: "svg" });
        } else {
          await qr.download({ name: currentFileName(), extension: ext });
        }
      } catch (e) {
        alert("Export failed: " + (e && e.message ? e.message : e));
      }
    });
  });

  $("copyBtn").addEventListener("click", async () => {
    const canvas = holderEl.querySelector("canvas");
    if (!canvas || !navigator.clipboard || !window.ClipboardItem) {
      alert("Clipboard image copy isn't supported in this browser — use the PNG button instead.");
      return;
    }
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        const b = $("copyBtn");
        const t = b.textContent;
        b.textContent = "Copied ✓";
        setTimeout(() => (b.textContent = t), 1500);
      } catch (e) {
        alert("Copy failed: " + (e && e.message ? e.message : e));
      }
    });
  });

  /* ---------------- reset ---------------- */
  $("resetBtn").addEventListener("click", () => {
    Object.keys(STYLE_DEFAULTS).forEach((k) => {
      const el = $(k);
      const val = STYLE_DEFAULTS[k];
      if (el.type === "checkbox") el.checked = val;
      else el.value = val;
    });
    setLogo(null);
    scheduleUpdate();
  });

  /* ---------------- wiring ---------------- */
  formEl.addEventListener("input", scheduleUpdate);
  formEl.addEventListener("change", scheduleUpdate);

  [
    "fgColor", "bgColor", "bgTransparent", "dotStyle", "cornerSquareStyle",
    "cornerDotStyle", "cornerColor", "cornerColorLink", "ecLevel", "sizePx",
    "marginPx", "logoSize", "logoMargin", "hideBgDots",
  ].forEach((id) => {
    const el = $(id);
    el.addEventListener("input", scheduleUpdate);
    el.addEventListener("change", scheduleUpdate);
  });

  /* ---------------- init ---------------- */
  buildTabs();
  restoreStyle();
  const startId = loadRoot().type || TYPES[0].id;
  selectType(startId);
  render();
})();
