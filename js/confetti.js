// Lluvia de confeti a pantalla completa (canvas propio que se elimina al terminar).

const COLORS = ['#ff7a2f', '#ffb347', '#ffd76a', '#38bdf8', '#f5f5f6', '#f472b6', '#4ade80'];
const PARTICLE_COUNT = 160;
const DURATION_MS = 3200;
const GRAVITY = 0.16;

/**
 * Lanza confeti desde un punto de la pantalla (por defecto, arriba al centro).
 * No hace nada si el usuario pidió reducir animaciones.
 */
export function launchConfetti(origin = { x: window.innerWidth / 2, y: window.innerHeight * 0.3 }) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);

  const particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(origin));
  const start = performance.now();

  const frame = (now) => {
    const elapsed = now - start;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    // Se desvanece en el último tercio
    context.globalAlpha = Math.min(1, (DURATION_MS - elapsed) / (DURATION_MS / 3));
    for (const particle of particles) {
      updateParticle(particle);
      drawParticle(context, particle);
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// Cada pedazo sale disparado hacia arriba en abanico y luego cae girando
function createParticle(origin) {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
  const speed = 6 + Math.random() * 9;
  return {
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    width: 6 + Math.random() * 6,
    height: 8 + Math.random() * 8,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    tilt: Math.random() * Math.PI,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function updateParticle(particle) {
  particle.vx *= 0.985;
  particle.vy = particle.vy * 0.985 + GRAVITY;
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.rotation += particle.spin;
  particle.tilt += 0.12;
}

function drawParticle(context, particle) {
  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  // El "tilt" simula que el papel se voltea al caer
  context.scale(1, Math.cos(particle.tilt));
  context.fillStyle = particle.color;
  context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
  context.restore();
}
