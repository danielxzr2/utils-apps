/* Vista "Reloj": iniciar/detener, resumen de hoy, metas y sesiones del día. */
window.B = window.B || {};
B.views = B.views || {};

B.views.timer = (() => {
  const { esc } = B.u;
  const sel = { areaId: null, taskId: '' };

  function ensureSelection(state) {
    if (sel.areaId && B.store.area(sel.areaId)) return;
    const last = state.sessions[state.sessions.length - 1];
    sel.areaId = (last && B.store.area(last.areaId)) ? last.areaId : state.areas[0]?.id || null;
    sel.taskId = '';
  }

  function render(el) {
    const state = B.store.state;
    if (!state.areas.length) {
      el.innerHTML = `
        <div class="empty card">
          <h2>Empieza creando un área</h2>
          <p>Un área es algo que estudias o practicas (Portugués, Piano…). Puedes agruparlas en categorías.</p>
          <button class="btn btn-primary" data-action="new-area">+ Nueva área</button>
        </div>`;
      return;
    }
    ensureSelection(state);
    const t = state.activeTimer;
    const running = !!t;
    const paused = running && !!t.pausedAt;
    const pauses = running ? B.timer.pauseCount(t) : 0;
    const areaId = running ? t.areaId : sel.areaId;
    const taskId = running ? t.taskId : sel.taskId;
    const today0 = B.u.startOfDay(Date.now());
    const todayMs = B.stats.total(state, today0, B.u.addDays(today0, 1));
    const todaySessions = B.stats.displaySessions(state)
      .filter((s) => B.stats.overlap(s, today0, B.u.addDays(today0, 1)) > 0)
      .sort((a, b) => b.start - a.start);

    const timeByTask = B.stats.timeByTask(state);
    const pending = state.tasks.filter((x) => x.areaId === areaId && !x.done).sort(B.ui.taskSort('prioridad'));

    el.innerHTML = `
      <div class="timer-layout">
        <section class="card timer-card ${running ? 'is-running' : ''} ${paused ? 'is-paused' : ''}" style="--area:${B.store.areaColor(areaId)}">
          <div class="timer-selects">
            <label class="field"><span>Área</span>
              <select data-sel="area" ${running ? 'disabled' : ''}>${B.ui.areaOptions(areaId)}</select></label>
            <label class="field"><span>Tarea <em>(opcional)</em></span>
              <select data-sel="task" ${running ? 'disabled' : ''}>${B.ui.taskOptions(areaId, taskId)}</select></label>
          </div>
          <div class="clock-wrap">
            <div class="clock" data-live="clock" aria-live="off">${B.u.clock(B.timer.elapsed())}</div>
            <div class="clock-context">
              ${running
                ? `${B.ui.breadcrumb(t.areaId, t.taskId)} <span class="muted">· desde las ${B.u.fmtTime(B.timer.firstStart(t))}</span>
                   ${paused ? `<div class="paused-note">❚❚ En pausa desde las ${B.u.fmtTime(t.pausedAt)} · <span data-live="pause-dur">${B.u.durCompact(Date.now() - t.pausedAt)}</span> (no cuenta)</div>`
                     : pauses ? `<div class="muted small">${B.u.plural(pauses, 'pausa', 'pausas')} hasta ahora</div>` : ''}`
                : `<span class="muted">${esc(B.store.areaCategory(areaId)?.name || 'Sin categoría')}</span>`}
            </div>
          </div>
          <input class="note-input" data-sel="note" maxlength="200" placeholder="Nota de la sesión (opcional): ¿en qué vas a trabajar?" value="${esc(running ? t.note : sel.note || '')}">
          <div class="timer-actions">
            ${running
              ? `${paused
                    ? '<button class="btn btn-primary btn-xl" data-action="resume">▶ Reanudar</button>'
                    : '<button class="btn btn-ghost btn-xl btn-pause" data-action="pause">❚❚ Pausar</button>'}
                 <button class="btn btn-stop btn-lg" data-action="stop">■ Detener y guardar</button>
                 <button class="btn btn-ghost" data-action="discard">Descartar</button>`
              : `<button class="btn btn-primary btn-xl" data-action="start">▶ Iniciar</button>`}
          </div>
          <p class="muted small center">Atajo: barra espaciadora para iniciar, pausar o reanudar. Pausar no guarda la sesión; «Detener y guardar» sí.</p>
        </section>

        <aside class="side-col">
          <section class="card">
            <div class="today-total">
              <span class="muted">Hoy llevas</span>
              <strong data-live="today">${B.u.dur(todayMs)}</strong>
            </div>
            ${B.widgets.streakCard(state)}
            ${B.widgets.levelCard(state)}
          </section>
          <section class="card">
            <header class="card-head"><h3>Metas</h3><button class="link" data-action="go" data-route="progreso">Gestionar</button></header>
            ${B.widgets.goalsList(state)}
          </section>
          ${B.views.habits.summaryCard(state)}
          ${B.views.rewards.summaryCard(state)}
        </aside>
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head">
            <h3>Pendientes en ${esc(B.store.area(areaId)?.name || '')}</h3>
            <button class="link" data-action="new-task" data-area="${areaId}">+ Tarea</button>
          </header>
          ${pending.length
            ? `<ul class="task-list">${pending.slice(0, 8).map((x) => B.widgets.taskRow(x, { timeMs: timeByTask.get(x.id) })).join('')}</ul>
               ${pending.length > 8 ? `<button class="link" data-action="go-area" data-id="${areaId}">Ver las ${pending.length}</button>` : ''}`
            : '<p class="empty-small">No hay tareas pendientes en esta área.</p>'}
        </section>
        <section class="card">
          <header class="card-head">
            <h3>Sesiones de hoy</h3>
            <button class="link" data-action="new-session" data-area="${areaId}">+ Añadir manual</button>
          </header>
          ${todaySessions.length
            ? `<ul class="session-list">${todaySessions.map((s) => B.widgets.sessionRow(s)).join('')}</ul>`
            : '<p class="empty-small">Todavía no hay sesiones hoy.</p>'}
        </section>
      </div>`;

    el.querySelector('[data-sel=area]')?.addEventListener('change', (e) => { sel.areaId = e.target.value; sel.taskId = ''; B.app.render(); });
    el.querySelector('[data-sel=task]')?.addEventListener('change', (e) => { sel.taskId = e.target.value; });
    const note = el.querySelector('[data-sel=note]');
    note.addEventListener('change', (e) => { if (B.timer.active()) B.timer.setNote(e.target.value.trim()); else sel.note = e.target.value; });
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); if (!B.timer.active()) startSelected(); } });
  }

  function startSelected() {
    const note = document.querySelector('[data-sel=note]')?.value.trim() || sel.note || '';
    B.timer.start(sel.areaId, sel.taskId || null, note);
    sel.note = '';
  }

  /** Para que el botón ▶ de una tarea deje seleccionada esa área/tarea. */
  function select(areaId, taskId) { sel.areaId = areaId; sel.taskId = taskId || ''; }

  return { render, startSelected, select };
})();
