/* Vista "Metas": objetivos de compra y de ahorro, con aportes, hitos y proyección. */
window.A = window.A || {};
A.views = A.views || {};

A.views.metas = (() => {
  const { esc, money } = A.u;

  function render(el) {
    const state = A.store.state;
    const P = A.stats.period(state);
    const sm = A.stats.summary(state, P);
    const w = A.stats.worth(state);
    const active = state.goals.filter((g) => !g.doneAt);
    const done = state.goals.filter((g) => g.doneAt).sort((a, b) => b.doneAt - a.doneAt);
    const ratio = sm.savingsTarget ? sm.saved / sm.savingsTarget : 0;
    const hasEmergency = state.goals.some((g) => g.kind === 'emergencia');

    el.innerHTML = `
      <div class="report-toolbar"><h2>Metas</h2><button class="btn btn-primary" data-action="new-goal">+ Nueva meta</button></div>

      <div class="grid-3">
        <section class="card total-card">
          <span class="stat-label">Apartado en metas</span>
          <span class="tile-value">${money(w.reserved)}</span>
          <span class="muted small">Sigue en tus cuentas, pero ya tiene dueño.</span>
        </section>
        <section class="card total-card">
          <span class="stat-label">Ahorro de este periodo</span>
          <span class="tile-value">${money(sm.saved)}</span>
          ${sm.savingsTarget ? `${A.ui.bar(ratio, ratio >= 1 ? 'var(--good)' : 'var(--accent)')}<span class="muted small">${ratio >= 1 ? '🎉 ¡Cumpliste tu meta de ahorro del mes!' : `Meta del mes: ${money(sm.savingsTarget)} (${state.settings.savingsPct} %)`}</span>`
            : '<span class="muted small">Define tu ingreso y % de ahorro en Presupuesto.</span>'}
        </section>
        <section class="card total-card">
          <span class="stat-label">Metas cumplidas</span>
          <span class="tile-value">${done.length} 🏅</span>
          <span class="muted small">+${A.stats.XP.goal} XP por cada una · +1 XP por cada ${money(A.stats.XP.perMoney)} aportados</span>
        </section>
      </div>

      ${!hasEmergency ? `<section class="card suggest">
        <span class="suggest-ic">🛟</span>
        <div><b>¿Tienes fondo de emergencia?</b><div class="muted small">Es la base de todo: 3 a 6 meses de gastos guardados para imprevistos (perder un ingreso, una urgencia médica, un daño).</div></div>
        <button class="btn btn-sm btn-ghost" data-action="new-goal" data-kind="emergencia">Crear fondo</button>
      </section>` : ''}

      ${active.length ? `<div class="goals-grid">${active.map((g) => A.widgets.goalCard(state, g)).join('')}</div>`
        : `<section class="card empty"><div style="font-size:2.4rem">🎯</div><p>Ponle nombre a lo que quieres: un piano, un viaje, un computador nuevo…<br>Cada aporte llena la barra y te dice cuándo llegas.</p>
           <button class="btn btn-primary" data-action="new-goal">Crear mi primera meta</button></section>`}

      ${done.length ? `<details class="card done-goals"><summary><h3 style="display:inline">Cumplidas (${done.length})</h3></summary>
        <div class="goals-grid" style="margin-top:12px">${done.map((g) => A.widgets.goalCard(state, g)).join('')}</div></details>` : ''}`;
  }

  return { render };
})();
