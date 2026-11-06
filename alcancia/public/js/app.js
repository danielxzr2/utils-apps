/* Arranque, navegación, acciones globales, atajos de teclado y celebraciones. */
window.A = window.A || {};

A.app = (() => {
  const ROUTES = {
    inicio: { title: 'Inicio', view: () => A.views.inicio },
    movimientos: { title: 'Movimientos', view: () => A.views.movimientos },
    presupuesto: { title: 'Presupuesto', view: () => A.views.presupuesto },
    metas: { title: 'Metas', view: () => A.views.metas },
    cuentas: { title: 'Cuentas y deudas', view: () => A.views.cuentas },
    reportes: { title: 'Reportes', view: () => A.views.reportes },
    progreso: { title: 'Progreso', view: () => A.views.progreso },
  };
  let route = 'inicio';
  let renderedDay = A.u.todayKey();

  const viewEl = () => document.getElementById('view');
  function currentRoute() { const r = location.hash.replace('#', ''); return ROUTES[r] ? r : 'inicio'; }

  function render() {
    route = currentRoute();
    renderedDay = A.u.todayKey();
    document.querySelectorAll('#nav [data-route]').forEach((a) => a.setAttribute('aria-current', a.dataset.route === route ? 'page' : 'false'));
    renderTopStats();
    const scroll = window.scrollY;
    ROUTES[route].view().render(viewEl());
    A.ui.initMoneyInputs(viewEl());
    document.title = `${ROUTES[route].title} · Alcancía`;
    window.scrollTo(0, scroll);
  }

  function renderTopStats() {
    const state = A.store.state;
    const lv = A.stats.level(state);
    const s = A.stats.streaks(state);
    document.getElementById('top-stats').innerHTML = `
      <a href="#progreso" class="top-pill" data-tip="Racha de días registrando"><span class="${s.current ? '' : 'dim'}">🔥</span> ${s.current}</a>
      <a href="#progreso" class="top-pill" data-tip="${lv.into} / ${lv.needed} XP para el nivel ${lv.level + 1}"><b>Nv ${lv.level}</b> <span class="top-xp"><span style="width:${(lv.pct * 100).toFixed(0)}%"></span></span></a>`;
  }

  /** Compara el antes y el después de un cambio para avisar logros, hitos y límites. */
  function celebrate(before, after) {
    if (!before || !after) return;
    const state = A.store.state;
    setTimeout(() => {
      if (after.level > before.level) A.ui.toast(`⭐ ¡Subiste al nivel ${after.level}: ${A.stats.levelTitle(after.level)}!`, 'success', 6000);
      for (const id of after.ach) {
        if (!before.ach.has(id)) {
          const a = A.stats.achievements(state).find((x) => x.id === id);
          if (a) A.ui.toast(`${a.icon} Logro desbloqueado: ${a.name}`, 'success', 6000);
        }
      }
      for (const [id, pct] of after.goals) {
        const prev = before.goals.get(id);
        if (prev == null) continue;
        const g = A.store.goal(id);
        for (const m of [1, 0.75, 0.5, 0.25]) {
          if (prev < m && pct >= m) {
            A.ui.toast(m === 1 ? `🎉 ¡${g.name} completa! Ya tienes todo el dinero.` : `${g.emoji || '🎯'} ${g.name}: ¡vas en el ${m * 100} %!`, 'success', 6000);
            break;
          }
        }
      }
      if (before.P === after.P) {
        for (const [id, r] of after.cats) {
          const prev = before.cats.get(id) ?? 0;
          const c = A.store.category(id);
          if (!c) continue;
          if (prev <= 1 && r > 1) A.ui.toast(`✕ Te pasaste del límite de ${c.name} este periodo.`, 'error', 6000);
          else if (prev < 0.75 && r >= 0.75) A.ui.toast(`▲ Ojo: llevas el ${Math.round(r * 100)} % del límite de ${c.name}.`, 'warn', 6000);
        }
      }
    }, 350);
  }

  function applyTheme() {
    const th = A.store.state.settings.theme;
    if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
    else delete document.documentElement.dataset.theme;
  }
  function toggleTheme() {
    const isDark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    A.store.update((s) => { s.settings.theme = isDark ? 'light' : 'dark'; });
    applyTheme();
  }

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.tagName === 'INPUT') return;
    const action = el.dataset.action;
    const ds = el.dataset;
    if (el.tagName === 'A') e.preventDefault();
    const view = ROUTES[route].view();
    if (view.handle && view.handle(action, ds)) { render(); return; }
    const S = A.store.state;
    const F = A.forms;
    switch (action) {
      case 'go': location.hash = ds.route; break;
      case 'new-movement': F.movement(null, { type: ds.type || 'gasto' }); break;
      case 'edit-movement': F.movement(S.movements.find((m) => m.id === ds.id)); break;
      case 'contribute': F.movement(null, { type: 'aporte', goalId: ds.id }); break;
      case 'withdraw': F.movement(null, { type: 'aporte', goalId: ds.id, dir: 'out' }); break;
      case 'new-goal': F.goal(null, ds.kind ? { kind: ds.kind, name: ds.kind === 'emergencia' ? 'Fondo de emergencia' : '', emoji: ds.kind === 'emergencia' ? '🛟' : '🎯' } : {}); break;
      case 'edit-goal': F.goal(A.store.goal(ds.id)); break;
      case 'complete-goal': F.completeGoal(A.store.goal(ds.id)); break;
      case 'new-account': F.account(null); if (ds.type) { const sel = document.querySelector('.modal [name=type]'); sel.value = ds.type; sel.dispatchEvent(new Event('change')); } break;
      case 'edit-account': F.account(A.store.account(ds.id)); break;
      case 'pay-debt': F.payDebt(A.store.account(ds.id)); break;
      case 'new-category': F.category(null, { kind: ds.kind || 'gasto' }); break;
      case 'new-subcategory': { const p = A.store.category(ds.id); F.category(null, { kind: p.kind, parentId: p.id }); break; }
      case 'edit-category': F.category(A.store.category(ds.id)); break;
      case 'new-recurring': F.recurring(null); break;
      case 'edit-recurring': F.recurring(A.store.recurring(ds.id)); break;
      case 'pay-fixed': F.payRecurring(A.store.recurring(ds.id), ds.due); break;
      case 'show-setup': A.store.update((s) => { s.settings.setupDismissed = false; }); location.hash = 'inicio'; break;
      case 'export': A.views.progreso.exportData(); break;
      case 'export-csv': A.views.progreso.exportCsv(); break;
      case 'theme': toggleTheme(); break;
      default: break;
    }
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (document.querySelector('.modal')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    const map = { g: 'gasto', i: 'ingreso', t: 'transferencia', a: 'aporte' };
    const type = map[e.key.toLowerCase()];
    if (!type) return;
    e.preventDefault();
    A.forms.movement(null, { type });
  }

  async function init() {
    await A.store.load();
    applyTheme();
    if (A.store.mode !== 'server') {
      document.getElementById('banner').innerHTML = '<div class="banner">⚠️ Modo local: los datos se guardan solo en este navegador. Para guardarlos en <code>data/data.json</code>, abre la app con <code>npm start</code>.</div>';
    }
    A.ui.initTooltip();
    A.store.subscribe(render);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', render);
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (route === 'reportes') render(); }, 200); });
    // Si la página queda abierta de un día para otro, se refresca al cambiar la fecha.
    setInterval(() => { if (A.u.todayKey() !== renderedDay && !document.querySelector('.modal')) render(); }, 60000);
    render();
  }

  return { init, render, applyTheme, celebrate };
})();

document.addEventListener('DOMContentLoaded', A.app.init);
