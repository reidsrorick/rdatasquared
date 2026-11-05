import { html } from '../vendor/preact-htm.js';

export function PageHeader({ title, children }) {
  return html`
    <div class="page-header">
      <div class="page-header-left"><h1>${title}</h1></div>
      ${children}
    </div>`;
}

// Stand-in for views not yet built. Phase number tells you when it lands.
export function Stub({ title, phase, note }) {
  return html`
    <${PageHeader} title=${title} />
    <div class="card">
      <div style="padding: 40px 24px; text-align: center; color: var(--text-muted);">
        <p style="font-size: 15px; margin-bottom: 6px;">${title} is scaffolded.</p>
        <p style="font-size: 13px;">Full view arrives in build phase ${phase}.</p>
        ${note ? html`<p style="font-size: 13px; margin-top: 10px;">${note}</p>` : null}
      </div>
    </div>`;
}
