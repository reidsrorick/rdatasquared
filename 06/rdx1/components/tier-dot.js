const TIER_COLORS = {
  inner: 'var(--rdx-orange)',
  close: 'var(--rdx-cobalt)',
  casual: 'var(--rdx-cyan)',
};

export function tierDotHTML(tier) {
  const color = TIER_COLORS[tier] || 'var(--text-subtle)';
  return `<span class="tier-dot" style="--dot-color:${color}" title="${tier}"></span>`;
}
