/* Vista "Progreso": nivel y XP, rachas, constancia, logros, ajustes y datos. */
window.A = window.A || {};
A.views = A.views || {};

A.views.progreso = (() => {
  const { esc, money } = A.u;

  function render(el) {
    const state = A.store.state;
    const xb = A.stats.xpBreakdown(state);
    const st = A.stats.streaks(state);
    const bs = A.stats.budgetStreaks(state);
    const ach = A.stats.achievements(state);
    const unlocked = ach.filter((x) => x.unlocked).length;
    const X = A.stats.XP;
    const set = state.settings;

    el.innerHTML = `
      <div class="grid-3">
        <section class="card">${A.widgets.levelCard(state)}
          <ul class="xp-list small">
            <li><span>📅 ${A.u.plural(xb.counts.days, 'día registrado', 'días registrados')} × ${X.day}</span><b>${xb.days} XP</b></li>
            <li><span>🎯 ${money(Math.max(0, xb.counts.saved))} aportados</span><b>${xb.saved} XP</b></li>
            <li><span>💳 ${money(xb.counts.debtPaid)} pagados a deudas</span><b>${xb.debt} XP</b></li>
            <li><span>✅ ${A.u.plural(xb.counts.periods, 'periodo en verde', 'periodos en verde')} × ${X.period}</span><b>${xb.periods} XP</b></li>
            <li><span>🏅 ${A.u.plural(xb.counts.goals, 'meta cumplida', 'metas cumplidas')} × ${X.goal}</span><b>${xb.goals} XP</b></li>
          </ul>
        </section>
        <section class="card">${A.widgets.streakCard(state)}
          <p class="muted small">Un día cuenta si registras algún gasto, ingreso o aporte con esa fecha, o si lo cierras con <b>Cerrar el día</b> (útil los días en que no gastas nada).</p>
        </section>
        <section class="card">
          <div class="streak ${bs.current ? 'on' : ''}">
            <div class="streak-flame" aria-hidden="true">✅</div>
            <div><div class="streak-num">${A.u.plural(bs.current, 'periodo', 'periodos')} en verde seguidos</div>
              <div class="muted small">Mejor: ${bs.best} · total: ${bs.okCount}</div></div>
          </div>
          <p class="muted small">Un periodo queda "en verde" si al cerrarlo ninguna categoría pasó su límite. Vale ${X.period} XP.</p>
        </section>
      </div>

      <section class="card">
        <header class="card-head"><h3>Constancia</h3><span class="muted small">Últimas 20 semanas · ${A.u.plural(st.total, 'día registrado', 'días registrados')}</span></header>
        <div id="heatmap"></div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Logros</h3><span class="muted small">${unlocked} de ${ach.length}</span></header>
        <div class="achievements">
          ${ach.map((x) => `
            <div class="ach ${x.unlocked ? 'unlocked' : 'locked'}">
              <div class="ach-icon" aria-hidden="true">${x.unlocked ? x.icon : '🔒'}</div>
              <div><div class="ach-name">${esc(x.name)}</div><div class="muted small">${esc(x.desc)}</div></div>
            </div>`).join('')}
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Ajustes y datos</h3></header>
        <div class="settings">
          <label class="field inline"><span>Día de pago (inicio de cada periodo)</span>
            <input type="number" min="1" max="31" value="${set.payDay}" data-setting="payDay"></label>
          <label class="field inline"><span>Un "gasto hormiga" es menor que</span>
            <input data-money inputmode="decimal" value="${A.ui.moneyValue(set.smallExpense)}" data-setting="smallExpense" style="width:140px"></label>
          <label class="field inline"><span>Tema</span>
            <select data-setting="theme">
              ${[['auto', 'Automático (sistema)'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<option value="${v}" ${set.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          ${set.setupDismissed ? '<label class="field inline"><span>Lista de primeros pasos</span><button class="btn btn-sm btn-ghost" data-action="show-setup">Mostrar de nuevo</button></label>' : ''}
        </div>
        <div class="data-box">
          <p class="small">${A.store.mode === 'server'
            ? '💾 Los datos se guardan en <code>data/data.json</code> dentro de la carpeta de la app (con una copia diaria en <code>data/backups/</code>). Súbelo a un repositorio <b>privado</b> para tenerlo en otros computadores.'
            : '⚠️ Modo local: los datos están solo en este navegador. Abre la app con <code>npm start</code> para guardarlos en archivo.'}</p>
          <div class="btn-row">
            <button class="btn btn-ghost btn-sm" data-action="export">⬇ Exportar JSON</button>
            <label class="btn btn-ghost btn-sm file-btn">⬆ Importar JSON<input type="file" accept="application/json,.json" data-action-file="import" hidden></label>
            <button class="btn btn-ghost btn-sm" data-action="export-csv">⬇ Movimientos en CSV</button>
          </div>
        </div>
      </section>`;

    A.charts.heatmap(el.querySelector('#heatmap'), state, 20);

    el.querySelectorAll('[data-setting]').forEach((inp) => inp.addEventListener('change', () => {
      const key = inp.dataset.setting;
      let v = inp.value;
      if (key === 'payDay') v = Math.max(1, Math.min(31, Number(v) || 1));
      if (key === 'smallExpense') { v = A.ui.readMoney(v); if (Number.isNaN(v)) v = 20000; }
      A.store.update((s) => { s.settings[key] = v; });
      if (key === 'theme') A.app.applyTheme();
    }));
    el.querySelector('[data-action-file=import]').addEventListener('change', importFile);
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportData() { download(`alcancia-${A.u.todayKey()}.json`, JSON.stringify(A.store.state, null, 2), 'application/json'); }
  function exportCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['fecha', 'tipo', 'monto', 'categoria', 'cuenta', 'cuenta_destino', 'meta', 'fijo', 'nota']];
    for (const m of A.store.state.movements.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([m.date, m.type, m.amount, m.categoryId ? A.store.catLabel(m.categoryId) : '', A.store.account(m.accountId)?.name || '',
        A.store.account(m.toAccountId)?.name || '', A.store.goal(m.goalId)?.name || '', m.recurringId ? (A.store.recurring(m.recurringId)?.name || 'sí') : '', m.note || '']);
    }
    download(`alcancia-movimientos-${A.u.todayKey()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
  }

  async function importFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.movements)) throw new Error('formato');
      const ok = await A.ui.confirm(`Esto reemplaza TODOS tus datos actuales por los del archivo (${data.accounts.length} cuentas, ${data.movements.length} movimientos). Te recomiendo exportar primero.`, { okLabel: 'Reemplazar' });
      if (!ok) return;
      A.store.replaceAll(data);
      A.ui.toast('Datos importados.', 'success');
    } catch {
      A.ui.toast('Ese archivo no parece una exportación de Alcancía.', 'error');
    }
  }

  return { render, exportData, exportCsv };
})();
