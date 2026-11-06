/* Gráficos en SVG hecho a mano (sin librerías): barras apiladas por día y mapa de calor. */
window.B = window.B || {};

B.charts = (() => {
  const { esc } = B.u;
  const H = 36e5;

  function niceStep(maxH) {
    for (const s of [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12]) if (maxH / s <= 4) return s;
    return 24;
  }

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /**
   * Barras apiladas: una barra por día, segmentos por categoría.
   * rows: [{ day, byCat: Map }] · series: [{ key, name, color }]
   */
  function dailyStacked(container, rows, series) {
    const width = Math.max(320, container.clientWidth || 700);
    const height = 230;
    const m = { top: 12, right: 8, bottom: 26, left: 40 };
    const pw = width - m.left - m.right, ph = height - m.top - m.bottom;
    const totals = rows.map((r) => series.reduce((a, s) => a + (r.byCat.get(s.key) || 0), 0));
    const maxH = Math.max(...totals, 0) / H;

    const legend = `<div class="legend">${series.map((s) => `<span class="legend-item">${B.ui.dot(s.color)}${esc(s.name)}</span>`).join('')}</div>`;
    if (maxH === 0) {
      container.innerHTML = `<div class="chart-empty">Sin tiempo registrado en este período.</div>`;
      return;
    }

    const step = niceStep(maxH);
    const top = Math.ceil(maxH / step) * step || step;
    const y = (h) => m.top + ph - (h / top) * ph;
    const band = pw / rows.length;
    const bw = Math.max(4, Math.min(38, band * 0.64));
    const todayKey = B.u.dayKey(Date.now());
    const labelEvery = band < 18 ? Math.ceil(18 / band) * 2 - 1 : 1;
    const isMonth = rows.length > 7;

    let grid = '', bars = '', labels = '', hits = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      const yy = y(v).toFixed(1);
      grid += `<line x1="${m.left}" x2="${width - m.right}" y1="${yy}" y2="${yy}" class="grid${v === 0 ? ' base' : ''}"/>`;
      grid += `<text x="${m.left - 8}" y="${yy}" class="tick" text-anchor="end" dominant-baseline="middle">${v % 1 ? v.toFixed(v * 4 % 2 ? 2 : 1) : v}h</text>`;
    }

    rows.forEach((r, i) => {
      const cx = m.left + band * i + band / 2;
      const x = cx - bw / 2;
      let acc = 0;
      const segs = series.filter((s) => r.byCat.get(s.key) > 0);
      segs.forEach((s, j) => {
        const ms = r.byCat.get(s.key);
        const y0 = y(acc / H), y1 = y((acc + ms) / H);
        acc += ms;
        const gap = j > 0 ? 2 : 0;
        const h = Math.max(0, y0 - y1 - gap);
        if (h <= 0) return;
        if (j === segs.length - 1) bars += `<path d="${roundedTop(x, y1, bw, h, 4)}" fill="${s.color}"/>`;
        else bars += `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${s.color}"/>`;
      });
      const key = B.u.dayKey(r.day);
      const d = new Date(r.day);
      if (i % labelEvery === 0 || key === todayKey) {
        const lbl = isMonth ? String(d.getDate()) : `${B.u.WEEKDAYS[B.u.weekdayIndex(r.day)]} ${d.getDate()}`;
        labels += `<text x="${cx}" y="${height - 8}" class="tick${key === todayKey ? ' today' : ''}" text-anchor="middle">${lbl}</text>`;
      }
      const tipRows = series.filter((s) => r.byCat.get(s.key) > 0)
        .map((s) => `<div class="tip-row">${B.ui.dot(s.color)}<span>${esc(s.name)}</span><b>${B.u.durCompact(r.byCat.get(s.key))}</b></div>`).join('');
      const tip = `<div class="tip-title">${esc(B.u.fmtDate(r.day, { weekday: true }))}</div>${tipRows || '<div class="muted">Sin tiempo</div>'}<div class="tip-total">Total <b>${B.u.durCompact(totals[i])}</b></div>`;
      hits += `<rect class="hit" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${ph}" data-tip-html="${esc(tip)}"/>`;
    });

    container.innerHTML = `${legend}
      <svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Horas por día, apiladas por categoría">
        ${grid}${bars}${labels}${hits}
      </svg>`;
  }

  /** Mapa de calor estilo GitHub de las últimas `weeks` semanas. */
  function heatmap(container, dayTotals, weeks = 20) {
    const cell = 13, gap = 3, left = 28, topPad = 18;
    const thisWeek = B.u.startOfWeek(Date.now());
    const first = B.u.addDays(thisWeek, -7 * (weeks - 1));
    const today = B.u.startOfDay(Date.now());
    const level = (min) => (min <= 0 ? 0 : min < 30 ? 1 : min < 60 ? 2 : min < 120 ? 3 : min < 180 ? 4 : 5);
    let cells = '', months = '', lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const wStart = B.u.addDays(first, 7 * w);
      const mth = new Date(wStart).getMonth();
      if (mth !== lastMonth) {
        months += `<text x="${left + w * (cell + gap)}" y="11" class="tick">${B.u.MONTHS[mth]}</text>`;
        lastMonth = mth;
      }
      for (let d = 0; d < 7; d++) {
        const t = B.u.addDays(wStart, d);
        if (t > today) continue;
        const ms = dayTotals.get(B.u.dayKey(t)) || 0;
        const lv = level(ms / 6e4);
        cells += `<rect x="${left + w * (cell + gap)}" y="${topPad + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3"
          class="heat heat-${lv}${t === today ? ' heat-today' : ''}" data-tip="${esc(B.u.fmtDate(t, { weekday: true, year: true }))}: ${ms ? B.u.dur(ms) : 'sin estudio'}"/>`;
      }
    }
    const dayLabels = [0, 2, 4].map((d) => `<text x="0" y="${topPad + d * (cell + gap) + cell - 2}" class="tick">${B.u.WEEKDAYS[d]}</text>`).join('');
    const w = left + weeks * (cell + gap), h = topPad + 7 * (cell + gap);
    const legend = `<div class="heat-legend muted small">Menos ${[0, 1, 2, 3, 4, 5].map((l) => `<span class="heat-swatch heat-${l}"></span>`).join('')} Más
      <span class="heat-legend-note">(0 · &lt;30 min · &lt;1 h · &lt;2 h · &lt;3 h · 3 h+)</span></div>`;
    container.innerHTML = `<div class="heat-scroll"><svg class="chart heatmap" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Días estudiados en las últimas ${weeks} semanas">${months}${dayLabels}${cells}</svg></div>${legend}`;
  }

  return { dailyStacked, heatmap };
})();
