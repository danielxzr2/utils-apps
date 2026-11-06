/* Vista "Áreas y tareas": categorías y áreas a la izquierda, tareas del área a la derecha. */
window.B = window.B || {};
B.views = B.views || {};

B.views.areas = (() => {
  const { esc } = B.u;
  const ui = { sel: 'all', filter: 'pending', sort: 'prioridad' };

  function select(id) { ui.sel = id; }

  function sidebar(state, weekByArea) {
    const item = (a) => `
      <li><button class="side-item ${ui.sel === a.id ? 'active' : ''}" data-action="select-area" data-id="${a.id}">
        ${B.ui.dot(B.store.areaColor(a.id))}<span class="side-name">${esc(a.name)}</span>
        ${state.activeTimer?.areaId === a.id ? '<span class="live-dot" title="Reloj corriendo"></span>' : ''}
        <span class="side-time">${weekByArea.get(a.id) ? B.u.durCompact(weekByArea.get(a.id)) : ''}</span>
      </button></li>`;
    const pendingAll = state.tasks.filter((t) => !t.done).length;
    return `
      <nav class="sidebar card" aria-label="Áreas">
        <button class="side-item side-all ${ui.sel === 'all' ? 'active' : ''}" data-action="select-area" data-id="all">
          <span class="side-name">Todas las tareas</span><span class="side-time">${pendingAll || ''}</span>
        </button>
        <div class="side-caption muted small">Tiempo de esta semana</div>
        ${B.store.groupedAreas().map((g) => `
          <div class="side-group">
            <div class="side-group-head">
              ${g.category ? B.ui.dot(B.store.catColor(g.category)) : ''}
              <span>${esc(g.category ? g.category.name : 'Sin categoría')}</span>
              <span class="spacer"></span>
              <button class="icon-btn sm" data-action="new-area" data-cat="${g.category?.id || ''}" aria-label="Nueva área en ${esc(g.category?.name || 'sin categoría')}" data-tip="Nueva área aquí">+</button>
              ${g.category ? `<button class="icon-btn sm" data-action="edit-category" data-id="${g.category.id}" aria-label="Editar categoría" data-tip="Editar categoría">✎</button>` : ''}
            </div>
            <ul>${g.areas.map(item).join('') || '<li class="muted small side-empty">Sin áreas</li>'}</ul>
          </div>`).join('')}
        <div class="side-foot">
          <button class="btn btn-ghost btn-sm" data-action="new-category">+ Categoría</button>
          <button class="btn btn-ghost btn-sm" data-action="new-area">+ Área</button>
        </div>
      </nav>`;
  }

  function filters() {
    const seg = [['pending', 'Pendientes'], ['done', 'Completadas'], ['all', 'Todas']];
    return `
      <div class="toolbar">
        <div class="segmented" role="tablist">
          ${seg.map(([v, l]) => `<button role="tab" aria-selected="${ui.filter === v}" class="${ui.filter === v ? 'on' : ''}" data-action="task-filter" data-v="${v}">${l}</button>`).join('')}
        </div>
        <label class="sort-sel muted small">Ordenar por
          <select data-action-change="task-sort">
            <option value="prioridad" ${ui.sort === 'prioridad' ? 'selected' : ''}>prioridad</option>
            <option value="fecha" ${ui.sort === 'fecha' ? 'selected' : ''}>fecha límite</option>
          </select>
        </label>
      </div>`;
  }

  function taskList(tasks, timeByTask, { showArea }) {
    const list = tasks
      .filter((t) => (ui.filter === 'all' ? true : ui.filter === 'done' ? t.done : !t.done))
      .sort(B.ui.taskSort(ui.sort));
    if (!list.length) {
      const msg = ui.filter === 'done' ? 'Aún no hay tareas completadas.' : ui.filter === 'pending' ? 'No hay tareas pendientes. 🎉' : 'No hay tareas.';
      return `<p class="empty-small">${msg}</p>`;
    }
    return `<ul class="task-list">${list.map((t) => B.widgets.taskRow(t, { timeMs: timeByTask.get(t.id), showArea })).join('')}</ul>`;
  }

  function render(el) {
    const state = B.store.state;
    if (ui.sel !== 'all' && !B.store.area(ui.sel)) ui.sel = 'all';
    const w0 = B.u.startOfWeek(Date.now());
    const weekByArea = B.stats.sumBy(state, w0, B.u.addDays(w0, 7), (s) => s.areaId);
    const timeByTask = B.stats.timeByTask(state);
    let main;

    if (ui.sel === 'all') {
      main = `
        <section class="card area-main">
          <header class="area-head">
            <div><h2>Todas las tareas</h2><p class="muted">De todas tus áreas.</p></div>
            <div class="area-head-actions"><button class="btn btn-primary" data-action="new-task">+ Nueva tarea</button></div>
          </header>
          ${filters()}
          ${taskList(state.tasks, timeByTask, { showArea: true })}
        </section>`;
    } else {
      const a = B.store.area(ui.sel);
      const c = B.store.areaCategory(a.id);
      const totalMs = B.stats.total(state, 0, Infinity, (s) => s.areaId === a.id);
      const tasks = state.tasks.filter((t) => t.areaId === a.id);
      const recent = B.stats.displaySessions(state).filter((s) => s.areaId === a.id).sort((x, y) => y.start - x.start).slice(0, 8);
      const running = state.activeTimer?.areaId === a.id;
      main = `
        <section class="card area-main" style="--area:${B.store.areaColor(a.id)}">
          <header class="area-head">
            <div>
              <div class="muted small">${c ? `${B.ui.dot(B.store.catColor(c))}${esc(c.name)}` : 'Sin categoría'}</div>
              <h2>${esc(a.name)} <button class="icon-btn" data-action="edit-area" data-id="${a.id}" aria-label="Editar área" data-tip="Editar o borrar área">✎</button></h2>
            </div>
            <div class="area-head-actions">
              ${running
                ? '<button class="btn btn-stop" data-action="stop">■ Detener</button>'
                : `<button class="btn btn-ghost" data-action="start-area" data-id="${a.id}">▶ Iniciar sin tarea</button>`}
              <button class="btn btn-primary" data-action="new-task" data-area="${a.id}">+ Nueva tarea</button>
            </div>
          </header>
          <div class="stat-row">
            <div class="stat"><span class="stat-label">Total invertido</span><span class="stat-value">${B.u.dur(totalMs)}</span></div>
            <div class="stat"><span class="stat-label">Esta semana</span><span class="stat-value">${B.u.dur(weekByArea.get(a.id) || 0)}</span></div>
            <div class="stat"><span class="stat-label">Tareas</span><span class="stat-value">${tasks.filter((t) => t.done).length} / ${tasks.length}</span></div>
          </div>
          ${filters()}
          ${taskList(tasks, timeByTask, { showArea: false })}
          <details class="recent">
            <summary>Últimas sesiones (${recent.length})</summary>
            ${recent.length ? `<ul class="session-list">${recent.map((s) => B.widgets.sessionRow(s, { showDate: true })).join('')}</ul>` : '<p class="empty-small">Sin sesiones todavía.</p>'}
            <button class="link" data-action="new-session" data-area="${a.id}">+ Añadir sesión manual</button>
          </details>
        </section>`;
    }

    el.innerHTML = `<div class="areas-layout">${sidebar(state, weekByArea)}${main}</div>`;
    el.querySelector('[data-action-change=task-sort]')?.addEventListener('change', (e) => { ui.sort = e.target.value; render(el); });
  }

  function handle(action, ds) {
    switch (action) {
      case 'select-area': ui.sel = ds.id; return true;
      case 'task-filter': ui.filter = ds.v; return true;
      default: return false;
    }
  }

  return { render, handle, select, get selected() { return ui.sel; } };
})();
