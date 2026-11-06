/*
 * Reloj ascendente con pausa.
 *
 * activeTimer = { areaId, taskId, note,
 *                 start,        ← inicio del tramo actual
 *                 segments: [{ start, end }],   ← tramos ya cerrados por pausas
 *                 pausedAt }    ← null si está corriendo
 *
 * Solo guarda marcas de tiempo, así que sigue bien aunque cierres la pestaña.
 * Al detener, cada tramo se guarda como una sesión (con el mismo groupId), de modo que
 * el tiempo en pausa nunca cuenta en los reportes.
 */
window.B = window.B || {};

B.timer = (() => {
  const MIN_SESSION_MS = 5000; // sesiones de menos de 5 s se descartan (clics accidentales)
  const MIN_SEGMENT_MS = 1000;

  const active = () => B.store.state.activeTimer;
  const isPaused = () => !!active()?.pausedAt;

  /** Tramos del reloj actual, incluido el que está corriendo (hasta `now`). */
  function segments(t = active(), now = Date.now()) {
    if (!t) return [];
    const list = (t.segments || []).slice();
    if (!t.pausedAt) list.push({ start: t.start, end: now });
    return list;
  }
  const elapsed = () => segments().reduce((a, s) => a + (s.end - s.start), 0);
  const firstStart = (t = active()) => (t?.segments?.length ? t.segments[0].start : t?.start);
  const pauseCount = (t = active()) => (t?.segments || []).length;

  function start(areaId, taskId = null, note = '') {
    if (!areaId) { B.ui.toast('Elige un área para empezar.', 'error'); return; }
    if (active()) stop({ quiet: true });
    B.store.update((s) => { s.activeTimer = { areaId, taskId: taskId || null, start: Date.now(), note: note || '', segments: [], pausedAt: null }; });
  }

  function pause() {
    const t = active();
    if (!t || t.pausedAt) return;
    const now = Date.now();
    B.store.update((s) => {
      const a = s.activeTimer;
      a.segments = (a.segments || []).concat(now - a.start >= MIN_SEGMENT_MS ? [{ start: a.start, end: now }] : []);
      a.pausedAt = now;
    });
  }

  function resume() {
    const t = active();
    if (!t || !t.pausedAt) return;
    B.store.update((s) => { s.activeTimer.pausedAt = null; s.activeTimer.start = Date.now(); });
  }

  function togglePause() { if (isPaused()) resume(); else pause(); }

  function stop({ quiet = false } = {}) {
    const t = active();
    if (!t) return;
    const segs = segments(t).filter((x) => x.end - x.start >= MIN_SEGMENT_MS);
    const ms = segs.reduce((a, x) => a + (x.end - x.start), 0);
    const keep = ms >= MIN_SESSION_MS;
    const groupId = segs.length > 1 ? B.u.uid() : null;
    B.store.update((s) => {
      if (keep) {
        for (const x of segs) {
          s.sessions.push({ id: B.u.uid(), areaId: t.areaId, taskId: t.taskId, start: x.start, end: x.end, note: t.note || '', ...(groupId ? { groupId } : {}) });
        }
      }
      s.activeTimer = null;
    });
    const area = B.store.area(t.areaId);
    if (!keep) { if (!quiet) B.ui.toast('Sesión muy corta: no se guardó.'); return; }
    const pauses = segs.length - 1;
    B.ui.toast(`Sesión guardada: ${B.u.dur(ms)} en ${area ? area.name : 'el área'}${pauses > 0 ? ` (${B.u.plural(pauses, 'pausa', 'pausas')})` : ''} · +${Math.floor(ms / 6e4)} XP`, 'success');
  }

  async function discard() {
    if (!active()) return;
    if (!(await B.ui.confirm(`Se descartarán ${B.u.dur(elapsed())} sin guardarlos.`, { okLabel: 'Descartar' }))) return;
    B.store.update((s) => { s.activeTimer = null; });
  }

  function setNote(note) {
    if (!active()) return;
    B.store.update((s) => { s.activeTimer.note = note; });
  }

  return { active, isPaused, segments, elapsed, firstStart, pauseCount, start, pause, resume, togglePause, stop, discard, setNote };
})();
