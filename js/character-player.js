// Carga un personaje (GLB) y reproduce sus animaciones definidas por los marcadores de Blender.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CROSSFADE_SECONDS = 0.35;

export class CharacterPlayer {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.model = null;
    this.mixer = null;
    this.actions = new Map();
    this.currentId = null;
    this.manifest = null;
    this.speed = 1;
    this.paused = false;
    this.loopOverride = false;
    // Animaciones pendientes de una secuencia (ej. comer → correr) y si la actual se repite
    this.queue = [];
    this.sequenceActive = false;
    this.currentLoops = false;
    this.followBone = null;
    this.listeners = { clipchange: [], finished: [] };
  }

  on(eventName, callback) {
    this.listeners[eventName].push(callback);
  }

  emit(eventName, payload) {
    for (const callback of this.listeners[eventName]) callback(payload);
  }

  /** Carga el modelo de la ficha y prepara una acción por cada animación. */
  async load(manifest, onProgress) {
    this.unload();
    this.manifest = manifest;
    const gltf = await this.loader.loadAsync(manifest.model, (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });

    this.model = gltf.scene;
    this.model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        // Las mallas animadas por huesos pueden salirse de su caja original al moverse
        node.frustumCulled = false;
      }
    });
    this.scene.add(this.model);

    // Hueso de la cadera: sirve para que la cámara siga al personaje si se desplaza
    this.followBone = this.model.getObjectByName('hips') || this.model.getObjectByName('root') || this.model;

    this.mixer = new THREE.AnimationMixer(this.model);
    this.mixer.addEventListener('finished', (event) => this.handleFinished(event));

    // Blender exporta una animación por objeto; se juntan en una sola línea de tiempo
    const allTracks = gltf.animations.flatMap((clip) => clip.tracks);
    const timeline = new THREE.AnimationClip('timeline', -1, allTracks);

    for (const clipInfo of manifest.clips) {
      const clip = sliceClip(timeline, clipInfo, manifest.fps);
      const action = this.mixer.clipAction(clip);
      action.clampWhenFinished = true;
      this.actions.set(clipInfo.id, { action, info: clipInfo });
    }

    const firstClip = manifest.defaultClip || manifest.clips[0]?.id;
    if (firstClip) this.play(firstClip, { fade: false });
  }

  /** Elimina el personaje actual de la escena y libera memoria de la GPU. */
  unload() {
    if (!this.model) return;
    this.mixer.stopAllAction();
    this.scene.remove(this.model);
    this.model.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
    this.model = null;
    this.mixer = null;
    this.actions.clear();
    this.currentId = null;
  }

  /**
   * Reproduce una animación por su id (nombre del marcador en Blender).
   * `once` obliga a reproducirla una sola vez; `keepQueue` la usa internamente una secuencia.
   */
  play(clipId, { fade = true, once = false, keepQueue = false } = {}) {
    const next = this.actions.get(clipId);
    if (!next) return;
    if (!keepQueue) {
      this.queue = [];
      this.sequenceActive = false;
    }
    const previous = this.actions.get(this.currentId);

    const { action, info } = next;
    this.currentLoops = !once && this.shouldLoop(info);
    action.reset();
    action.setLoop(this.currentLoops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.play();
    if (previous && previous !== next && fade) {
      previous.action.crossFadeTo(action, CROSSFADE_SECONDS, false);
    } else if (previous && previous !== next) {
      previous.action.stop();
    }

    this.currentId = clipId;
    this.setPaused(false);
    this.emit('clipchange', info);
  }

  /**
   * Reproduce varias animaciones seguidas, cada una una sola vez, y al final vuelve al reposo.
   * Ej.: ['Galleta', 'Correr_Galleta'] → come y después corre.
   */
  playSequence(clipIds) {
    const [first, ...rest] = clipIds.filter((id) => this.actions.has(id));
    if (!first) return;
    this.play(first, { once: true });
    this.queue = rest;
    this.sequenceActive = true;
  }

  /** true mientras se reproduce una secuencia (ej. comer → correr → festejar). */
  isInSequence() {
    return this.queue.length > 0 || this.sequenceActive;
  }

  /**
   * Reproduce una animación al azar, sin repetir la actual y sin las indicadas en `excludedIds`
   * (por ejemplo, las de alimentar, que solo se activan al darle un premio).
   * El reposo nunca sale al azar: es el estado normal cuando nadie toca al personaje.
   */
  playRandom(excludedIds = []) {
    const blocked = new Set([...excludedIds, this.manifest?.defaultClip, this.currentId]);
    const candidates = [...this.actions.keys()].filter((id) => !blocked.has(id));
    if (candidates.length === 0) return null;
    const clipId = candidates[Math.floor(Math.random() * candidates.length)];
    this.play(clipId);
    return clipId;
  }

  /** Caja que envuelve al personaje en su pose actual (para saber si se tocó o se le soltó algo encima). */
  getBounds(target = new THREE.Box3()) {
    return this.model ? target.setFromObject(this.model) : target.makeEmpty();
  }

  restart() {
    if (this.currentId) this.play(this.currentId, { fade: false });
  }

  setPaused(paused) {
    this.paused = paused;
    if (this.mixer) this.mixer.timeScale = paused ? 0 : this.speed;
  }

  setSpeed(speed) {
    this.speed = speed;
    this.setPaused(this.paused);
  }

  /** Activa/desactiva repetir en bucle la animación actual. */
  setLoopOverride(enabled) {
    this.loopOverride = enabled;
    const current = this.actions.get(this.currentId);
    if (!current) return;
    current.action.setLoop(this.shouldLoop(current.info) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    // Si ya había terminado, se reanuda para que el bucle tenga efecto
    if (enabled && !current.action.isRunning()) current.action.reset().play();
  }

  shouldLoop(info) {
    return this.loopOverride || info.loop;
  }

  /** Progreso de 0 a 1 de la animación actual. */
  getProgress() {
    const current = this.actions.get(this.currentId);
    if (!current) return 0;
    const duration = current.action.getClip().duration;
    return duration > 0 ? THREE.MathUtils.clamp(current.action.time / duration, 0, 1) : 0;
  }

  /** Salta a un punto (0 a 1) de la animación actual, útil para revisar pose por pose. */
  seek(progress) {
    const current = this.actions.get(this.currentId);
    if (!current) return;
    const { action } = current;
    if (!action.isRunning()) action.play();
    action.enabled = true;
    action.paused = false;
    action.time = progress * action.getClip().duration;
    this.mixer.update(0);
  }

  getDuration() {
    return this.actions.get(this.currentId)?.action.getClip().duration ?? 0;
  }

  // Al terminar una animación: sigue con la siguiente de la secuencia o vuelve al reposo
  handleFinished(event) {
    const finished = [...this.actions.values()].find((entry) => entry.action === event.action);
    if (!finished || finished.info.id !== this.currentId) return;
    this.emit('finished', finished.info);
    if (this.queue.length > 0) {
      this.play(this.queue.shift(), { once: true, keepQueue: true });
      return;
    }
    this.sequenceActive = false;
    const idle = this.manifest?.defaultClip;
    if (idle && finished.info.id !== idle && !this.currentLoops) this.play(idle);
  }

  update(delta) {
    this.mixer?.update(delta);
  }

  getFollowPoint(target = new THREE.Vector3()) {
    return this.followBone ? this.followBone.getWorldPosition(target) : target.set(0, 0, 0);
  }
}

/**
 * Recorta la línea de tiempo al rango de frames [start, end] de un marcador.
 * A diferencia de AnimationUtils.subclip, conserva las pistas sin claves dentro del rango
 * (se evalúan en los bordes), así los objetos ocultos por escala no aparecen donde no deben.
 */
function sliceClip(timeline, clipInfo, fps) {
  const startTime = clipInfo.start / fps;
  const endTime = (clipInfo.end + 1) / fps;
  const tracks = timeline.tracks.map((track) => {
    const interpolant = track.createInterpolant();
    const size = track.getValueSize();
    const times = [startTime];
    for (const time of track.times) if (time > startTime && time < endTime) times.push(time);
    times.push(endTime);

    const values = new Float32Array(times.length * size);
    times.forEach((time, index) => values.set(interpolant.evaluate(time), index * size));

    const TrackType = track.constructor;
    const sliced = new TrackType(track.name, times.map((time) => time - startTime), values);
    sliced.setInterpolation(track.getInterpolation());
    return sliced;
  });
  return new THREE.AnimationClip(clipInfo.id, endTime - startTime, tracks);
}
