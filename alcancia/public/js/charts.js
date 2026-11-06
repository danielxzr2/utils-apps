/* Gráficos en SVG hecho a mano (sin librerías): gasto por día, tendencia de periodos y mapa de constancia. */
window.A = window.A || {};

A.charts = (() => {
  const { esc, money, moneyShort } = A.u;

  function niceStep(max, ticks = 4) {
    const raw = max / ticks;
    const p = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
    return 10 * p;
  }
  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function yAxis(width, m, top, step, y) {
    let g = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      const yy = y(v).toFixed(1);
      g += `<line x1="${m.left}" x2="${width - m.right}" y1="${yy}" y2="${yy}" class="grid${v === 0 ? ' base' : ''}"/>`;
      g += `<text x="${m.left - 8}" y="${yy}" class="tick" text-anchor="end" dominant-baseline="middle">${v === 0 ? '0' : moneyShort(v).replace('$ ', '')}</text>`;
    }
    return g;
  }

  /** Gasto por día del periodo, apilado por categoría. rows: [{ day, byCat }] · series: [{ key, name, color }] */
  function dailyStacked(container, rows, series, { dailyLine = null } = {}) {
    const width = Math.max(320, container.clientWidth || 700);
    const height = 240;
    const m = { top: 12, right: 8, bottom: 26, left: 52 };
    const pw = width - m.left - m.right, ph = height - m.top - m.bottom;
    const totals = rows.map((r) => series.reduce((a, s) => a + (r.byCat.get(s.key) || 0), 0));
    const max = Math.max(...totals, dailyLine || 0, 0);
    if (!totals.some((t) => t > 0)) { container.innerHTML = '<div class="chart-empty">Sin gastos en este periodo.</div>'; return; }
    const legend = `<div class="legend">${series.map((s) => `<span class="legend-item">${A.ui.dot(s.color)}${esc(s.name)}</span>`).join('')}
      ${dailyLine ? '<span class="legend-item"><span class="legend-line"></span>Cupo diario para gastos variables</span>' : ''}</div>`;
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step || step;
    const y = (v) => m.top + ph - (v / top) * ph;
    const band = pw / rows.length;
    const bw = Math.max(4, Math.min(30, band * 0.64));
    const today = A.u.todayKey();
    const labelEvery = band < 20 ? Math.ceil(20 / band) : 1;
    let bars = '', labels = '', hits = '';
    rows.forEach((r, i) => {
      const cx = m.left + band * i + band / 2, x = cx - bw / 2;
      let acc = 0;
      const segs = series.filter((s) => r.byCat.get(s.key) > 0);
      segs.forEach((s, j) => {
        const v = r.byCat.get(s.key);
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
        if (h <= 0) return;
        bars += j === segs.length - 1 ? `<path d="${roundedTop(x, y1, bw, h, 4)}" fill="${s.color}"/>` : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${s.color}"/>`;
      });
      if (i % labelEvery === 0 || r.day === today) {
        labels += `<text x="${cx}" y="${height - 8}" class="tick${r.day === today ? ' today' : ''}" text-anchor="middle">${Number(r.day.slice(8))}</text>`;
      }
      const tipRows = segs.slice().reverse().map((s) => `<div class="tip-row">${A.ui.dot(s.color)}<span>${esc(s.name)}</span><b>${money(r.byCat.get(s.key))}</b></div>`).join('');
      const tip = `<div class="tip-title">${esc(A.u.fmtDate(r.day, { weekday: true }))}</div>${tipRows || '<div class="muted">Sin gastos</div>'}<div class="tip-total">Total <b>${money(totals[i])}</b></div>`;
      hits += `<rect class="hit" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${ph}" data-tip-html="${esc(tip)}"/>`;
    });
    const line = dailyLine ? `<line x1="${m.left}" x2="${width - m.right}" y1="${y(dailyLine).toFixed(1)}" y2="${y(dailyLine).toFixed(1)}" class="ref-line"/>` : '';
    container.innerHTML = `${legend}
      <svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gasto por día, apilado por categoría">
        ${yAxis(width, m, top, step, y)}${bars}${line}${labels}${hits}
      </svg>`;
  }

  /** Barras agrupadas por periodo: ingresos, gastos y ahorro. */
  function trend(container, summaries) {
    const series = [
      { key: 'income', name: 'Ingresos', color: 'var(--c0)' },
      { key: 'expenses', name: 'Gastos', color: 'var(--c1)' },
      { key: 'saved', name: 'Ahorro (aportes)', color: 'var(--c2)' },
    ];
    const width = Math.max(320, container.clientWidth || 700);
    const height = 240;
    const m = { top: 12, right: 8, bottom: 30, left: 52 };
    const pw = width - m.left - m.right, ph = height - m.top - m.bottom;
    const max = Math.max(0, ...summaries.flatMap((s) => series.map((x) => Math.max(0, s[x.key]))));
    if (max === 0) { container.innerHTML = '<div class="chart-empty">Aún no hay datos de periodos.</div>'; return; }
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step || step;
    const y = (v) => m.top + ph - (v / top) * ph;
    const band = pw / summaries.length;
    const bw = Math.max(5, Math.min(26, (band * 0.75) / 3 - 2));
    const cur = A.stats.period(A.store.state).key;
    let bars = '', labels = '', hits = '';
    summaries.forEach((s, i) => {
      const cx = m.left + band * i + band / 2;
      const groupW = bw * 3 + 4;
      series.forEach((x, j) => {
        const v = Math.max(0, s[x.key]);
        if (!v) return;
        const bx = cx - groupW / 2 + j * (bw + 2);
        const h = Math.max(1, y(0) - y(v));
        bars += `<path d="${roundedTop(bx, y(v), bw, h, 4)}" fill="${x.color}"/>`;
      });
      const endDay = A.u.addDaysKey(s.P.end, -1);
      const lbl = `${A.u.MONTHS[Number(endDay.slice(5, 7)) - 1]}${endDay.slice(0, 4) !== A.u.todayKey().slice(0, 4) ? ` ${endDay.slice(2, 4)}` : ''}`;
      labels += `<text x="${cx}" y="${height - 10}" class="tick${s.P.key === cur ? ' today' : ''}" text-anchor="middle">${lbl}</text>`;
      const tip = `<div class="tip-title">${esc(s.P.label)}</div>
        ${series.map((x) => `<div class="tip-row">${A.ui.dot(x.color)}<span>${x.name}</span><b>${money(s[x.key])}</b></div>`).join('')}
        <div class="tip-total"><span>Tasa de ahorro</span><b>${A.u.pct(s.savingsRate)}</b></div>`;
      hits += `<rect class="hit" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${ph}" data-tip-html="${esc(tip)}"/>`;
    });
    container.innerHTML = `<div class="legend">${series.map((s) => `<span class="legend-item">${A.ui.dot(s.color)}${s.name}</span>`).join('')}</div>
      <svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos, gastos y ahorro por periodo">
        ${yAxis(width, m, top, step, y)}${bars}${labels}${hits}
      </svg>`;
  }

  /** Mapa de constancia: días registrados en las últimas `weeks` semanas. */
  function heatmap(container, state, weeks = 20) {
    const cell = 13, gap = 3, left = 28, topPad = 18;
    const days = A.stats.registeredDays(state);
    const spentDays = new Set(state.movements.filter((m) => m.type === 'gasto').map((m) => m.date));
    const spentBy = new Map();
    for (const m of state.movements) if (m.type === 'gasto' && !m.goalId) spentBy.set(m.date, (spentBy.get(m.date) || 0) + m.amount);
    const thisWeek = A.u.startOfWeek(Date.now());
    const first = A.u.addDays(thisWeek, -7 * (weeks - 1));
    const today = A.u.todayKey();
    let cells = '', months = '', lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const wStart = A.u.addDays(first, 7 * w);
      const mth = new Date(wStart).getMonth();
      if (mth !== lastMonth) { months += `<text x="${left + w * (cell + gap)}" y="11" class="tick">${A.u.MONTHS[mth]}</text>`; lastMonth = mth; }
      for (let d = 0; d < 7; d++) {
        const k = A.u.dayKey(A.u.addDays(wStart, d));
        if (k > today) continue;
        const reg = days.has(k);
        const zen = reg && !spentDays.has(k);
        const lv = !reg ? 0 : zen ? 5 : 3;
        const label = !reg ? 'sin registro' : zen ? 'día sin gastos 🧘' : `registrado · gastaste ${money(spentBy.get(k) || 0)}`;
        cells += `<rect x="${left + w * (cell + gap)}" y="${topPad + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3"
          class="heat heat-${lv}${k === today ? ' heat-today' : ''}" data-tip="${esc(A.u.fmtDate(k, { weekday: true, year: true }))}: ${esc(label)}"/>`;
      }
    }
    const dayLabels = [0, 2, 4].map((d) => `<text x="0" y="${topPad + d * (cell + gap) + cell - 2}" class="tick">${A.u.WEEKDAYS[d]}</text>`).join('');
    const w = left + weeks * (cell + gap), h = topPad + 7 * (cell + gap);
    container.innerHTML = `<div class="heat-scroll"><svg class="chart heatmap" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Días registrados en las últimas ${weeks} semanas">${months}${dayLabels}${cells}</svg></div>
      <div class="heat-legend muted small"><span class="heat-swatch heat-0"></span> Sin registro <span class="heat-swatch heat-3" style="margin-left:10px"></span> Registrado <span class="heat-swatch heat-5" style="margin-left:10px"></span> Día sin gastos</div>`;
  }

  return { dailyStacked, trend, heatmap };
})();
