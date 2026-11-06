/* Vista "Reportes": tiempo por semana o mes, por categoría, área y tarea; tareas completadas y sesiones. */
window.B = window.B || {};
B.views = B.views || {};

B.views.reports = (() => {
  const { esc } = B.u;
  const ui = { mode: 'week', anchor: Date.now() };

  function range() {
    if (ui.mode === 'month') { const a = B.u.startOfMonth(ui.anchor); return [a, B.u.addMonths(a, 1)]; }
    const a = B.u.startOfWeek(ui.anchor); return [a, B.u.addDays(a, 7)];
  }

  function rangeLabel(a, b) {
    if (ui.mode === 'month') { const d = new Date(a); return `${B.u.MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; }
    const last = B.u.addDays(b, -1);
    const sameMonth = new Date(a).getMonth() === new Date(last).getMonth();
    return `${sameMonth ? new Date(a).getDate() : B.u.fmtDate(a)} – ${B.u.fmtDate(last, { year: true })}`;
  }

  function hbars(rows, total) {
    const max = Math.max(...rows.map((r) => r.ms), 1);
    return rows.map((r) => `
      <div class="hbar">
        <div class="hbar-label">${B.ui.dot(r.color)}<span>${esc(r.name)}</span></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(r.ms / max * 100).toFixed(1)}%;background:${r.color}"></div></div>
        <div class="hbar-value">${B.u.durCompact(r.ms)} <span class="muted">${Math.round(r.ms / total * 100)}%</span></div>
      </div>`).join('');
  }

  function render(el) {
    const state = B.store.state;
    const [a, b] = range();
    const now = Date.now();
    const isCurrent = now >= a && now < b;
    const total = B.stats.total(state, a, b);
    const inRange = B.stats.displaySessions(state).filter((s) => B.stats.overlap(s, a, b) > 0).sort((x, y) => y.start - x.start);
    const elapsedDays = B.u.daysIn(a, Math.min(b, B.u.addDays(B.u.startOfDay(now), 1))).length || 1;
    const completed = state.tasks.filter((t) => t.done && t.completedAt >= a && t.completedAt < b);

    // Por categoría
    const byCat = B.stats.sumBy(state, a, b, (s) => B.stats.catOf(state, s.areaId));
    const catRows = [...byCat].map(([id, ms]) => {
      const c = B.store.category(id);
      return { id, ms, name: c ? c.name : 'Sin categoría', color: B.store.catColor(c) };
    }).sort((x, y) => y.ms - x.ms);

    // Por área y tarea
    const byArea = B.stats.sumBy(state, a, b, (s) => s.areaId);
    const byAreaTask = B.stats.sumBy(state, a, b, (s) => `${s.areaId}|${s.taskId || ''}`);
    const areaRows = [...byArea].map(([id, ms]) => ({ id, ms, name: B.store.area(id)?.name || '(área borrada)', color: B.store.areaColor(id) }))
      .sort((x, y) => y.ms - x.ms);
    const maxArea = Math.max(...areaRows.map((r) => r.ms), 1);

    // Serie para el gráfico: categorías en su orden fijo (el color sigue a la categoría, no al ranking)
    const series = state.categories.filter((c) => byCat.has(c.id)).map((c) => ({ key: c.id, name: c.name, color: B.store.catColor(c) }));
    if (byCat.has(null)) series.push({ key: null, name: 'Sin categoría', color: 'var(--c-none)' });

    const completedByArea = new Map();
    for (const t of completed) { if (!completedByArea.has(t.areaId)) completedByArea.set(t.areaId, []); completedByArea.get(t.areaId).push(t); }

    el.innerHTML = `
      <div class="report-toolbar">
        <div class="segmented" role="tablist">
          <button role="tab" class="${ui.mode === 'week' ? 'on' : ''}" aria-selected="${ui.mode === 'week'}" data-action="rep-mode" data-v="week">Semana</button>
          <button role="tab" class="${ui.mode === 'month' ? 'on' : ''}" aria-selected="${ui.mode === 'month'}" data-action="rep-mode" data-v="month">Mes</button>
        </div>
        <div class="period-nav">
          <button class="icon-btn" data-action="rep-shift" data-v="-1" aria-label="Anterior">‹</button>
          <strong class="period-label">${rangeLabel(a, b)}</strong>
          <button class="icon-btn" data-action="rep-shift" data-v="1" aria-label="Siguiente" ${isCurrent ? 'disabled' : ''}>›</button>
          ${isCurrent ? '' : '<button class="btn btn-ghost btn-sm" data-action="rep-today">Ir a hoy</button>'}
        </div>
      </div>

      <div class="tiles">
        <div class="tile"><span class="stat-label">Tiempo total</span><span class="tile-value">${B.u.dur(total)}</span></div>
        <div class="tile"><span class="stat-label">Promedio por día</span><span class="tile-value">${B.u.dur(total / elapsedDays)}</span></div>
        <div class="tile"><span class="stat-label">Sesiones</span><span class="tile-value">${inRange.length}</span></div>
        <div class="tile"><span class="stat-label">Tareas completadas</span><span class="tile-value">${completed.length}</span></div>
      </div>

      <section class="card">
        <header class="card-head"><h3>Horas por día</h3></header>
        <div id="chart-daily" class="chart-box"></div>
      </section>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h3>Por categoría</h3></header>
          ${catRows.length ? hbars(catRows, total) : '<p class="empty-small">Sin datos.</p>'}
        </section>
        <section class="card">
          <header class="card-head"><h3>Por área y tarea</h3><span class="muted small">Toca un área para ver sus tareas</span></header>
          ${areaRows.length ? areaRows.map((r) => {
            const tasks = [...byAreaTask].filter(([k]) => k.startsWith(r.id + '|'))
              .map(([k, ms]) => { const tid = k.split('|')[1]; return { ms, name: tid ? (B.store.task(tid)?.title || '(tarea borrada)') : 'Sin tarea específica', none: !tid }; })
              .sort((x, y) => y.ms - x.ms);
            return `
              <details class="area-break">
                <summary class="hbar">
                  <div class="hbar-label">${B.ui.dot(r.color)}<span>${esc(r.name)}</span></div>
                  <div class="hbar-track"><div class="hbar-fill" style="width:${(r.ms / maxArea * 100).toFixed(1)}%;background:${r.color}"></div></div>
                  <div class="hbar-value">${B.u.durCompact(r.ms)} <span class="muted">${Math.round(r.ms / total * 100)}%</span></div>
                </summary>
                <ul class="task-break">${tasks.map((t) => `<li class="${t.none ? 'muted' : ''}"><span>${esc(t.name)}</span><b>${B.u.durCompact(t.ms)}</b></li>`).join('')}</ul>
              </details>`;
          }).join('') : '<p class="empty-small">Sin datos.</p>'}
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h3>Tareas completadas</h3></header>
          ${completed.length ? [...completedByArea].map(([areaId, ts]) => `
            <div class="done-group">
              <div class="done-area">${B.ui.dot(B.store.areaColor(areaId))}${esc(B.store.area(areaId)?.name || '')}</div>
              <ul>${ts.sort((x, y) => x.completedAt - y.completedAt).map((t) => `<li><span>✓ ${esc(t.title)}</span><span class="muted small">${B.u.fmtDate(t.completedAt, { weekday: true })}</span></li>`).join('')}</ul>
            </div>`).join('') : '<p class="empty-small">Ninguna tarea completada en este período.</p>'}
        </section>
        <section class="card">
          <header class="card-head"><h3>Sesiones</h3><button class="link" data-action="new-session">+ Añadir manual</button></header>
          ${inRange.length ? `<ul class="session-list scroll">${inRange.map((s) => B.widgets.sessionRow(s, { showDate: true })).join('')}</ul>` : '<p class="empty-small">Sin sesiones.</p>'}
        </section>
      </div>`;

    const box = el.querySelector('#chart-daily');
    B.charts.dailyStacked(box, B.stats.perDayByCategory(state, a, b), series);
  }

  function handle(action, ds) {
    switch (action) {
      case 'rep-mode': ui.mode = ds.v; return true;
      case 'rep-shift': {
        const n = Number(ds.v);
        ui.anchor = ui.mode === 'month' ? B.u.addMonths(ui.anchor, n) : B.u.addDays(ui.anchor, 7 * n);
        return true;
      }
      case 'rep-today': ui.anchor = Date.now(); return true;
      default: return false;
    }
  }

  return { render, handle };
})();
