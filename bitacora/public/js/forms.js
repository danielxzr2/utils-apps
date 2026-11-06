/* Formularios para crear/editar categorías, áreas, tareas, sesiones y metas. */
window.B = window.B || {};

B.forms = (() => {
  const { esc, uid } = B.u;
  const S = () => B.store.state;

  function colorPicker(selected) {
    return `<div class="swatches" role="radiogroup" aria-label="Color">
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `
        <label class="swatch" style="--sw:var(--c${i})">
          <input type="radio" name="color" value="${i}" ${i === selected ? 'checked' : ''}>
          <span></span>
        </label>`).join('')}
    </div>`;
  }

  function nextColor() {
    const used = S().categories.map((c) => c.color);
    for (let i = 0; i < 8; i++) if (!used.includes(i)) return i;
    return S().categories.length % 8;
  }

  // --- Categoría ---
  function category(cat) {
    const isNew = !cat;
    B.ui.modal({
      title: isNew ? 'Nueva categoría' : 'Editar categoría',
      body: `
        <label class="field"><span>Nombre</span><input name="name" maxlength="60" value="${esc(cat?.name)}" placeholder="Ej. Idiomas"></label>
        <div class="field"><span>Color</span>${colorPicker(cat ? cat.color : nextColor())}</div>
        <p class="hint">Las áreas de esta categoría usan este color en los reportes.</p>`,
      onSubmit: (d, form) => {
        const name = d.name.trim();
        if (!name) return B.ui.fieldError(form, 'name', 'Ponle un nombre.');
        B.store.update((s) => {
          if (isNew) s.categories.push({ id: uid(), name, color: Number(d.color) || 0 });
          else Object.assign(s.categories.find((c) => c.id === cat.id), { name, color: Number(d.color) || 0 });
        });
      },
      onDelete: isNew ? null : async () => {
        const n = S().areas.filter((a) => a.categoryId === cat.id).length;
        const ok = await B.ui.confirm(`Se eliminará la categoría "${cat.name}".${n ? ` Sus ${n} áreas quedarán sin categoría (no se borra ningún tiempo).` : ''}`);
        if (!ok) return false;
        B.store.update((s) => {
          s.categories = s.categories.filter((c) => c.id !== cat.id);
          s.areas.forEach((a) => { if (a.categoryId === cat.id) a.categoryId = null; });
          s.goals = s.goals.filter((g) => !(g.scope === 'category' && g.targetId === cat.id));
          for (const x of [...s.goals, ...s.rewardRules]) if (Array.isArray(x.targetIds)) x.targetIds = x.targetIds.filter((id) => id !== cat.id);
        });
      },
    });
  }

  // --- Área ---
  function area(ar, { categoryId = null, onCreated } = {}) {
    const isNew = !ar;
    B.ui.modal({
      title: isNew ? 'Nueva área' : 'Editar área',
      body: `
        <label class="field"><span>Nombre</span><input name="name" maxlength="80" value="${esc(ar?.name)}" placeholder="Ej. Portugués"></label>
        <label class="field"><span>Categoría</span><select name="categoryId">${B.ui.categoryOptions(ar ? ar.categoryId : categoryId)}</select></label>`,
      onSubmit: (d, form) => {
        const name = d.name.trim();
        if (!name) return B.ui.fieldError(form, 'name', 'Ponle un nombre.');
        let id = ar?.id;
        B.store.update((s) => {
          if (isNew) { id = uid(); s.areas.push({ id, name, categoryId: d.categoryId || null, createdAt: Date.now() }); }
          else Object.assign(s.areas.find((a) => a.id === ar.id), { name, categoryId: d.categoryId || null });
        });
        if (isNew && onCreated) onCreated(id);
      },
      onDelete: isNew ? null : async () => {
        const nT = S().tasks.filter((t) => t.areaId === ar.id).length;
        const nS = S().sessions.filter((x) => x.areaId === ar.id).length;
        const running = S().activeTimer?.areaId === ar.id;
        if (running) { B.ui.toast('Detén el reloj de esta área antes de borrarla.', 'error'); return false; }
        const ok = await B.ui.confirm(`Se eliminará "${ar.name}" junto con ${B.u.plural(nT, 'tarea', 'tareas')} y ${B.u.plural(nS, 'sesión', 'sesiones')} de tiempo registrado. Esto no se puede deshacer.`);
        if (!ok) return false;
        B.store.update((s) => {
          s.areas = s.areas.filter((a) => a.id !== ar.id);
          s.tasks = s.tasks.filter((t) => t.areaId !== ar.id);
          s.sessions = s.sessions.filter((x) => x.areaId !== ar.id);
          s.goals = s.goals.filter((g) => !(g.scope === 'area' && g.targetId === ar.id));
        });
      },
    });
  }

  // --- Tarea ---
  function task(t, { areaId = null } = {}) {
    const isNew = !t;
    if (!S().areas.length) { B.ui.toast('Primero crea un área.', 'error'); return; }
    const pr = t?.priority || 'media';
    B.ui.modal({
      title: isNew ? 'Nueva tarea' : 'Editar tarea',
      wide: true,
      body: `
        <label class="field"><span>Título</span><input name="title" maxlength="140" value="${esc(t?.title)}" placeholder="Ej. Repasar verbos irregulares"></label>
        <div class="field-row">
          <label class="field"><span>Área</span><select name="areaId">${B.ui.areaOptions(t ? t.areaId : areaId || S().areas[0].id)}</select></label>
          <label class="field"><span>Fecha límite</span><input type="date" name="dueDate" value="${esc(t?.dueDate || '')}"></label>
        </div>
        <div class="field"><span>Prioridad</span>
          <div class="segmented">
            ${['alta', 'media', 'baja'].map((p) => `<label><input type="radio" name="priority" value="${p}" ${p === pr ? 'checked' : ''}><span class="prio-${p}">${p[0].toUpperCase() + p.slice(1)}</span></label>`).join('')}
          </div>
        </div>
        <label class="field"><span>Descripción <em>(opcional)</em></span><textarea name="description" rows="5" placeholder="Notas, enlaces, pasos…">${esc(t?.description)}</textarea></label>
        ${t?.done ? `<label class="check-line"><input type="checkbox" name="done" checked> Completada</label>` : ''}`,
      onSubmit: (d, form) => {
        const title = d.title.trim();
        if (!title) return B.ui.fieldError(form, 'title', 'Escribe un título.');
        B.store.update((s) => {
          const fields = { title, areaId: d.areaId, priority: d.priority || 'media', dueDate: d.dueDate || null, description: d.description.trim() };
          if (isNew) s.tasks.push({ id: uid(), ...fields, done: false, createdAt: Date.now(), completedAt: null });
          else {
            const x = s.tasks.find((y) => y.id === t.id);
            Object.assign(x, fields);
            if (x.done && !d.done) { x.done = false; x.completedAt = null; }
            if (fields.areaId !== t.areaId) s.sessions.forEach((ss) => { if (ss.taskId === t.id) ss.areaId = fields.areaId; });
          }
        });
      },
      onDelete: isNew ? null : async () => {
        if (S().activeTimer?.taskId === t.id) { B.ui.toast('Detén el reloj de esta tarea antes de borrarla.', 'error'); return false; }
        const nS = S().sessions.filter((x) => x.taskId === t.id).length;
        const ok = await B.ui.confirm(`Se eliminará la tarea "${t.title}".${nS ? ` Sus ${B.u.plural(nS, 'sesión', 'sesiones')} se conservan en el área, sin tarea.` : ''}`);
        if (!ok) return false;
        B.store.update((s) => {
          s.tasks = s.tasks.filter((x) => x.id !== t.id);
          s.sessions.forEach((x) => { if (x.taskId === t.id) x.taskId = null; });
        });
      },
    });
  }

  function toggleTask(id) {
    let nowDone = false, prio = 'media';
    B.store.update((s) => {
      const t = s.tasks.find((x) => x.id === id);
      t.done = !t.done;
      t.completedAt = t.done ? Date.now() : null;
      nowDone = t.done; prio = t.priority;
    });
    if (nowDone) B.ui.toast(`✅ Tarea completada · +${B.stats.TASK_XP[prio] || 10} XP`, 'success');
  }

  // --- Sesión (manual o edición) ---
  function session(sess, defaults = {}) {
    const isNew = !sess;
    if (!S().areas.length) { B.ui.toast('Primero crea un área.', 'error'); return; }
    const now = Date.now();
    const start = sess ? sess.start : defaults.start ?? now - 3600e3;
    const end = sess ? sess.end : defaults.end ?? now;
    const areaId = sess ? sess.areaId : defaults.areaId || S().areas[0].id;
    B.ui.modal({
      title: isNew ? 'Añadir sesión manual' : 'Editar sesión',
      wide: true,
      body: `
        <div class="field-row">
          <label class="field"><span>Área</span><select name="areaId">${B.ui.areaOptions(areaId)}</select></label>
          <label class="field"><span>Tarea</span><select name="taskId">${B.ui.taskOptions(areaId, sess?.taskId || defaults.taskId || '', { pendingOnly: false })}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Inicio</span><input type="datetime-local" name="start" value="${B.u.toInputDateTime(start)}"></label>
          <label class="field"><span>Fin</span><input type="datetime-local" name="end" value="${B.u.toInputDateTime(end)}"></label>
        </div>
        <p class="hint" data-dur></p>
        <label class="field"><span>Nota <em>(opcional)</em></span><input name="note" maxlength="200" value="${esc(sess?.note)}" placeholder="¿Qué hiciste?"></label>`,
      onMount: (form) => {
        const areaSel = form.areaId, durEl = form.querySelector('[data-dur]');
        areaSel.addEventListener('change', () => { form.taskId.innerHTML = B.ui.taskOptions(areaSel.value, '', { pendingOnly: false }); });
        const upd = () => {
          const a = B.u.fromInputDateTime(form.start.value), b = B.u.fromInputDateTime(form.end.value);
          durEl.textContent = b > a ? `Duración: ${B.u.dur(b - a)}` : '';
        };
        form.start.addEventListener('input', upd); form.end.addEventListener('input', upd); upd();
      },
      onSubmit: (d, form) => {
        const a = B.u.fromInputDateTime(d.start), b = B.u.fromInputDateTime(d.end);
        if (!(a > 0)) return B.ui.fieldError(form, 'start', 'Fecha de inicio inválida.');
        if (!(b > a)) return B.ui.fieldError(form, 'end', 'El fin debe ser después del inicio.');
        if (b > Date.now() + 60e3) return B.ui.fieldError(form, 'end', 'El fin no puede estar en el futuro.');
        B.store.update((s) => {
          const fields = { areaId: d.areaId, taskId: d.taskId || null, start: a, end: b, note: d.note.trim() };
          if (isNew) s.sessions.push({ id: uid(), ...fields });
          else Object.assign(s.sessions.find((x) => x.id === sess.id), fields);
          s.sessions.sort((x, y) => x.start - y.start);
        });
        B.ui.toast(isNew ? 'Sesión añadida.' : 'Sesión actualizada.', 'success');
      },
      onDelete: isNew ? null : async () => {
        const ok = await B.ui.confirm(`Se eliminará esta sesión de ${B.u.dur(sess.end - sess.start)}.`);
        if (!ok) return false;
        B.store.update((s) => { s.sessions = s.sessions.filter((x) => x.id !== sess.id); });
      },
    });
  }

  // --- Meta ---
  function goal(g) {
    const isNew = !g;
    const scope = g?.scope || 'total';
    const targetOptions = (sc, sel) => {
      if (sc === 'category') return B.ui.categoryOptions(sel, { noneLabel: null });
      if (sc === 'area') return B.ui.areaOptions(sel);
      return '';
    };
    const mins = g ? g.minutes : 60;
    B.ui.modal({
      title: isNew ? 'Nueva meta' : 'Editar meta',
      body: `
        <div class="field"><span>¿Sobre qué?</span>
          <div class="segmented">
            ${[['total', 'Todo'], ['categories', 'Varias categorías'], ['category', 'Categoría'], ['area', 'Área']].map(([v, l]) => `<label><input type="radio" name="scope" value="${v}" ${v === scope ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>
        <label class="field" data-target ${scope === 'total' || scope === 'categories' ? 'hidden' : ''}><span>Cuál</span><select name="targetId">${targetOptions(scope, g?.targetId)}</select></label>
        <div class="field" data-cats ${scope === 'categories' ? '' : 'hidden'}><span>Categorías que cuentan</span>
          ${B.ui.categoryChecks(scope === 'categories' ? g.targetIds : S().categories.map((c) => c.id))}</div>
        <div class="field"><span>Período</span>
          <div class="segmented">
            ${[['day', 'Diaria'], ['week', 'Semanal']].map(([v, l]) => `<label><input type="radio" name="period" value="${v}" ${v === (g?.period || 'day') ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>
        <div class="field"><span>Tiempo objetivo</span>
          <div class="inline-inputs">
            <input type="number" name="h" min="0" max="168" value="${Math.floor(mins / 60)}" aria-label="Horas"> <span>h</span>
            <input type="number" name="m" min="0" max="59" step="5" value="${mins % 60}" aria-label="Minutos"> <span>min</span>
          </div>
        </div>`,
      onMount: (form) => {
        const target = form.querySelector('[data-target]');
        const cats = form.querySelector('[data-cats]');
        form.querySelectorAll('[name=scope]').forEach((r) => r.addEventListener('change', () => {
          target.hidden = r.value === 'total' || r.value === 'categories';
          cats.hidden = r.value !== 'categories';
          form.targetId.innerHTML = targetOptions(r.value, null);
        }));
      },
      onSubmit: (d, form) => {
        const minutes = (Number(d.h) || 0) * 60 + (Number(d.m) || 0);
        if (minutes <= 0) return B.ui.fieldError(form, 'h', 'El objetivo debe ser mayor que 0.');
        const targetIds = new FormData(form).getAll('cats');
        if (d.scope === 'categories' && !targetIds.length) return B.ui.fieldError(form, 'cats', 'Marca al menos una categoría.');
        if ((d.scope === 'category' || d.scope === 'area') && !d.targetId) return B.ui.fieldError(form, 'targetId', 'Elige una opción.');
        B.store.update((s) => {
          const fields = {
            scope: d.scope,
            targetId: d.scope === 'category' || d.scope === 'area' ? d.targetId : null,
            targetIds: d.scope === 'categories' ? targetIds : null,
            period: d.period, minutes,
          };
          if (isNew) s.goals.push({ id: uid(), ...fields });
          else Object.assign(s.goals.find((x) => x.id === g.id), fields);
        });
      },
      onDelete: isNew ? null : async () => {
        if (!(await B.ui.confirm('Se eliminará esta meta.'))) return false;
        B.store.update((s) => { s.goals = s.goals.filter((x) => x.id !== g.id); });
      },
    });
  }

  return { category, area, task, toggleTask, session, goal };
})();
