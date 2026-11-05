// Chart.js wrappers, ported from static/js/charts.js. Chart.js loads as a global
// from js/vendor/chart.umd.js (see index.html).

const Chart = window.Chart;
const MASKED_AMT = '$•••••';
const AVG_COLOR = '#f59e0b';
const MEDIAN_COLOR = '#7c3aed';

function privacy() {
  return document.documentElement.classList.contains('privacy-mode');
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function destroy(canvas) {
  if (canvas && canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
}

export function renderCategoryChart(canvas, data) {
  if (!canvas || !Chart) return;
  destroy(canvas);
  if (!data || !data.length) return;
  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map((d) => d.name),
      datasets: [{
        data: data.map((d) => d.amount),
        backgroundColor: data.map((d) => d.color),
        borderWidth: 2, borderColor: '#ffffff',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 12 }, padding: 12, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (c) => privacy() ? ` ${c.label}: ${MASKED_AMT}` : ` ${c.label}: $${c.parsed.toFixed(2)}`,
          },
        },
      },
    },
  });
}

export function renderMonthlyChart(canvas, data, onPointClick, selectedIndex, opts = {}) {
  if (!canvas || !Chart) return;
  destroy(canvas);
  if (!data || !data.length) return;

  const radii = (sel) => data.map((_, i) => (i === sel ? 6 : 3.5));
  const colors = (sel) => data.map((_, i) => (i === sel ? '#1d4ed8' : '#3b82f6'));
  const amounts = data.map((d) => d.amount);

  const datasets = [{
    label: 'Spending',
    data: amounts,
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59,130,246,.12)',
    fill: true, tension: 0.35, borderWidth: 2,
    pointRadius: radii(selectedIndex), pointHoverRadius: 6,
    pointBackgroundColor: colors(selectedIndex),
    pointBorderColor: '#ffffff', pointBorderWidth: 2,
  }];

  const flat = (label, value, color) => ({
    label, data: data.map(() => value),
    borderColor: color, borderDash: [6, 4], borderWidth: 1.5,
    fill: false, tension: 0, pointRadius: 0, pointHoverRadius: 0,
  });
  if (opts.showAvg) datasets.push(flat('Average', amounts.reduce((a, b) => a + b, 0) / amounts.length, AVG_COLOR));
  if (opts.showMedian) datasets.push(flat('Median', median(amounts), MEDIAN_COLOR));

  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: { labels: data.map((d) => d.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (evt, elements, chart) => {
        if (!onPointClick) return;
        const pt = elements.find((e) => e.datasetIndex === 0) || elements[0];
        if (!pt) return;
        chart.data.datasets[0].pointRadius = radii(pt.index);
        chart.data.datasets[0].pointBackgroundColor = colors(pt.index);
        chart.update();
        onPointClick(data[pt.index], pt.index);
      },
      onHover: (evt, elements, chart) => {
        chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${privacy() ? MASKED_AMT : `$${c.parsed.y.toFixed(2)}`}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => (privacy() ? '$•••' : '$' + v.toLocaleString()), font: { size: 11 } },
          grid: { color: '#f1f5f9' },
        },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}
