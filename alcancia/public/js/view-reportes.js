/* Vista "Reportes": resumen del periodo, gasto por día, por categoría, comparación y tendencia. */
window.A = window.A || {};
A.views = A.views || {};

A.views.reportes = (() => {
  const { esc, money, moneyShort } = A.u;
  let offset = 0;

  function render(el) {
    const state = A.store.state;
    const P = A.stats.period(state, A.u.todayKey(), offset);
    const prevP = A.stats.period(state, A.u.todayKey(), offset - 1);
    const sm = A.stats.summary(state, P);
    const daysElapsed = Math.max(1, Math.min(P.days, A.u.daysBetween(P.start, A.u.todayKey()) + 1));
    const isCurrent = offset === 0;
    // En el periodo en curso se compara contra los mismos días del periodo anterior (comparación justa).
    const prevCut = isCurrent ? { ...prevP, end: A.u.addDaysKey(prevP.start, Math.min(prevP.days, daysElapsed)) } : prevP;
    const prev = A.stats.summary(state, prevCut);
    const vsLabel = isCurrent ? `vs. los primeros ${daysElapsed} días del anterior` : 'vs. periodo anterior';
    const firstDate = state.movements.filter((m) => m.type !== 'ajuste').map((m) => m.date).sort()[0];
    const hist = A.stats.history(state, 6, P.start).filter((h, i, arr) => i === arr.length - 1 || (firstDate && h.P.end > firstDate));
    const cats = sm.cats.filter((x) => x.spent > 0).sort((a, b) => b.spent - a.spent);
    const uncategorized = sm.byTop.get(null) || 0;
    const maxSpent = Math.max(1, ...cats.map((x) => x.spent), uncategorized);
    const biggest = state.movements.filter((m) => m.type === 'gasto' && !m.goalId && !m.recurringId && A.stats.inP(P, m.date)).sort((a, b) => b.amount - a.amount).slice(0, 5);
    const incomes = [...sm.incomeByCat.entries()].sort((a, b) => b[1] - a[1]);
    const avgDay = sm.expenses / (isCurrent ? daysElapsed : P.days);
    const delta = (a, b) => {
      if (!b) return '';
      const d = (a - b) / b;
      if (Math.abs(d) < 0.005) return '<span class="delta">= igual</span>';
      return `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${A.u.pct(Math.abs(d))}</span>`;
    };

    el.innerHTML = `
      <div class="report-toolbar">
        <div class="period-nav">
          <button class="icon-btn" data-action="rp-prev" aria-label="Periodo anterior">‹</button>
          <h2 class="period-label">${esc(P.label)}</h2>
          <button class="icon-btn" data-action="rp-next" aria-label="Periodo siguiente" ${offset >= 0 ? 'disabled' : ''}>›</button>
          ${offset ? '<button class="btn btn-sm btn-ghost" data-action="rp-now">Actual</button>' : ''}
        </div>
        ${isCurrent ? `<span class="muted small">Día ${daysElapsed} de ${P.days}</span>` : sm.count ? (sm.ok ? '<span class="st st-ok">✅ Periodo dentro del presupuesto</span>' : '<span class="st st-over">✕ Alguna categoría se pasó</span>') : ''}
      </div>

      <section class="tiles">
        <div class="tile"><span class="stat-label">Ingresos</span><span class="tile-value">${money(sm.income)}</span><span class="small">${delta(sm.income, prev.income)} <span class="muted">${isCurrent ? 'vs. mismo día del anterior' : 'vs. anterior'}</span></span></div>
        <div class="tile"><span class="stat-label">Gastos</span><span class="tile-value">${money(sm.expenses)}</span><span class="small">${delta(sm.expenses, prev.expenses)} <span class="muted">· ${money(Math.round(avgDay))}/día</span></span></div>
        <div class="tile"><span class="stat-label">Ahorro (aportes)</span><span class="tile-value">${money(sm.saved)}</span><span class="muted small">Tasa de ahorro: <b>${A.u.pct(sm.savingsRate)}</b></span></div>
        <div class="tile"><span class="stat-label">Sin asignar</span><span class="tile-value ${sm.unassigned < 0 ? 'neg' : ''}">${money(sm.unassigned)}</span><span class="muted small">ingresos − gastos − aportes</span></div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Gasto por día</h3><span class="muted small">Sin contar compras pagadas con metas</span></header>
        <div id="daily-chart" class="chart-box"></div>
      </section>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h3>Por categoría</h3><span class="muted small">${vsLabel}</span></header>
          ${cats.length || uncategorized ? cats.map((x) => {
            const subs = A.store.subcategories(x.cat.id).map((s) => [s, sm.bySub.get(s.id) || 0]).filter(([, v]) => v > 0);
            const general = sm.bySub.get(x.cat.id) || 0;
            if (subs.length && general) subs.push([{ name: `${x.cat.name} (general)` }, general]);
            const row = `<div class="hbar"><span class="hbar-label">${A.ui.dot(A.store.catColor(x.cat))}<span>${esc(x.cat.icon || '')} ${esc(x.cat.name)}</span></span>
              <div class="hbar-track"><div class="hbar-fill" style="width:${(x.spent / maxSpent * 100).toFixed(1)}%;background:${A.store.catColor(x.cat)}"></div></div>
              <span class="hbar-value">${money(x.spent)} <span class="small">${delta(x.spent, prev.byTop.get(x.cat.id) || 0)}</span></span></div>`;
            return subs.length ? `<details class="area-break"><summary>${row}</summary><ul class="task-break">${subs.sort((a, b) => b[1] - a[1]).map(([s, v]) => `<li><span>${esc(s.name)}</span><b>${money(v)}</b></li>`).join('')}</ul></details>` : row;
          }).join('') + (uncategorized ? `<div class="hbar"><span class="hbar-label">${A.ui.dot('var(--c-none)')}<span>Sin categoría</span></span><div class="hbar-track"><div class="hbar-fill" style="width:${(uncategorized / maxSpent * 100).toFixed(1)}%;background:var(--c-none)"></div></div><span class="hbar-value">${money(uncategorized)}</span></div>` : '')
            : '<p class="empty-small">Sin gastos en este periodo.</p>'}
          ${sm.goalPurchases ? `<p class="muted small" style="margin-top:10px">🎯 Además, ${money(sm.goalPurchases)} en compras pagadas con metas.</p>` : ''}
        </section>

        <div class="side-col">
          <section class="card">
            <header class="card-head"><h3>Gastos hormiga</h3><span class="muted small">menores de ${moneyShort(state.settings.smallExpense)}</span></header>
            <div class="kv"><span>${A.u.plural(sm.smallCount, 'gasto pequeño', 'gastos pequeños')}</span><b>${money(sm.small)}</b></div>
            ${sm.expenses ? `<div class="muted small">${A.u.pct(sm.small / sm.expenses)} de tus gastos. Un café diario de $ 6.000 son ~$ 180.000 al mes.</div>` : ''}
          </section>
          <section class="card">
            <header class="card-head"><h3>Gastos variables más grandes</h3></header>
            ${A.widgets.movementList(biggest, { showDate: true, empty: 'Sin gastos.' })}
          </section>
          <section class="card">
            <header class="card-head"><h3>Ingresos</h3></header>
            ${incomes.length ? incomes.map(([id, v]) => `<div class="kv"><span>${esc(A.store.catIcon(id))} ${esc(A.store.catLabel(id))}</span><b>${money(v)}</b></div>`).join('') : '<p class="empty-small">Sin ingresos en este periodo.</p>'}
          </section>
        </div>
      </div>

      <section class="card">
        <header class="card-head"><h3>Periodos</h3><span class="muted small">últimos 6</span></header>
        <div id="trend-chart" class="chart-box"></div>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Periodo</th><th>Ingresos</th><th>Gastos</th><th>Ahorro</th><th>Tasa</th><th>Presupuesto</th></tr></thead>
          <tbody>${hist.slice().reverse().map((h) => `<tr><td>${esc(h.P.label)}</td><td>${money(h.income)}</td><td>${money(h.expenses)}</td><td>${money(h.saved)}</td><td>${A.u.pct(h.savingsRate)}</td>
            <td>${!h.count ? '<span class="muted">—</span>' : h.P.end > A.u.todayKey() ? '<span class="muted">en curso</span>' : h.ok ? '<span class="st st-ok">✓ en verde</span>' : '<span class="st st-over">✕ pasado</span>'}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>`;

    // Las categorías sin color propio (gris) se agrupan en "Otras" para no repetir colores.
    const colored = cats.filter((x) => x.cat.color != null);
    const series = colored.map((x) => ({ key: x.cat.id, name: x.cat.name, color: A.store.catColor(x.cat) }));
    const coloredIds = new Set(colored.map((x) => x.cat.id));
    if (cats.length > colored.length || uncategorized) series.push({ key: '__other', name: 'Otras', color: 'var(--c-none)' });
    const rows = A.stats.perDay(state, P).map((r) => {
      const byCat = new Map();
      for (const [k, v] of r.byCat) { const kk = coloredIds.has(k) ? k : '__other'; byCat.set(kk, (byCat.get(kk) || 0) + v); }
      return { day: r.day, byCat };
    });
    const al = isCurrent ? A.stats.allowance(state) : null;
    const line = al && al.hasIncome && al.variableMonth > 0 ? Math.round(al.variableMonth / P.days) : null;
    A.charts.dailyStacked(el.querySelector('#daily-chart'), rows, series, { dailyLine: line });
    A.charts.trend(el.querySelector('#trend-chart'), hist);
  }

  function handle(action) {
    if (action === 'rp-prev') { offset--; return true; }
    if (action === 'rp-next') { offset = Math.min(0, offset + 1); return true; }
    if (action === 'rp-now') { offset = 0; return true; }
    return false;
  }

  return { render, handle };
})();
