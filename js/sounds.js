// Efectos de sonido sintetizados con Web Audio (sin archivos: funcionan sin internet y no pesan nada).
// Los navegadores solo permiten sonar después de que el usuario toca la pantalla: el audio se "desbloquea"
// con el primer toque. Los sonidos siempre están activos (no hay botón de silencio).

const MASTER_VOLUME = 0.6;

// Notas musicales usadas (Hz)
const NOTE = { G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G6: 1568, C7: 2093, E7: 2637 };

/**
 * Cada sonido es una lista de notas: [frecuencia, inicio (s), duración (s), opciones].
 * Opciones: type (forma de onda), gain (volumen), slideTo (desliza la frecuencia), bell (agrega armónico de campana).
 */
const SOUNDS = {
  tick: [[1800, 0, 0.035, { gain: 0.05 }]],
  request: [[NOTE.C5, 0, 0.12, { type: 'triangle', gain: 0.16 }], [NOTE.G5, 0.1, 0.18, { type: 'triangle', gain: 0.16 }]],
  driverFound: [
    [NOTE.C6, 0, 0.3, { type: 'triangle', gain: 0.18, bell: true }],
    [NOTE.E6, 0.1, 0.3, { type: 'triangle', gain: 0.18, bell: true }],
    [NOTE.G6, 0.2, 0.5, { type: 'triangle', gain: 0.2, bell: true }],
  ],
  driverArrived: [
    [NOTE.A5, 0, 0.7, { gain: 0.3, bell: true }],
    [NOTE.E5, 0.32, 0.9, { gain: 0.3, bell: true }],
  ],
  responseUrgent: [[1000, 0, 0.09, { type: 'square', gain: 0.06 }], [1000, 0.16, 0.09, { type: 'square', gain: 0.06 }]],
  responseExpired: [
    [880, 0, 0.1, { type: 'square', gain: 0.07 }],
    [880, 0.16, 0.1, { type: 'square', gain: 0.07 }],
    [660, 0.32, 0.22, { type: 'square', gain: 0.07 }],
  ],
  passengerReady: [[NOTE.E5, 0, 0.1, { gain: 0.16 }], [NOTE.A5, 0.08, 0.16, { gain: 0.16 }]],
  tripStarted: [[300, 0, 0.28, { gain: 0.14, slideTo: 620 }], [NOTE.A5, 0.24, 0.3, { type: 'triangle', gain: 0.14, bell: true }]],
  tripCompleted: [
    [NOTE.C5, 0, 0.16, { type: 'triangle', gain: 0.16 }],
    [NOTE.E5, 0.1, 0.16, { type: 'triangle', gain: 0.16 }],
    [NOTE.G5, 0.2, 0.16, { type: 'triangle', gain: 0.16 }],
    [NOTE.C6, 0.3, 0.45, { type: 'triangle', gain: 0.18, bell: true }],
  ],
  rated: [[NOTE.G5, 0, 0.14, { gain: 0.12 }], [NOTE.C6, 0.1, 0.3, { gain: 0.12, bell: true }]],
  cancelled: [[NOTE.A4, 0, 0.18, { type: 'triangle', gain: 0.15 }], [NOTE.G4 * 0.84, 0.16, 0.32, { type: 'triangle', gain: 0.15 }]],
  // Pequeños y discretos: alimentar al personaje y boleto gratis
  feed: [[520, 0, 0.09, { gain: 0.12, slideTo: 860 }], [700, 0.1, 0.08, { gain: 0.09, slideTo: 1000 }]],
  goldenTicket: [
    [NOTE.G6, 0, 0.12, { gain: 0.07, bell: true }],
    [NOTE.C7, 0.07, 0.14, { gain: 0.07, bell: true }],
    [NOTE.E7, 0.14, 0.3, { gain: 0.07, bell: true }],
  ],
};

// Vibración (solo en celulares que la soportan, por ejemplo Android) para los avisos importantes
const VIBRATIONS = { driverFound: [70, 40, 70], driverArrived: [200, 100, 200], responseExpired: [120, 60, 120, 60, 120] };

export class SoundEffects {
  constructor() {
    this.context = null;
    // Desbloquea el audio con el primer toque o tecla del usuario
    const unlock = () => this.ensureContext();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  ensureContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.context = new AudioContextClass();
    }
    if (this.context.state === 'suspended') this.context.resume();
    return this.context;
  }

  /** Reproduce un sonido por nombre (ver SOUNDS). */
  play(name) {
    const notes = SOUNDS[name];
    const context = this.ensureContext();
    if (!notes || !context) return;
    const now = context.currentTime + 0.01;
    for (const [frequency, start, duration, options] of notes) {
      playNote(context, frequency, now + start, duration, options);
    }
    if (VIBRATIONS[name] && navigator.vibrate) navigator.vibrate(VIBRATIONS[name]);
  }
}

// Una nota con ataque rápido y caída suave; "bell" suma un armónico que suena a campanita
function playNote(context, frequency, start, duration, { type = 'sine', gain = 0.15, slideTo, bell = false } = {}) {
  const volume = context.createGain();
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain * MASTER_VOLUME, start + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  volume.connect(context.destination);

  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  oscillator.connect(volume);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);

  if (bell) {
    const overtone = context.createOscillator();
    const overtoneVolume = context.createGain();
    overtone.frequency.setValueAtTime(frequency * 2.76, start);
    overtoneVolume.gain.value = 0.25;
    overtone.connect(overtoneVolume).connect(volume);
    overtone.start(start);
    overtone.stop(start + duration * 0.6);
  }
}
