/* Vista "Progreso": nivel, racha, metas, mapa de calor, logros, ajustes y datos. */
window.B = window.B || {};
B.views = B.views || {};

B.views.progress = (() => {
  const { esc } = B.u;

  function render(el) {
    const state = B.store.state;
    const totalMs = B.stats.total(state, 0, Infinity);
    const ach = B.stats.achievements(state);
    const unlocked = ach.filter((x) => x.unlocked).length;
    const dayTotals = B.stats.dayTotals(state);
    const st = B.stats.streaks(state);

    el.innerHTML = `
      <div class="grid-3">
        <section class="card">${B.widgets.levelCard(state)}
          <p class="muted small xp-help">Ganas 1 XP por minuto estudiado y ${B.stats.TASK_XP.alta}/${B.stats.TASK_XP.media}/${B.stats.TASK_XP.baja} XP por tarea completada (prioridad alta/media/baja).</p>
        </section>
        <section class="card">${B.widgets.streakCard(state)}
          <p class="muted small">Un día cuenta para la racha si estudias al menos <b>${st.minMinutes} min</b>. Puedes cambiarlo abajo.</p>
        </section>
        <section class="card total-card">
          <span class="stat-label">Tiempo total registrado</span>
          <span class="tile-value">${B.u.dur(totalMs)}</span>
          <span class="muted small">${B.u.plural(state.sessions.length, 'sesión', 'sesiones')} · ${B.u.plural(state.tasks.filter((t) => t.done).length, 'tarea completada', 'tareas completadas')}</span>
        </section>
      </div>

      <section class="card">
        <header class="card-head"><h3>Metas</h3><button class="btn btn-primary btn-sm" data-action="new-goal">+ Nueva meta</button></header>
        <div class="goals-grid">${B.widgets.goalsList(state, { editable: true })}</div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Constancia</h3><span class="muted small">Últimas 20 semanas</span></header>
        <div id="heatmap"></div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Logros</h3><span class="muted small">${unlocked} de ${ach.length}</span></header>
        <div class="achievements">
          ${ach.map((x) => `
            <div class="ach ${x.unlocked ? 'unlocked' : 'locked'}" ${x.unlocked ? '' : 'aria-label="Bloqueado"'}>
              <div class="ach-icon" aria-hidden="true">${x.unlocked ? x.icon : '🔒'}</div>
              <div><div class="ach-name">${esc(x.name)}</div><div class="muted small">${esc(x.desc)}</div></div>
            </div>`).join('')}
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Ajustes y datos</h3></header>
        <div class="settings">
          <label class="field inline"><span>Minutos mínimos al día para la racha</span>
            <input type="number" min="1" max="600" value="${state.settings.streakMinMinutes}" data-setting="streakMinMinutes"></label>
          <label class="field inline"><span>Tema</span>
            <select data-setting="theme">
              ${[['auto', 'Automático (sistema)'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<option value="${v}" ${state.settings.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
        </div>
        <div class="data-box">
          <p class="small">${B.store.mode === 'server'
            ? '💾 Los datos se guardan en <code>data/data.json</code> dentro de la carpeta de la app. Súbelo a git para tenerlos en tus otros computadores.'
            : '⚠️ Modo local: los datos están solo en este navegador. Abre la app con <code>npm start</code> para guardarlos en archivo.'}</p>
          <div class="btn-row">
            <button class="btn btn-ghost btn-sm" data-action="export">⬇ Exportar JSON</button>
            <label class="btn btn-ghost btn-sm file-btn">⬆ Importar JSON<input type="file" accept="application/json,.json" data-action-file="import" hidden></label>
          </div>
        </div>
      </section>`;

    B.charts.heatmap(el.querySelector('#heatmap'), dayTotals, 20);

    el.querySelectorAll('[data-setting]').forEach((inp) => inp.addEventListener('change', () => {
      const key = inp.dataset.setting;
      let v = inp.value;
      if (key === 'streakMinMinutes') v = Math.max(1, Math.min(600, Number(v) || 15));
      B.store.update((s) => { s.settings[key] = v; });
      if (key === 'theme') B.app.applyTheme();
    }));
    el.querySelector('[data-action-file=import]').addEventListener('change', importFile);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(B.store.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bitacora-${B.u.dayKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.areas) || !Array.isArray(data.sessions)) throw new Error('formato');
      const ok = await B.ui.confirm(`Esto reemplaza TODOS tus datos actuales por los del archivo (${data.areas.length} áreas, ${data.sessions.length} sesiones). Te recomiendo exportar primero.`, { okLabel: 'Reemplazar' });
      if (!ok) return;
      B.store.replaceAll(data);
      B.ui.toast('Datos importados.', 'success');
    } catch {
      B.ui.toast('Ese archivo no parece una exportación de Bitácora.', 'error');
    }
  }

  return { render, exportData };
})();
