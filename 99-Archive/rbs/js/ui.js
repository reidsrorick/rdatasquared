// Shared view widgets: Modal, CategorySelect, ColorField, ConfirmButton.

import { html, useEffect } from './vendor/preact-htm.js';

export function Modal({ title, onClose, width, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return html`
    <div class="modal-backdrop" onClick=${onClose}>
      <div class="modal" style=${width ? `min-width:${width}px;max-width:${width + 80}px` : ''}
           onClick=${(e) => e.stopPropagation()}>
        ${title ? html`<h3>${title}</h3>` : null}
        ${children}
      </div>
    </div>`;
}

// Grouped <select> of categories. `value` is an id (number), '' , or 'uncategorized'.
// onChange receives: null | number | 'uncategorized'.
export function CategorySelect({
  value, onChange, groups, ungrouped,
  name, className = 'form-control',
  blankLabel = '— uncategorized —', withUncategorized = false,
}) {
  const current = value == null ? '' : String(value);
  return html`
    <select name=${name} class=${className} value=${current}
            onChange=${(e) => {
              const v = e.target.value;
              onChange(v === '' ? null : v === 'uncategorized' ? 'uncategorized' : Number(v));
            }}>
      <option value="">${blankLabel}</option>
      ${withUncategorized ? html`<option value="uncategorized">— Uncategorized —</option>` : null}
      ${groups.map((g) => html`
        <optgroup label=${g.name}>
          ${g.categories.map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
        </optgroup>`)}
      ${ungrouped.length ? html`
        <optgroup label="Ungrouped">
          ${ungrouped.map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
        </optgroup>` : null}
    </select>`;
}

export function ColorField({ value, onChange, name }) {
  return html`
    <div class="color-row">
      <input type="color" name=${name} class="color-picker" value=${value}
             onInput=${(e) => onChange(e.target.value)} />
      <span class="color-preview-swatch" style=${`background:${value};width:22px;height:22px;border-radius:6px;display:inline-block`}></span>
    </div>`;
}

export function FormActions({ submitLabel, onCancel, danger }) {
  return html`
    <div class="form-actions">
      <button type="submit" class=${danger ? 'btn btn-danger' : 'btn btn-primary'}>${submitLabel}</button>
      <button type="button" class="btn" onClick=${onCancel}>Cancel</button>
    </div>`;
}
