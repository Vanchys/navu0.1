// Punto de entrada: une el escenario 3D, el reproductor del personaje y la interfaz.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { CharacterPlayer } from './character-player.js';
import { DashboardUI } from './ui.js';
import { loadCatalog, loadManifest } from './catalog.js';
import { Inventory } from './inventory.js';
import { ScoreBar } from './score-bar.js';
import { FeedingTray } from './feeding-tray.js';
import { TripRequest } from './trip-request.js';
import { CharacterInfo } from './character-info.js';
import { GoldenTicket } from './golden-ticket.js';
import { launchConfetti } from './confetti.js';
import { SoundEffects } from './sounds.js';

// Un toque es: poco movimiento del dedo y soltar rápido (si no, se interpreta como girar la vista)
const TAP_MAX_MOVE_PX = 8;
const TAP_MAX_MS = 350;
// Tope de la barra de puntos del personaje
const MAX_SCORE_POINTS = 5;

const canvas = document.getElementById('viewport');
const stage = new Stage(canvas);
const player = new CharacterPlayer(stage.scene);
const ui = new DashboardUI();
const inventory = new Inventory();
const characterInfo = new CharacterInfo();
const sounds = new SoundEffects();
const scoreBar = new ScoreBar(document.getElementById('score-bar'), MAX_SCORE_POINTS);
// true cuando la barra se llenó y el personaje tiene pendiente su festejo
let celebrationPending = false;
// Pausa entre que empieza el festejo y aparece el Boleto Dorado (para ver el brinco)
const TICKET_DELAY_MS = 700;
let tripRequest = null;
const goldenTicket = new GoldenTicket(() => {
  tripRequest?.addFreeRide();
  ui.showToast('🎟️ Boleto guardado: elige «Boleto» al pagar tu próximo viaje');
});

let catalog = [];
let currentEntry = null;
const followPoint = new THREE.Vector3();
const characterBounds = new THREE.Box3();

// Reencuadra al personaje dentro de la zona libre de su cuadro (mitad superior de la pantalla)
function reframe() {
  stage.frameCharacter(player.manifest?.height ?? 2, ui.getFreeArea());
}

/** Descarga y muestra un personaje del catálogo. */
async function showCharacter(entry) {
  ui.showLoader(`Cargando ${entry.name}…`);
  try {
    const manifest = await loadManifest(entry);
    await player.load(manifest);
    // Círculo del tamaño que necesita el personaje para que sus animaciones no se salgan
    stage.setStageRadius(manifest.stageRadius);
    currentEntry = entry;
    ui.setCharacter(manifest);
    characterInfo.setCharacter(manifest);
    ui.renderCatalog(catalog, entry.id, showCharacter);
    reframe();
    ui.hideLoader();
  } catch (error) {
    console.error(error);
    ui.showLoader(`No se pudo cargar ${entry.name}. Revisa la consola.`);
  }
}

// Registra qué animación está haciendo el personaje y, si toca festejar, reinicia la barra
function bindPlayerEvents() {
  player.on('clipchange', (clip) => {
    ui.setActiveClip(clip);
    if (celebrationPending && clip.id === celebrationClip()) {
      celebrationPending = false;
      scoreBar.reset();
      celebrateFullBar();
    }
  });
}

/** Barra completa: confeti desde el personaje y, enseguida, el Boleto Dorado (viaje gratis) que regala. */
function celebrateFullBar() {
  const stageRect = document.getElementById('character-stage').getBoundingClientRect();
  launchConfetti({ x: stageRect.left + stageRect.width / 2, y: stageRect.top + stageRect.height * 0.45 });
  setTimeout(() => {
    goldenTicket.show(player.manifest.name);
    sounds.play('goldenTicket');
  }, TICKET_DELAY_MS);
}

// Animación con la que el personaje festeja al llenar su barra (ficha: interactions.celebrate)
function celebrationClip() {
  return player.manifest?.interactions?.celebrate;
}

/** true si el punto de la pantalla cae sobre el personaje. */
function isOverCharacter(clientX, clientY) {
  return Boolean(player.model) && stage.isPointOverBox(player.getBounds(characterBounds), clientX, clientY);
}

/**
 * Alimentar: si el premio se soltó sobre el personaje, se gasta, suma sus puntos a la barra
 * y se reproduce su secuencia (siempre come y después corre, ej. Galleta → Correr_Galleta).
 * Si la barra llega al tope, al final festeja y la barra vuelve a cero.
 */
function feedCharacter(typeId, clientX, clientY) {
  const feeding = player.manifest?.interactions?.feeding?.[typeId];
  if (!feeding || !isOverCharacter(clientX, clientY)) return false;
  const points = inventory.consume(typeId);
  if (!points) return false;

  const sequence = Array.isArray(feeding) ? [...feeding] : [feeding];
  if (scoreBar.add(points) && celebrationClip()) {
    celebrationPending = true;
    sequence.push(celebrationClip());
  }
  player.playSequence(sequence);
  sounds.play('feed');
  return true;
}

// Tocar al personaje reproduce una animación al azar (sin las de alimentar)
function watchCharacterTaps() {
  let press = null;
  canvas.addEventListener('pointerdown', (event) => {
    press = { x: event.clientX, y: event.clientY, time: performance.now() };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!press) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const quick = performance.now() - press.time < TAP_MAX_MS;
    press = null;
    if (moved > TAP_MAX_MOVE_PX || !quick || !isOverCharacter(event.clientX, event.clientY)) return;
    // Mientras come, corre o festeja no se interrumpe con animaciones al azar
    if (player.isInSequence()) return;
    player.playRandom(tapExcludedClips());
  });
}

/**
 * Animaciones que nunca salen al tocar al personaje: las de alimentar (tapExclude)
 * y las exclusivas del viaje (tripReactions) y del festejo (celebrate).
 */
function tapExcludedClips() {
  const interactions = player.manifest?.interactions ?? {};
  return [
    ...(interactions.tapExclude ?? []),
    ...Object.values(interactions.tripReactions ?? {}),
    interactions.celebrate,
  ].filter(Boolean);
}

/** Al completar un viaje: un alimento al azar (el dulce es raro y vale más si el viaje fue en Taxi). */
function grantTripReward(rideTypeId) {
  const reward = inventory.grantTripReward(rideTypeId);
  ui.showToast(`¡Obtuviste ${reward.type.emoji} ${reward.type.label.toLowerCase()}! (+${reward.points} pts)`);
  return reward;
}

function setupFeeding() {
  new FeedingTray(document.getElementById('feed-tray'), inventory, feedCharacter);
  watchCharacterTaps();
}

/** Reproduce la reacción del personaje a un momento del viaje (definida en su ficha: interactions.tripReactions). */
function reactToTrip(moment) {
  const clipId = player.manifest?.interactions?.tripReactions?.[moment];
  if (clipId) player.play(clipId);
  return Boolean(clipId);
}

/**
 * El personaje acompaña cada momento del viaje. Las animaciones de cada momento se definen en su ficha
 * (interactions.tripReactions); los que están en null son ganchos listos para futuras animaciones.
 */
function setupTrips() {
  tripRequest = new TripRequest(document.getElementById('trip-panel'), {
    onTripRequested: () => {
      reactToTrip('searching');
      sounds.play('request');
    },
    onDriverAssigned: () => {
      reactToTrip('driverAssigned');
      sounds.play('driverFound');
    },
    onDriverArrived: () => {
      reactToTrip('driverArrived');
      sounds.play('driverArrived');
    },
    onPassengerReady: () => {
      reactToTrip('passengerReady');
      sounds.play('passengerReady');
    },
    onTripStarted: () => {
      reactToTrip('tripStarted');
      sounds.play('tripStarted');
    },
    onTripCompleted: (trip) => {
      reactToTrip('completed');
      sounds.play('tripCompleted');
      return grantTripReward(trip.rideTypeId);
    },
    onTripRated: () => {
      reactToTrip('rated');
      sounds.play('rated');
      ui.showToast('¡Gracias por calificar tu viaje!');
    },
    onResponseUrgent: () => sounds.play('responseUrgent'),
    onResponseExpired: () => sounds.play('responseExpired'),
    onTick: () => sounds.play('tick'),
    // Cancelar el viaje (en cualquier fase después de solicitarlo) pone triste al personaje
    // (si el personaje no tiene esa animación, vuelve al reposo)
    onTripCancelled: () => {
      sounds.play('cancelled');
      reactToTrip('cancelled') || player.play(player.manifest?.defaultClip);
    },
  });
}

// En cada cuadro: avanza la animación y mueve la cámara con el personaje si se desplaza
function registerFrameUpdate() {
  stage.onUpdate((delta) => {
    player.update(delta);
    if (player.model) stage.followPoint(player.getFollowPoint(followPoint));
  });
}

// Reencuadra al girar el celular o cambiar el tamaño de la ventana
function watchLayout() {
  const observer = new ResizeObserver(() => reframe());
  observer.observe(document.getElementById('character-stage'));
  window.addEventListener('orientationchange', () => setTimeout(reframe, 150));
}

async function init() {
  bindPlayerEvents();
  setupFeeding();
  setupTrips();
  registerFrameUpdate();
  watchLayout();
  stage.start();

  try {
    catalog = await loadCatalog();
  } catch (error) {
    console.error(error);
    ui.showLoader('No se encontró characters/index.json. Exporta un personaje primero.');
    return;
  }
  if (catalog.length === 0) {
    ui.showLoader('Todavía no hay personajes exportados.');
    return;
  }
  // Permite abrir un personaje directo con ?personaje=<id>
  const requestedId = new URLSearchParams(location.search).get('personaje');
  const firstEntry = catalog.find((entry) => entry.id === requestedId) ?? catalog[0];
  ui.renderCatalog(catalog, currentEntry?.id, showCharacter);
  await showCharacter(firstEntry);
}

init();

// PWA: registra el service worker (necesario para que Chrome ofrezca "Instalar app" y funcione sin conexión)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('No se pudo registrar el service worker', error));
  });
}
