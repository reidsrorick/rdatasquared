/* Tiny dependency-free SVG charts. Each returns an SVG string sized by viewBox
   so it scales responsively inside a .chart container. */
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Horizontal bar chart. data: [{label, value, color?, sub?}]
  function hbar(data, opts = {}) {
    const w = opts.width || 640;
    const rowH = opts.rowH || 26;
    const gap = 8;
    const labelW = opts.labelW || 130;
    const valW = opts.valW || 52;
    const h = data.length * (rowH + gap) + 8;
    const max = Math.max(1, ...data.map((d) => d.value));
    const barMax = w - labelW - valW - 12;
    let y = 6;
    let rows = "";
    for (const d of data) {
      const bw = Math.max(2, (d.value / max) * barMax);
      const color = d.color || "var(--accent)";
      rows += `
        <text x="${labelW - 8}" y="${y + rowH * 0.68}" text-anchor="end" font-size="12" fill="var(--text)">${esc(d.label)}</text>
        <rect x="${labelW}" y="${y}" width="${bw}" height="${rowH}" rx="4" fill="${color}" opacity="0.85"/>
        <text x="${labelW + bw + 6}" y="${y + rowH * 0.68}" font-size="12" fill="var(--muted)" font-weight="700">${esc(d.display != null ? d.display : d.value)}</text>`;
      y += rowH + gap;
    }
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img">${rows}</svg></div>`;
  }

  // Vertical bar chart. data: [{label, value, color?}]
  function vbar(data, opts = {}) {
    const w = opts.width || 640, h = opts.height || 220;
    const padB = 34, padT = 12, padL = 30;
    const max = Math.max(1, ...data.map((d) => d.value));
    const n = data.length;
    const bw = (w - padL - 10) / n * 0.66;
    const step = (w - padL - 10) / n;
    let bars = "";
    data.forEach((d, i) => {
      const bh = ((d.value / max) * (h - padB - padT));
      const x = padL + i * step + (step - bw) / 2;
      const y = h - padB - bh;
      bars += `
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${d.color || "var(--accent-2)"}" opacity="0.85"/>
        <text x="${x + bw / 2}" y="${h - padB + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(d.label)}</text>
        <text x="${x + bw / 2}" y="${y - 3}" text-anchor="middle" font-size="10" fill="var(--text)">${esc(d.display != null ? d.display : d.value)}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img">${bars}</svg></div>`;
  }

  // Line chart. points: [{x(label), y(number)}]
  function line(points, opts = {}) {
    const w = opts.width || 640, h = opts.height || 220;
    const padL = 40, padB = 30, padT = 14, padR = 12;
    if (!points.length) return "";
    const ys = points.map((p) => p.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const iw = w - padL - padR, ih = h - padB - padT;
    const px = (i) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const py = (v) => padT + ih - ((v - min) / (max - min)) * ih;
    let path = "", dots = "", labels = "";
    points.forEach((p, i) => {
      path += (i ? " L" : "M") + px(i).toFixed(1) + " " + py(p.y).toFixed(1);
      dots += `<circle cx="${px(i).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="3.5" fill="var(--accent)"/>`;
      labels += `<text x="${px(i).toFixed(1)}" y="${h - padB + 14}" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(p.x)}</text>`;
    });
    const grid = [min, (min + max) / 2, max].map((v) =>
      `<line x1="${padL}" y1="${py(v)}" x2="${w - padR}" y2="${py(v)}" stroke="var(--border)" stroke-dasharray="3 3"/>
       <text x="${padL - 6}" y="${py(v) + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${v.toFixed(2)}</text>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img">${grid}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}${labels}</svg></div>`;
  }

  // Scatter. points: [{x, y, label, color?}]
  function scatter(points, opts = {}) {
    const w = opts.width || 640, h = opts.height || 340;
    const padL = 46, padB = 36, padT = 14, padR = 14;
    if (!points.length) return "";
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    let xmin = Math.min(...xs), xmax = Math.max(...xs);
    let ymin = Math.min(...ys), ymax = Math.max(...ys);
    const padv = (a, b) => { const d = (b - a) || 1; return [a - d * 0.05, b + d * 0.05]; };
    [xmin, xmax] = padv(xmin, xmax); [ymin, ymax] = padv(ymin, ymax);
    const iw = w - padL - padR, ih = h - padB - padT;
    const px = (v) => padL + ((v - xmin) / (xmax - xmin)) * iw;
    const py = (v) => padT + ih - ((v - ymin) / (ymax - ymin)) * ih;
    let dots = "";
    for (const p of points) {
      dots += `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="4" fill="${p.color || "var(--accent-2)"}" opacity="0.8"><title>${esc(p.label)} (${p.x}, ${p.y})</title></circle>`;
      if (p.showLabel) dots += `<text x="${(px(p.x) + 6).toFixed(1)}" y="${(py(p.y) + 3).toFixed(1)}" font-size="9" fill="var(--muted)">${esc(p.label)}</text>`;
    }
    const axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--border-2)"/>
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--border-2)"/>
      <text x="${padL + iw / 2}" y="${h - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(opts.xlabel || "")}</text>
      <text x="12" y="${padT + ih / 2}" text-anchor="middle" font-size="10" fill="var(--muted)" transform="rotate(-90 12 ${padT + ih / 2})">${esc(opts.ylabel || "")}</text>`;
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img">${axes}${dots}</svg></div>`;
  }

  window.Charts = { hbar, vbar, line, scatter };
})();
