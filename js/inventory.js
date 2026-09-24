// Inventario de premios para alimentar al personaje (comida, bebida y dulces).
// Los premios solo se ganan al completar un viaje: uno al azar, y el dulce es el más difícil de conseguir.
// No se guarda nada: cada vez que se abre o recarga la app, todos los premios empiezan en cero.

// `points`: lo que suma a la barra del personaje al dárselo (el dulce depende del viaje del que salió)
export const ITEM_TYPES = [
  { id: 'food', label: 'Comida', emoji: '🍪', points: 1 },
  { id: 'drink', label: 'Bebida', emoji: '💧', points: 1 },
  { id: 'candy', label: 'Dulce', emoji: '🍬', points: null },
];

// Probabilidad (peso) de cada premio al completar un viaje: el dulce es raro
const TRIP_REWARD_WEIGHTS = { food: 45, drink: 45, candy: 10 };

// Puntos del dulce según el tipo de viaje en que se ganó
const CANDY_POINTS_BY_RIDE = { executive: 2, taxi: 3 };

export class Inventory {
  constructor() {
    this.listeners = [];
    // Cada premio guardado es la lista de puntos que vale cada unidad (así el dulce recuerda su valor)
    this.items = Object.fromEntries(ITEM_TYPES.map((type) => [type.id, []]));
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify(changedType) {
    for (const callback of this.listeners) callback(this.items, changedType);
  }

  count(typeId) {
    return this.items[typeId]?.length ?? 0;
  }

  /** Premio al completar un viaje: uno al azar según los pesos. Devuelve { type, points }. */
  grantTripReward(rideTypeId) {
    const typeId = weightedRandom(TRIP_REWARD_WEIGHTS);
    const type = ITEM_TYPES.find((item) => item.id === typeId);
    const points = typeId === 'candy' ? CANDY_POINTS_BY_RIDE[rideTypeId] ?? 2 : type.points;
    this.items[typeId].push(points);
    this.notify(typeId);
    return { type, points };
  }

  /** Gasta un premio al dárselo al personaje. Devuelve los puntos que vale, o 0 si no quedaba. */
  consume(typeId) {
    if (this.count(typeId) === 0) return 0;
    const points = this.items[typeId].pop();
    this.notify(typeId);
    return points;
  }
}

// Elige una clave al azar respetando su peso (ej. 45/45/10)
function weightedRandom(weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return Object.keys(weights)[0];
}
