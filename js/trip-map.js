// Mini mapa simulado del viaje (SVG, sin servicios externos): calles, ruta, marcadores y auto en movimiento.
// Las coordenadas viven en un lienzo de 360×200; los puntos importantes quedan en la zona central
// para que no se recorten aunque el mapa cambie de proporción (preserveAspectRatio "slice").

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_WIDTH = 360;
const VIEW_HEIGHT = 200;

// Calles principales (cuadrícula): las rutas siempre van por estas líneas
const STREETS_X = [60, 120, 180, 240, 300];
const STREETS_Y = [55, 100, 145];

// Ubicación actual del pasajero en el mapa simulado
export const CURRENT_LOCATION = 'Mi ubicación actual';

// Lugares conocidos: siempre en la misma esquina del mapa (el selector de mapa los muestra como pines)
export const PLACES = [
  { name: CURRENT_LOCATION, label: 'Mi ubicación', address: 'Ubicación actual', icon: 'location', point: { x: 120, y: 100 } },
  { name: 'Casa', label: 'Casa', address: 'Calle Robles 128', icon: 'home', point: { x: 60, y: 145 } },
  { name: 'Trabajo', label: 'Trabajo', address: 'Av. Reforma 405', icon: 'work', point: { x: 240, y: 55 } },
  { name: 'Plaza Central', label: 'Plaza', address: 'Plaza Central, Centro', icon: 'shop', point: { x: 300, y: 145 } },
];

// Iconos (24×24) que se dibujan dentro de los pines del mapa
const PIN_ICONS = {
  location: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  home: 'M4 11.5 12 5l8 6.5 M6.5 10v9h11v-9',
  work: 'M4 8h16v11H4z M9 8V6h6v2',
  shop: 'M6 9h12l-1 10H7z M9.5 9a2.5 2.5 0 0 1 5 0',
};

// Margen extra de ciudad dibujada fuera del lienzo, para que nunca se vean bordes vacíos
const CITY_MARGIN = 120;

export class TripMap {
  /**
   * @param fit 'slice' (llena el recuadro, puede recortar orillas) o 'meet' (muestra todo el lienzo;
   *            se usa en el selector de mapa para que ningún pin quede cortado)
   */
  constructor(container, { fit = 'slice' } = {}) {
    this.container = container;
    this.frame = null;
    this.svg = createSvg('svg', {
      viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
      preserveAspectRatio: `xMidYMid ${fit}`,
      class: 'trip-map__svg',
    });
    this.drawCity();
    this.routeCasing = this.add('path', { class: 'trip-map__route-casing' });
    this.route = this.add('path', { class: 'trip-map__route' });
    this.markers = this.add('g');
    this.car = this.createCar();
    container.append(this.svg);
  }

  add(tag, attributes, parent = this.svg) {
    const element = createSvg(tag, attributes);
    parent.append(element);
    return element;
  }

  // Manzanas, parques y calles de la ciudad de fondo
  drawCity() {
    const m = CITY_MARGIN;
    this.add('rect', { x: -m, y: -m, width: VIEW_WIDTH + m * 2, height: VIEW_HEIGHT + m * 2, class: 'trip-map__ground' });
    this.add('rect', { x: 186, y: 106, width: 48, height: 33, rx: 3, class: 'trip-map__park' });
    this.add('rect', { x: 66, y: 12, width: 48, height: 37, rx: 3, class: 'trip-map__park' });
    // Calles menores y principales (se extienden más allá del lienzo)
    for (let x = 30 - m; x <= VIEW_WIDTH + m; x += 60) this.add('line', { x1: x, y1: -m, x2: x, y2: VIEW_HEIGHT + m, class: 'trip-map__street--minor' });
    for (let y = 77 - 135; y <= VIEW_HEIGHT + m; y += 45) this.add('line', { x1: -m, y1: y, x2: VIEW_WIDTH + m, y2: y, class: 'trip-map__street--minor' });
    for (const x of [0, ...STREETS_X, 360]) this.add('line', { x1: x, y1: -m, x2: x, y2: VIEW_HEIGHT + m, class: 'trip-map__street' });
    for (const y of [10, ...STREETS_Y, 190]) this.add('line', { x1: -m, y1: y, x2: VIEW_WIDTH + m, y2: y, class: 'trip-map__street' });
  }

  // Auto visto desde arriba (apunta hacia arriba; se gira según la dirección de la ruta)
  createCar() {
    const car = this.add('g', { class: 'trip-map__car' });
    this.add('rect', { x: -5.5, y: -9, width: 11, height: 18, rx: 3, class: 'trip-map__car-body' }, car);
    this.add('rect', { x: -4, y: -5, width: 8, height: 4, rx: 1, class: 'trip-map__car-glass' }, car);
    car.style.display = 'none';
    return car;
  }

  /** Estado "buscando conductor": solo el punto de partida con un pulso. */
  showSearching(point) {
    this.stop();
    this.clearRoute();
    this.car.style.display = 'none';
    this.markers.replaceChildren();
    this.add('circle', { cx: point.x, cy: point.y, r: 10, class: 'trip-map__pulse' }, this.markers);
    this.add('circle', { cx: point.x, cy: point.y, r: 10, class: 'trip-map__pulse trip-map__pulse--late' }, this.markers);
    this.addPickupMarker(point);
  }

  /**
   * Selector de mapa: dibuja un pin por lugar (con icono y nombre) que se puede tocar.
   * `selectedName` resalta el lugar elegido; `onPick(place)` avisa cuál se tocó.
   * `scale` agranda los pines (en el selector se ven más grandes para tocarlos fácil con el dedo).
   */
  showPlaces(places, selectedName, onPick, scale = 1) {
    this.stop();
    this.clearRoute();
    this.car.style.display = 'none';
    this.markers.replaceChildren();
    for (const place of places) {
      const { x, y } = place.point;
      const selected = place.name === selectedName;
      const pin = this.add('g', { class: `trip-map__place${selected ? ' is-selected' : ''}`, transform: `translate(${x} ${y}) scale(${scale})` }, this.markers);
      this.add('circle', { r: 16, class: 'trip-map__place-hit' }, pin); // área más grande para tocar con el dedo
      this.add('circle', { r: 10, class: 'trip-map__place-dot' }, pin);
      this.add('path', { d: PIN_ICONS[place.icon], transform: 'translate(-6 -6) scale(0.5)', class: 'trip-map__place-icon' }, pin);
      const label = this.add('text', { y: 23, 'text-anchor': 'middle', class: 'trip-map__place-label' }, pin);
      label.textContent = place.label;
      pin.addEventListener('click', () => onPick(place));
    }
  }

  /**
   * Dibuja una ruta por las calles entre dos puntos y coloca el auto al inicio.
   * `endMarker`: 'pickup' (el conductor va por ti) o 'destination' (vas a tu destino).
   */
  showRoute(from, to, endMarker) {
    this.stop();
    const points = streetRoute(from, to);
    const d = points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
    this.route.setAttribute('d', d);
    this.routeCasing.setAttribute('d', d);
    this.markers.replaceChildren();
    if (endMarker === 'pickup') {
      this.addPickupMarker(to);
    } else {
      this.addPickupMarker(from);
      this.addDestinationMarker(to);
    }
    this.car.style.display = '';
    this.moveCarTo(0);
  }

  addPickupMarker(point) {
    this.add('circle', { cx: point.x, cy: point.y, r: 6.5, class: 'trip-map__pickup' }, this.markers);
    this.add('circle', { cx: point.x, cy: point.y, r: 2.5, class: 'trip-map__pickup-dot' }, this.markers);
  }

  addDestinationMarker(point) {
    this.add('rect', { x: point.x - 6, y: point.y - 6, width: 12, height: 12, rx: 1.5, class: 'trip-map__destination' }, this.markers);
    this.add('rect', { x: point.x - 2.5, y: point.y - 2.5, width: 5, height: 5, class: 'trip-map__destination-dot' }, this.markers);
  }

  // Coloca el auto en un punto de la ruta (0 = inicio, 1 = final) y lo orienta hacia donde avanza
  moveCarTo(progress) {
    const length = this.route.getTotalLength();
    const distance = Math.min(progress * length, length);
    const point = this.route.getPointAtLength(distance);
    const ahead = this.route.getPointAtLength(Math.min(distance + 1, length));
    const behind = this.route.getPointAtLength(Math.max(distance - 1, 0));
    const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI + 90;
    this.car.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
    // La parte ya recorrida de la ruta se apaga
    this.route.style.strokeDasharray = `${length}`;
    this.route.style.strokeDashoffset = `${-distance}`;
  }

  /** Anima el auto a lo largo de la ruta en `durationMs`; avisa el progreso y cuando llega. */
  animateCar(durationMs, onProgress, onDone) {
    this.stop();
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / durationMs, 1);
      this.moveCarTo(easeInOut(progress));
      onProgress?.(progress);
      if (progress < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.frame = null;
        onDone?.();
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  clearRoute() {
    this.route.removeAttribute('d');
    this.routeCasing.removeAttribute('d');
  }
}

/** Lugar conocido por su nombre (Casa, Trabajo…), o null si es un texto escrito a mano. */
export function findPlace(name) {
  return PLACES.find((place) => place.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/**
 * Punto del mapa para un origen o destino. Los lugares conocidos tienen su punto fijo;
 * lo escrito a mano cae en una esquina estable (lado izquierdo para el origen, derecho para el destino).
 */
export function pointForPlace(name, side) {
  const known = findPlace(name);
  if (known) return known.point;
  const options = side === 'origin'
    ? [{ x: 60, y: 55 }, { x: 120, y: 145 }, { x: 60, y: 100 }, { x: 180, y: 145 }]
    : [{ x: 300, y: 55 }, { x: 240, y: 145 }, { x: 300, y: 100 }, { x: 180, y: 55 }];
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return options[hash % options.length];
}

/** Punto de salida del conductor: una esquina distinta al punto de partida. */
export function randomDriverStart(avoid) {
  const options = [{ x: 300, y: 55 }, { x: 300, y: 145 }, { x: 240, y: 145 }, { x: 60, y: 55 }, { x: 180, y: 100 }]
    .filter((point) => point.x !== avoid.x || point.y !== avoid.y);
  return options[Math.floor(Math.random() * options.length)];
}

// Ruta en "L" o en "Z" siguiendo las calles de la cuadrícula
function streetRoute(from, to) {
  if (from.x === to.x || from.y === to.y) return [from, to];
  const middleX = STREETS_X.find((x) => x > Math.min(from.x, to.x) && x < Math.max(from.x, to.x));
  if (middleX !== undefined) {
    return [from, { x: middleX, y: from.y }, { x: middleX, y: to.y }, to];
  }
  return [from, { x: to.x, y: from.y }, to];
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function createSvg(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}
