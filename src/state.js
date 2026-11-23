// Estado de sesión compartido (selección, cámara, pausa, preferencias) y utilidades de página.

// ---------- Estado de sesión ----------
// Lo que cambian a la vez varias partes del juego (interfaz, cámara, partida, menú) vive aquí y no en variables sueltas
export const S = {
  selBld: null, selSpot: null, rally: null, rallyFlag: null, follow: null,   // selección de edificio o pueblo, punto de reunión y unidad seguida por la cámara
  amode: false,   // ataque-mover pendiente (tecla E o botón ATACAR)
  camDist: 64, camGoal: 64, focusGoal: null, zoomAnchor: null,   // zoomAnchor: punto del suelo que debe quedarse bajo el ratón mientras se hace zoom
  VW: innerWidth, VH: innerHeight,
  paused: false, speed: 1, diff: 'easy', wantScen: 'random', soundOn: false,
  bfsBudget: 0,   // campos de búsqueda individuales que se pueden calcular por paso de simulación (evita picos)
  menuDirty: false, pendingStart: false,
  menuOpen: false, pausedBefore: false,
  aiPlayer: null, aiRival: null,   // solo pruebas: { diff, brain } para que la IA juegue tu bando; cerebro forzado para el rival   // menú de pausa abierto y si la partida ya estaba en pausa al abrirlo
};
// preferencias guardadas en el navegador
try { S.wantScen = localStorage.getItem('imperium-geo') || 'random'; } catch (e) {}
try { S.diff = localStorage.getItem('imperium-diff') || 'easy'; } catch (e) {}
try { S.soundOn = localStorage.getItem('imperium-sound') === '1'; } catch (e) {}   // por defecto, sin sonido
export const $ = id => document.getElementById(id);
export function track(ev, props) { try { window.posthog?.capture?.(ev, props); } catch (e) {} }
