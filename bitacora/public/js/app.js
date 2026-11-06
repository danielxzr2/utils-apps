/* Arranque, navegación, acciones globales y el "tic" de cada segundo. */
window.B = window.B || {};

B.app = (() => {
  const ROUTES = {
    reloj: { title: 'Reloj', view: () => B.views.timer },
    habitos: { title: 'Hábitos', view: () => B.views.habits },
    areas: { title: 'Áreas y tareas', view: () => B.views.areas },
    reportes: { title: 'Reportes', view: () => B.views.reports },
    progreso: { title: 'Progreso', view: () => B.views.progress },
    recompensas: { title: 'Recompensas', view: () => B.views.rewards },
  };
  let route = 'reloj';
  let renderedDay = B.u.dayKey(Date.now());
  const goalsMet = new Set();

  const viewEl = () => document.getElementById('view');

  function currentRoute() {
    const r = location.hash.replace('#', '');
    return ROUTES[r] ? r : 'reloj';
  }

  function render() {
    route = currentRoute();
    renderedDay = B.u.dayKey(Date.now());
    document.querySelectorAll('#nav [data-route]').forEach((a) => a.setAttribute('aria-current', a.dataset.route === route ? 'page' : 'false'));
    renderMiniTimer();
    const scroll = window.scrollY;
    ROUTES[route].view().render(viewEl());
    window.scrollTo(0, scroll);
    tick();
  }

  function renderMiniTimer() {
    const box = document.getElementById('mini-timer');
    const t = B.store.state.activeTimer;
    if (!t) { box.innerHTML = ''; return; }
    const a = B.store.area(t.areaId);
    const paused = !!t.pausedAt;
    box.innerHTML = `
      <a class="mini-timer ${paused ? 'paused' : ''}" href="#reloj" style="--area:${B.store.areaColor(t.areaId)}" data-tip="${paused ? 'Reloj en pausa' : 'Reloj en curso'}">
        ${paused ? '<span class="pause-icon">❚❚</span>' : '<span class="live-dot"></span>'}<span data-live="clock">${B.u.clock(B.timer.elapsed())}</span>
        <span class="mini-area">${B.u.esc(a ? a.name : '')}</span>
      </a>
      <button class="icon-btn" data-action="${paused ? 'resume' : 'pause'}" aria-label="${paused ? 'Reanudar' : 'Pausar'}" data-tip="${paused ? 'Reanudar' : 'Pausar (no guarda)'}">${paused ? '▶' : '❚❚'}</button>
      <button class="icon-btn mini-stop" data-action="stop" aria-label="Detener reloj" data-tip="Detener y guardar">■</button>`;
  }

  function tick() {
    const state = B.store.state;
    if (B.u.dayKey(Date.now()) !== renderedDay && !document.querySelector('.modal')) return render();
    const t = state.activeTimer;
    const el = B.timer.elapsed();
    document.querySelectorAll('[data-live=clock]').forEach((x) => { x.textContent = B.u.clock(el); });
    if (t) {
      const a = B.store.area(t.areaId);
      document.title = `${t.pausedAt ? '❚❚' : '▶'} ${B.u.clock(el)} · ${a ? a.name : ''}`;
      if (t.pausedAt) document.querySelectorAll('[data-live=pause-dur]').forEach((x) => { x.textContent = B.u.durCompact(Date.now() - t.pausedAt); });
      document.querySelectorAll('[data-live=running-dur]').forEach((x) => { x.textContent = B.u.durCompact(el); });
      const today = document.querySelector('[data-live=today]');
      if (today) { const d0 = B.u.startOfDay(Date.now()); today.textContent = B.u.dur(B.stats.total(state, d0, B.u.addDays(d0, 1))); }
      B.widgets.tickGoals(state);
      if (B.rewards.evaluate()) return; // ganaste algo: ya se volvió a pintar
      B.views.rewards.tick(state);
    } else {
      document.title = 'Bitácora';
    }
    checkGoals(false);
  }

  /** Avisa cuando una meta se cumple por primera vez en su período. */
  function checkGoals(silent) {
    const state = B.store.state;
    for (const g of state.goals) {
      const p = B.stats.goalProgress(state, g);
      const key = `${g.id}:${p.periodKey}`;
      if (p.met && !goalsMet.has(key)) {
        goalsMet.add(key);
        if (!silent) B.ui.toast(`🎯 ¡Meta cumplida! ${B.stats.goalLabel(state, g)}: ${B.u.durCompact(p.target)}`, 'success', 6000);
      }
    }
  }

  function applyTheme() {
    const th = B.store.state.settings.theme;
    if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
    else delete document.documentElement.dataset.theme;
  }

  function toggleTheme() {
    const isDark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    B.store.update((s) => { s.settings.theme = isDark ? 'light' : 'dark'; });
    applyTheme();
  }

  // --- Acciones (delegación de eventos con data-action) ---
  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const ds = el.dataset;
    if (el.tagName === 'A') e.preventDefault();

    // Primero, acciones propias de la vista actual.
    const view = ROUTES[route].view();
    if (view.handle && view.handle(action, ds)) { render(); return; }

    const S = B.store.state;
    switch (action) {
      case 'go': location.hash = ds.route; break;
      case 'go-area': B.views.areas.select(ds.id); location.hash = 'areas'; break;
      case 'start': B.views.timer.startSelected(); break;
      case 'stop': B.timer.stop(); break;
      case 'pause': B.timer.pause(); break;
      case 'resume': B.timer.resume(); break;
      case 'discard': B.timer.discard(); break;
      case 'start-task': {
        const t = B.store.task(ds.id);
        if (t) { B.views.timer.select(t.areaId, t.id); B.timer.start(t.areaId, t.id); }
        break;
      }
      case 'start-area': B.views.timer.select(ds.id, null); B.timer.start(ds.id, null); break;
      case 'expand-task': B.widgets.toggleExpanded(ds.id); render(); break;
      case 'toggle-task': B.forms.toggleTask(ds.id); break;
      case 'new-category': B.forms.category(null); break;
      case 'edit-category': B.forms.category(B.store.category(ds.id)); break;
      case 'new-area': B.forms.area(null, { categoryId: ds.cat || null, onCreated: (id) => { B.views.areas.select(id); B.views.timer.select(id); render(); } }); break;
      case 'edit-area': B.forms.area(B.store.area(ds.id)); break;
      case 'new-task': {
        const areaId = ds.area || (route === 'areas' && B.views.areas.selected !== 'all' ? B.views.areas.selected : null);
        B.forms.task(null, { areaId });
        break;
      }
      case 'edit-task': B.forms.task(B.store.task(ds.id)); break;
      case 'new-session': B.forms.session(null, { areaId: ds.area || null }); break;
      case 'edit-session': B.forms.session(S.sessions.find((x) => x.id === ds.id)); break;
      case 'new-goal': B.forms.goal(null); break;
      case 'edit-goal': B.forms.goal(S.goals.find((x) => x.id === ds.id)); break;
      case 'export': B.views.progress.exportData(); break;
      case 'theme': toggleTheme(); break;
      default: break;
    }
  }

  function onKey(e) {
    if (e.code !== 'Space' || e.repeat) return;
    if (document.querySelector('.modal')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button', 'summary', 'a'].includes(tag) || e.target.isContentEditable) return;
    if (route !== 'reloj') return;
    e.preventDefault();
    if (B.timer.active()) B.timer.togglePause(); else B.views.timer.startSelected();
  }

  async function init() {
    await B.store.load();
    applyTheme();
    if (B.store.mode !== 'server') {
      document.getElementById('banner').innerHTML = `<div class="banner">⚠️ Modo local: los datos se guardan solo en este navegador. Para guardarlos en <code>data/data.json</code>, abre la app con <code>npm start</code>.</div>`;
    }
    checkGoals(true);
    B.ui.initTooltip();
    B.rewards.seedOnce();
    B.migrations.run();
    B.rewards.evaluate();
    // Tras cada cambio se revisan las recompensas; si se ganó algo, evaluate() vuelve a guardar y a pintar.
    B.store.subscribe(() => { if (!B.rewards.evaluate()) render(); });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', render);
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (route === 'reportes') render(); }, 200); });
    render();
    setInterval(tick, 1000);
  }

  return { init, render, applyTheme };
})();

document.addEventListener('DOMContentLoaded', B.app.init);
