// Bandeja de premios (arriba a la derecha del personaje) con arrastrar y soltar para alimentarlo.
import { ITEM_TYPES } from './inventory.js';

// Distancia mínima (px) para considerar que el dedo está arrastrando y no solo tocando
const DRAG_THRESHOLD_PX = 6;

export class FeedingTray {
  /**
   * @param container elemento donde se dibujan los premios
   * @param inventory inventario con las cantidades
   * @param onDrop (typeId, clientX, clientY) => boolean: true si se soltó sobre el personaje
   */
  constructor(container, inventory, onDrop) {
    this.container = container;
    this.inventory = inventory;
    this.onDrop = onDrop;
    this.slots = new Map();
    this.render();
    inventory.onChange((counts, changedType) => this.update(changedType));
  }

  render() {
    this.container.replaceChildren(...ITEM_TYPES.map((type) => this.createSlot(type)));
    this.update();
  }

  createSlot(type) {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'feed-slot';
    slot.dataset.type = type.id;
    slot.innerHTML = `<span class="feed-slot__emoji" aria-hidden="true">${type.emoji}</span><span class="feed-slot__count"></span>`;
    slot.addEventListener('pointerdown', (event) => this.startDrag(event, type, slot));
    this.slots.set(type.id, slot);
    return slot;
  }

  /** Refresca cantidades; el premio recién obtenido hace una pequeña animación. */
  update(changedType) {
    for (const type of ITEM_TYPES) {
      const slot = this.slots.get(type.id);
      const count = this.inventory.count(type.id);
      slot.querySelector('.feed-slot__count').textContent = count;
      slot.classList.toggle('is-empty', count === 0);
      slot.setAttribute('aria-label', `${type.label}: ${count}. Arrastra hacia el personaje para alimentarlo`);
    }
    const changed = this.slots.get(changedType);
    if (changed) {
      changed.classList.remove('is-bumped');
      void changed.offsetWidth; // reinicia la animación CSS
      changed.classList.add('is-bumped');
    }
  }

  // Crea una copia flotante del premio que sigue al dedo hasta soltarlo
  startDrag(event, type, slot) {
    if (this.inventory.count(type.id) === 0) return;
    event.preventDefault();
    slot.setPointerCapture(event.pointerId);

    const origin = { x: event.clientX, y: event.clientY };
    const ghost = document.createElement('div');
    ghost.className = 'feed-ghost';
    ghost.textContent = type.emoji;
    let dragging = false;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - origin.x;
      const dy = moveEvent.clientY - origin.y;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!dragging) {
        dragging = true;
        document.body.append(ghost);
        slot.classList.add('is-dragging');
      }
      placeGhost(ghost, moveEvent.clientX, moveEvent.clientY);
    };

    const end = (endEvent) => {
      slot.removeEventListener('pointermove', move);
      slot.removeEventListener('pointerup', end);
      slot.removeEventListener('pointercancel', end);
      slot.classList.remove('is-dragging');
      if (!dragging) return;
      const fed = endEvent.type === 'pointerup' && this.onDrop(type.id, endEvent.clientX, endEvent.clientY);
      this.finishGhost(ghost, fed, slot);
    };

    slot.addEventListener('pointermove', move);
    slot.addEventListener('pointerup', end);
    slot.addEventListener('pointercancel', end);
  }

  // Si se lo dio al personaje, el premio desaparece; si no, regresa a su lugar
  finishGhost(ghost, fed, slot) {
    if (fed) {
      ghost.classList.add('is-eaten');
    } else {
      const rect = slot.getBoundingClientRect();
      ghost.classList.add('is-returning');
      placeGhost(ghost, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    setTimeout(() => ghost.remove(), 300);
  }
}

function placeGhost(ghost, x, y) {
  ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}
