// Módulo para pedir viajes (demo con datos y tiempos simulados: sin conductores, mapas ni pagos reales).
// Flujo: solicitud → buscando conductor → en camino → llegó → espera ("Enterado, ya salgo")
//        → viaje en curso (mapa) → viaje finalizado (calificación y premio).
import { TripMap, PLACES, CURRENT_LOCATION, findPlace, pointForPlace, randomDriverStart } from './trip-map.js';

// Tipos de viaje (en este orden: Taxi a la izquierda, Ejecutivo a la derecha).
// Taxi: base + precio por km. Ejecutivo: siempre cuesta lo mismo que el Taxi más `extraOverTaxi` pesos.
const RIDE_TYPES = [
  { id: 'taxi', name: 'NaVu Taxi', base: 15, perKm: 4, seats: 4, etaMin: 3 },
  { id: 'executive', name: 'NaVu Ejecutivo', extraOverTaxi: 3, seats: 4, etaMin: 5 },
];
const TAXI = RIDE_TYPES[0];

// Por ahora solo conductores hombres; no se repite el mismo conductor en dos viajes seguidos
const DEMO_DRIVERS = [
  { name: 'Carlos M.', rating: 4.9, car: 'Nissan Versa gris', plate: 'NAV-128' },
  { name: 'Miguel R.', rating: 4.95, car: 'Toyota Yaris rojo', plate: 'RBT-315' },
  { name: 'José L.', rating: 4.85, car: 'Chevrolet Aveo blanco', plate: 'NVU-904' },
  { name: 'Luis H.', rating: 4.9, car: 'Volkswagen Vento plata', plate: 'NAV-552' },
  { name: 'Jorge A.', rating: 4.8, car: 'Kia Rio azul', plate: 'RBT-730' },
  { name: 'Ricardo P.', rating: 4.97, car: 'Honda City negro', plate: 'NVU-218' },
  { name: 'Fernando S.', rating: 4.88, car: 'Mazda 2 gris', plate: 'NAV-641' },
  { name: 'Alejandro T.', rating: 4.92, car: 'Hyundai Accent blanco', plate: 'RBT-087' },
  { name: 'Eduardo V.', rating: 4.86, car: 'Renault Logan rojo', plate: 'NVU-376' },
  { name: 'Roberto C.', rating: 4.94, car: 'Nissan Sentra azul', plate: 'NAV-913' },
  { name: 'Daniel F.', rating: 4.83, car: 'Suzuki Swift plata', plate: 'RBT-459' },
  { name: 'Andrés G.', rating: 4.9, car: 'Toyota Corolla gris', plate: 'NVU-665' },
  { name: 'Héctor N.', rating: 4.87, car: 'Chevrolet Onix negro', plate: 'NAV-274' },
  { name: 'Óscar D.', rating: 4.91, car: 'Kia Forte blanco', plate: 'RBT-808' },
  { name: 'Manuel B.', rating: 4.84, car: 'Volkswagen Jetta azul', plate: 'NVU-139' },
];

// Tiempos de la demo (acelerados): cuánto dura cada fase en la pantalla
const DEMO_TIMING = {
  searchMs: 3000,
  driverEnRouteMs: 9000,
  waitBeforeStartMs: 6000,
  tripInProgressMs: 14000,
};
const FREE_WAIT_LABEL = '2:00';
// Tamaño de los pines en el selector de mapa (más grandes que en el mapa del viaje)
const PICKER_PIN_SCALE = 1.5;
// Tiempo que tiene el pasajero para responder al conductor cuando llega (tiempo real, no acelerado)
const RESPONSE_TIME_SECONDS = 120;
// En los últimos segundos el contador se pone en rojo para llamar la atención
const RESPONSE_URGENT_SECONDS = 30;
// Forma de pago con el Boleto Dorado que regala el personaje (el viaje sale gratis)
const TICKET_PAYMENT = 'Boleto dorado';

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

// Iconos de línea (mismo estilo en todo el módulo)
const ICONS = {
  car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11l1.8-4.2A2 2 0 0 1 8.6 5.5h6.8a2 2 0 0 1 1.8 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>',
  executive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 6 7.2A2 2 0 0 1 7.8 6h8.4a2 2 0 0 1 1.8 1.2l2 4.3"/><rect x="2.5" y="11.5" width="19" height="5.5" rx="2"/><path d="M7 14h2M15 14h2"/><circle cx="7" cy="18" r="1.4"/><circle cx="17" cy="18" r="1.4"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3.5l2 5-2.3 1.4a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 14v6h14v-6"/></svg>',
};

export class TripRequest {
  /**
   * @param root contenedor del módulo (sección de viajes)
   * @param callbacks avisos para el personaje en cada momento del viaje:
   *   onTripRequested, onDriverAssigned, onDriverArrived, onPassengerReady, onTripStarted,
   *   onTripCompleted (devuelve el premio), onTripRated, onTripCancelled,
   *   onResponseUrgent / onResponseExpired (contador para responder al conductor) y onTick (cada selección)
   */
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    // rideTypeId empieza vacío: el usuario debe elegir Taxi o Ejecutivo (no hay preselección)
    // Origen y destino vacíos al inicio (sin nada predefinido); tampoco hay tipo de viaje preseleccionado
    this.trip = { origin: '', destination: '', rideTypeId: null, payment: 'Efectivo', distanceKm: 0 };
    // Selector de mapa: qué campo se está eligiendo ('origin' | 'destination') y el lugar tocado
    this.picker = { field: null, place: null };
    // Campo que llenan los lugares rápidos (Casa, Trabajo, Plaza): el último que se tocó
    this.activeField = null;
    this.rating = { stars: 0, tip: 0 };
    this.timers = [];
    this.lastDriver = null;
    // Boletos dorados disponibles (viajes gratis); no se guardan al recargar la app
    this.freeRides = 0;
    this.searchMap = new TripMap(this.$('#search-map'));
    this.liveMap = new TripMap(this.$('#live-map'));
    this.pickerMap = new TripMap(this.$('#picker-map'), { fit: 'meet' });
    this.bindEvents();
    this.renderRideTypes();
    this.renderStars();
  }

  $(selector) {
    return this.root.querySelector(selector);
  }

  // ---------- Paso 1: formulario ----------

  bindEvents() {
    const destinationInput = this.$('#trip-destination');
    destinationInput.addEventListener('input', () => this.setDestination(destinationInput.value));

    const originInput = this.$('#trip-origin');
    originInput.addEventListener('input', () => this.setOrigin(originInput.value));

    // Icono de ubicación: usa "Mi ubicación actual" como punto de partida
    this.$('#use-location').addEventListener('click', () => {
      this.fillField('origin', CURRENT_LOCATION);
      this.tick();
    });

    // Iconos de mapa: abren el selector de lugares en el mapa
    this.root.querySelectorAll('[data-map]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openMapPicker(button.dataset.map);
        this.tick();
      });
    });
    this.$('#map-picker-close').addEventListener('click', () => this.closeMapPicker());
    this.$('#map-picker-confirm').addEventListener('click', () => this.confirmMapPicker());

    // Lugares rápidos: llenan el punto de partida o el destino (el campo activo)
    this.$('#quick-places').addEventListener('click', (event) => {
      const place = event.target.closest('[data-place]')?.dataset.place;
      if (!place) return;
      const field = this.fieldForQuickPlace();
      this.fillField(field, place);
      // Después de elegir el origen, el siguiente lugar rápido va al destino
      this.setActiveField('destination');
      this.tick();
    });
    originInput.addEventListener('focus', () => this.setActiveField('origin'));
    destinationInput.addEventListener('focus', () => this.setActiveField('destination'));

    this.root.querySelectorAll('.payment__option').forEach((option) => {
      option.addEventListener('click', () => {
        this.setPayment(option.dataset.payment);
        this.setPaymentMenuOpen(false);
        this.tick();
      });
    });
    // "Seleccionar pago" abre/cierra las opciones; tocar fuera las cierra
    const picker = this.$('#payment-picker');
    const togglePaymentMenu = () => {
      this.setPaymentMenuOpen(picker.getAttribute('aria-expanded') !== 'true');
      this.tick();
    };
    picker.addEventListener('click', togglePaymentMenu);
    // Tocar el pago elegido NO abre las opciones: ilumina "Seleccionar pago" para indicar dónde se cambia
    this.$('#payment-current').addEventListener('click', () => {
      this.tick();
      picker.classList.remove('is-hinted');
      void picker.offsetWidth; // reinicia la animación si se toca varias veces
      picker.classList.add('is-hinted');
    });
    picker.addEventListener('animationend', () => picker.classList.remove('is-hinted'));
    document.addEventListener('pointerdown', (event) => {
      if (!this.$('#payment').contains(event.target)) this.setPaymentMenuOpen(false);
    });

    this.$('#tip-options').addEventListener('click', (event) => {
      const option = event.target.closest('[data-tip]');
      if (!option) return;
      this.setTip(Number(option.dataset.tip));
      this.tick();
    });

    this.$('#request-trip').addEventListener('click', () => this.requestTrip());
    this.$('#submit-rating').addEventListener('click', () => this.submitRating());
    this.root.querySelectorAll('[data-action="cancel"]').forEach((button) => {
      button.addEventListener('click', () => this.cancelTrip());
    });
  }

  setOrigin(value) {
    this.trip.origin = value.trim();
    // Campo lleno: se sombrea en naranja (como el recuadro del pago elegido)
    this.$('.route-row--origin').classList.toggle('is-filled', this.hasOrigin());
    this.highlightQuickPlaces();
    this.updateDistance();
  }

  setDestination(value) {
    this.trip.destination = value.trim();
    this.$('.route-row--destination').classList.toggle('is-filled', this.hasDestination());
    this.highlightQuickPlaces();
    this.updateDistance();
  }

  /** Marca qué campo llenarán los lugares rápidos (se ve con un tono naranja suave). */
  setActiveField(field) {
    this.activeField = field;
    this.$('.route-row--origin').classList.toggle('is-active', field === 'origin');
    this.$('.route-row--destination').classList.toggle('is-active', field === 'destination');
  }

  // Si el usuario no ha tocado ningún campo: primero el punto de partida (si está vacío), luego el destino
  fieldForQuickPlace() {
    if (this.activeField) return this.activeField;
    return this.hasOrigin() ? 'destination' : 'origin';
  }

  // Los lugares rápidos se marcan si están como origen o como destino
  highlightQuickPlaces() {
    this.root.querySelectorAll('.quick-place').forEach((chip) => {
      const place = chip.dataset.place;
      chip.setAttribute('aria-pressed', String(place === this.trip.origin || place === this.trip.destination));
    });
  }

  /** Escribe un lugar en el campo indicado (como si el usuario lo hubiera escrito). */
  fillField(field, value) {
    const input = this.$(field === 'origin' ? '#trip-origin' : '#trip-destination');
    input.value = value;
    if (field === 'origin') this.setOrigin(value);
    else this.setDestination(value);
    // Con el origen listo, lo siguiente por llenar es el destino
    if (field === 'origin' && value) this.setActiveField('destination');
  }

  // La distancia (y el precio) dependen del origen y del destino
  updateDistance() {
    this.trip.distanceKm = estimateDistanceKm(`${this.trip.origin}>${this.trip.destination}`);
    this.renderRideTypes();
  }

  // Hay origen/destino cuando se escribieron al menos 3 letras o se eligió un lugar
  hasOrigin() {
    return this.trip.origin.length >= 3;
  }

  hasDestination() {
    return this.trip.destination.length >= 3;
  }

  sameOriginAndDestination() {
    return this.hasOrigin() && this.trip.origin.toLowerCase() === this.trip.destination.toLowerCase();
  }

  // Puntos del mapa para el viaje actual (si coinciden, el destino se mueve a otra esquina)
  originPoint() {
    return pointForPlace(this.trip.origin, 'origin');
  }

  destinationPoint() {
    const point = pointForPlace(this.trip.destination, 'destination');
    const origin = this.originPoint();
    return point.x === origin.x && point.y === origin.y ? pointForPlace(`${this.trip.destination}*`, 'destination') : point;
  }

  // ---------- Selector de lugares en el mapa ----------

  /** Abre el mapa para elegir el punto de partida o el destino. */
  openMapPicker(field) {
    this.picker = { field, place: findPlace(field === 'origin' ? this.trip.origin : this.trip.destination) };
    // Para el origen también aparece "Mi ubicación"; para el destino, solo los lugares guardados
    this.picker.places = field === 'origin' ? PLACES : PLACES.filter((place) => place.name !== CURRENT_LOCATION);
    this.$('#map-picker-title').textContent = field === 'origin' ? 'Elige tu punto de partida' : 'Elige tu destino';
    this.$('#map-picker').hidden = false;
    this.renderMapPicker();
  }

  renderMapPicker() {
    const { place, places } = this.picker;
    this.pickerMap.showPlaces(places, place?.name, (picked) => {
      this.picker.place = picked;
      this.renderMapPicker();
      this.tick();
    }, PICKER_PIN_SCALE);
    this.$('#map-picker-selection').innerHTML = place
      ? `<strong></strong><span></span>`
      : 'Toca un lugar en el mapa';
    if (place) {
      this.$('#map-picker-selection strong').textContent = place.label;
      this.$('#map-picker-selection span').textContent = place.address;
    }
    const confirm = this.$('#map-picker-confirm');
    confirm.disabled = !place;
    confirm.textContent = place ? `Confirmar ${place.label}` : 'Confirmar';
  }

  confirmMapPicker() {
    const { field, place } = this.picker;
    if (!place) return;
    this.fillField(field, place.name);
    this.closeMapPicker();
    this.tick();
  }

  closeMapPicker() {
    this.$('#map-picker').hidden = true;
  }

  // Tarjetas de tipo de viaje: icono, nombre, llegada y precio a la derecha
  renderRideTypes() {
    this.$('#ride-list').replaceChildren(
      ...RIDE_TYPES.map((type) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'ride-card';
        card.role = 'radio';
        card.setAttribute('aria-checked', String(type.id === this.trip.rideTypeId));
        const price = this.hasDestination() ? currency.format(this.priceFor(type)) : '—';
        card.innerHTML = `
          <span class="ride-card__icon">${type.id === 'executive' ? ICONS.executive : ICONS.car}</span>
          <span class="ride-card__text">
            <span class="ride-card__name"></span>
            <span class="ride-card__meta">${type.etaMin} min · ${ICONS.person}${type.seats}</span>
          </span>
          <span class="ride-card__price">${price}</span>`;
        card.querySelector('.ride-card__name').textContent = type.name;
        card.addEventListener('click', () => {
          this.trip.rideTypeId = type.id;
          this.renderRideTypes();
          this.tick();
        });
        return card;
      })
    );
    this.updateRequestButton();
  }

  // El botón "Solicitar" solo se activa con punto de partida, destino (distintos) y tipo de viaje
  updateRequestButton() {
    const button = this.$('#request-trip');
    const selected = this.selectedRideType();
    button.disabled = !this.hasOrigin() || !this.hasDestination() || this.sameOriginAndDestination() || !selected;
    if (!this.hasOrigin()) button.textContent = 'Elige tu punto de partida';
    else if (!this.hasDestination()) button.textContent = 'Elige un destino';
    else if (this.sameOriginAndDestination()) button.textContent = 'El destino debe ser distinto';
    else if (!selected) button.textContent = 'Elige NaVu Taxi o NaVu Ejecutivo';
    else button.textContent = `Solicitar ${selected.name} · ${this.finalPriceLabel(selected)}`;
  }

  setPaymentMenuOpen(open) {
    this.$('#payment-menu').hidden = !open;
    this.$('#payment-picker').setAttribute('aria-expanded', String(open));
  }

  /** Cambia la forma de pago y la muestra a la derecha de "Seleccionar pago". */
  setPayment(payment) {
    this.trip.payment = payment;
    let selectedOption = null;
    this.root.querySelectorAll('.payment__option').forEach((option) => {
      const selected = option.dataset.payment === payment;
      option.setAttribute('aria-checked', String(selected));
      if (selected) selectedOption = option;
    });
    const current = this.$('#payment-current');
    this.$('#payment-current-label').textContent = payment;
    this.$('#payment-current-icon').innerHTML = selectedOption?.querySelector('svg')?.outerHTML ?? '';
    current.classList.toggle('is-ticket', payment === TICKET_PAYMENT);
    current.classList.remove('is-changed');
    void current.offsetWidth;
    current.classList.add('is-changed');
    this.updateRequestButton();
  }

  /** Guarda un Boleto Dorado (viaje gratis) ganado con el personaje. */
  addFreeRide() {
    this.freeRides += 1;
    this.updateTicketOption();
  }

  // La opción de pago "Boleto" solo aparece si hay boletos; muestra cuántos quedan
  updateTicketOption() {
    const option = this.$('#pay-ticket');
    option.hidden = this.freeRides === 0;
    this.$('#ticket-count').textContent = this.freeRides;
    if (this.freeRides === 0 && this.trip.payment === TICKET_PAYMENT) this.setPayment('Efectivo');
  }

  usesTicket() {
    return this.trip.payment === TICKET_PAYMENT;
  }

  /** Precio a pagar: el normal, o gratis si se paga con Boleto Dorado. */
  finalPriceLabel(type) {
    return this.usesTicket() ? 'Gratis' : currency.format(this.priceFor(type));
  }

  selectedRideType() {
    return RIDE_TYPES.find((type) => type.id === this.trip.rideTypeId);
  }

  priceFor(type) {
    if (type.extraOverTaxi != null) return this.priceFor(TAXI) + type.extraOverTaxi;
    return Math.round(type.base + type.perKm * this.trip.distanceKm);
  }

  tripMinutes() {
    return Math.max(5, Math.round(this.trip.distanceKm * 2.4));
  }

  // ---------- Paso 2: buscando conductor ----------

  requestTrip() {
    if (this.$('#request-trip').disabled) return;
    const type = this.selectedRideType();
    this.trip.usedTicket = this.usesTicket();
    if (this.trip.usedTicket) this.freeRides -= 1;
    this.$('#searching-summary').textContent = `${type.name} · ${this.trip.origin} → ${this.trip.destination} · ${this.finalPriceLabel(type)}`;
    this.showStep('searching');
    this.searchMap.showSearching(this.originPoint());
    this.callbacks.onTripRequested?.(this.trip);
    this.later(() => this.assignDriver(), DEMO_TIMING.searchMs);
  }

  // ---------- Paso 3: viaje en vivo ----------

  assignDriver() {
    this.driver = this.pickDriver();
    const initials = this.driver.name.split(' ').map((part) => part[0]).join('').slice(0, 2);
    this.$('#driver-initials').textContent = initials;
    this.$('#driver-name').textContent = this.driver.name;
    this.$('#driver-rating').textContent = String(this.driver.rating);
    this.$('#driver-car').textContent = this.driver.car;
    this.$('#driver-plate').textContent = this.driver.plate;
    this.callbacks.onDriverAssigned?.(this.driver);
    this.startDriverEnRoute();
  }

  // Conductor al azar, distinto al del viaje anterior
  pickDriver() {
    const candidates = DEMO_DRIVERS.filter((driver) => driver !== this.lastDriver);
    this.lastDriver = candidates[Math.floor(Math.random() * candidates.length)];
    return this.lastDriver;
  }

  // Fase: el conductor va por ti (el auto se acerca en el mapa y baja la cuenta de minutos)
  startDriverEnRoute() {
    const eta = this.selectedRideType().etaMin;
    this.showStep('live');
    this.setLiveHeader({ eyebrow: 'Conductor en camino', title: `Llega en ${eta} min`, sub: `${this.driver.car} · ${this.driver.plate}`, tone: 'enroute' });
    this.setProgress(null);
    // Cancelar pequeño a la izquierda; Mensaje y Llamar (más importantes) grandes a la derecha
    this.renderActions([
      { label: 'Cancelar', variant: 'cancel', onClick: () => this.cancelTrip() },
      { icon: ICONS.message, label: 'Mensaje', variant: 'contact', onClick: () => this.demoContact('Mensaje enviado') },
      { icon: ICONS.phone, label: 'Llamar', variant: 'contact', onClick: () => this.demoContact('Llamando al conductor…') },
    ]);
    // El conductor va por ti al punto de partida elegido
    const origin = this.originPoint();
    this.liveMap.showRoute(randomDriverStart(origin), origin, 'pickup');
    this.liveMap.animateCar(
      DEMO_TIMING.driverEnRouteMs,
      (progress) => {
        const minutes = Math.max(1, Math.ceil(eta * (1 - progress)));
        this.$('#live-title').textContent = progress < 0.97 ? `Llega en ${minutes} min` : 'Llegando…';
      },
      () => this.driverArrived()
    );
  }

  // Fase: el conductor llegó y espera que confirmes
  driverArrived() {
    this.setLiveHeader({
      eyebrow: 'Tu conductor llegó',
      title: `Responde en ${formatClock(RESPONSE_TIME_SECONDS)}`,
      // El auto y las placas ya se ven en la tarjeta del conductor
      sub: 'Te espera en el punto de partida',
      tone: 'arrived',
      timer: true,
    });
    this.startResponseCountdown();
    // Cancelar a la izquierda, "Enterado, ya salgo" a la derecha
    this.renderActions([
      { label: 'Cancelar', variant: 'cancel', onClick: () => this.cancelTrip() },
      { label: 'Enterado, ya salgo', variant: 'primary', onClick: () => this.passengerReady() },
    ]);
    this.callbacks.onDriverArrived?.(this.driver);
  }

  /**
   * Cuenta regresiva de 2 minutos para responder al conductor.
   * La barra se va vaciando; en los últimos 30 s se pone roja y al llegar a cero avisa que se agotó.
   */
  startResponseCountdown() {
    const startedAt = Date.now();
    const live = this.$('[data-step="live"]');
    const update = () => {
      const left = Math.max(0, RESPONSE_TIME_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      this.setProgress(left / RESPONSE_TIME_SECONDS);
      if (left <= RESPONSE_URGENT_SECONDS && live.dataset.tone !== 'urgent') {
        live.dataset.tone = 'urgent';
        this.callbacks.onResponseUrgent?.();
      }
      if (left > 0) {
        this.$('#live-title').textContent = `Responde en ${formatClock(left)}`;
        return;
      }
      this.clearTimers();
      this.callbacks.onResponseExpired?.();
      this.$('#live-title').textContent = 'Se agotó el tiempo de respuesta';
      this.$('#live-sub').textContent = 'Tu conductor sigue esperando: confirma lo antes posible';
    };
    update();
    this.interval(update, 1000);
  }

  // Fase: el pasajero confirmó; corre el tiempo de espera hasta que el conductor inicia el viaje
  passengerReady() {
    // Detiene la cuenta regresiva de respuesta
    this.clearTimers();
    this.setProgress(null);
    const startedAt = Date.now();
    this.setLiveHeader({
      eyebrow: 'Tiempo de espera',
      title: 'Espera 00:00',
      sub: `Tienes ${FREE_WAIT_LABEL} min de espera sin costo`,
      timer: true,
      tone: 'waiting',
    });
    this.renderActions([
      { label: 'Cancelar', variant: 'cancel', onClick: () => this.cancelTrip() },
      { icon: ICONS.message, label: 'Mensaje', variant: 'contact', onClick: () => this.demoContact('Mensaje enviado') },
      { icon: ICONS.phone, label: 'Llamar', variant: 'contact', onClick: () => this.demoContact('Llamando al conductor…') },
    ]);
    this.interval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      this.$('#live-title').textContent = `Espera ${formatClock(seconds)}`;
    }, 1000);
    this.callbacks.onPassengerReady?.();
    this.later(() => this.startTrip(), DEMO_TIMING.waitBeforeStartMs);
  }

  // Fase: viaje en curso hacia el destino (mapa, hora de llegada y progreso)
  startTrip() {
    this.clearTimers();
    const minutes = this.tripMinutes();
    const arrival = new Date(Date.now() + minutes * 60000);
    this.setLiveHeader({
      eyebrow: 'Viaje en curso',
      tone: 'ontrip',
      title: `Llegada en ${minutes} min`,
      sub: `${this.trip.destination} · llegas a las ${formatTime(arrival)}`,
    });
    this.setProgress(0);
    this.renderActions([
      { icon: ICONS.share, label: 'Compartir viaje', variant: 'secondary', onClick: (button) => this.demoShare(button) },
    ]);
    this.liveMap.showRoute(this.originPoint(), this.destinationPoint(), 'destination');
    this.liveMap.animateCar(
      DEMO_TIMING.tripInProgressMs,
      (progress) => {
        this.setProgress(progress);
        const left = Math.max(1, Math.ceil(minutes * (1 - progress)));
        this.$('#live-title').textContent = progress < 0.97 ? `Llegada en ${left} min` : 'Llegando a tu destino…';
      },
      () => this.completeTrip()
    );
    this.callbacks.onTripStarted?.(this.trip);
  }

  // ---------- Paso 4: viaje finalizado y calificación ----------

  completeTrip() {
    const type = this.selectedRideType();
    this.$('#rating-title').textContent = `Llegaste a ${this.trip.destination}`;
    const total = this.trip.usedTicket ? `Gratis (${currency.format(this.priceFor(type))} cubierto)` : currency.format(this.priceFor(type));
    this.$('#rating-sub').textContent =
      `Total ${total} · ${this.trip.payment} · ${this.trip.distanceKm.toFixed(1)} km · ${this.tripMinutes()} min`;
    this.$('#rating-question').textContent = `¿Cómo estuvo tu viaje con ${this.driver.name.split(' ')[0]}?`;
    this.rating = { stars: 0, tip: 0 };
    this.renderStars();
    this.setTip(0);

    // El premio lo decide quien escucha (el personaje); aquí solo se muestra
    const reward = this.callbacks.onTripCompleted?.(this.trip);
    const note = this.$('#reward-note');
    note.hidden = !reward;
    if (reward) note.textContent = `${reward.type.emoji} Ganaste ${reward.type.label.toLowerCase()} (+${reward.points} pts). Arrástralo hasta tu personaje.`;
    this.showStep('rating');
  }

  renderStars() {
    this.$('#rating-stars').replaceChildren(
      ...[1, 2, 3, 4, 5].map((value) => {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'rating-star';
        star.role = 'radio';
        star.setAttribute('aria-label', `${value} estrella${value > 1 ? 's' : ''}`);
        star.setAttribute('aria-checked', String(value === this.rating.stars));
        star.classList.toggle('is-on', value <= this.rating.stars);
        star.innerHTML = ICONS.star;
        star.addEventListener('click', () => {
          this.rating.stars = value;
          this.renderStars();
          this.tick();
        });
        return star;
      })
    );
    const submit = this.$('#submit-rating');
    submit.disabled = this.rating.stars === 0;
    submit.textContent = this.rating.stars === 0 ? 'Califica tu viaje' : 'Enviar calificación';
  }

  setTip(tip) {
    this.rating.tip = tip;
    this.root.querySelectorAll('.tip-option').forEach((option) => {
      option.setAttribute('aria-checked', String(Number(option.dataset.tip) === tip));
    });
  }

  submitRating() {
    if (this.rating.stars === 0) return;
    this.callbacks.onTripRated?.({ ...this.rating, driver: this.driver });
    this.reset();
  }

  // ---------- Utilidades ----------

  // Sonido corto de selección
  tick() {
    this.callbacks.onTick?.();
  }

  /** Muestra solo el paso indicado del flujo. */
  showStep(step) {
    this.root.querySelectorAll('.trip-step').forEach((element) => {
      element.hidden = element.dataset.step !== step;
    });
    this.root.scrollTop = 0;
  }

  setLiveHeader({ eyebrow, title, sub, tone = 'enroute', timer = false }) {
    const eyebrowElement = this.$('#live-eyebrow');
    eyebrowElement.textContent = eyebrow;
    this.$('[data-step="live"]').dataset.tone = tone;
    // Reinicia la animación de entrada del encabezado en cada cambio de fase
    const head = eyebrowElement.parentElement;
    head.classList.remove('is-changing');
    void head.offsetWidth;
    head.classList.add('is-changing');
    const titleElement = this.$('#live-title');
    titleElement.textContent = title;
    titleElement.classList.toggle('status-head__title--timer', timer);
    this.$('#live-sub').textContent = sub;
  }

  // Barra de progreso del viaje en curso (null = oculta)
  setProgress(progress) {
    const bar = this.$('#live-progress');
    bar.hidden = progress === null;
    if (progress !== null) this.$('#live-progress-fill').style.width = `${Math.round(progress * 100)}%`;
  }

  // Arma los botones de la fase actual
  renderActions(actions) {
    this.$('#live-actions').replaceChildren(
      ...actions.map(({ label, icon, variant, disabled, onClick }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${variant}-button`;
        button.disabled = Boolean(disabled);
        button.innerHTML = `${icon ?? ''}<span></span>`;
        button.querySelector('span').textContent = label;
        if (onClick) button.addEventListener('click', () => onClick(button));
        return button;
      })
    );
  }

  // Llamar / mensaje en la demo: solo muestran un aviso breve en el subtítulo
  demoContact(message) {
    const sub = this.$('#live-sub');
    const previous = sub.textContent;
    sub.textContent = `${message} (demo)`;
    setTimeout(() => {
      if (sub.textContent.endsWith('(demo)')) sub.textContent = previous;
    }, 1800);
  }

  demoShare(button) {
    const label = button.querySelector('span');
    label.textContent = 'Enlace copiado';
    setTimeout(() => (label.textContent = 'Compartir viaje'), 1800);
  }

  later(callback, ms) {
    this.timers.push(setTimeout(callback, ms));
  }

  interval(callback, ms) {
    this.timers.push(setInterval(callback, ms));
  }

  clearTimers() {
    for (const id of this.timers) {
      clearTimeout(id);
      clearInterval(id);
    }
    this.timers = [];
  }

  cancelTrip() {
    this.clearTimers();
    // Si el viaje se iba a pagar con boleto, se devuelve
    if (this.trip.usedTicket) {
      this.freeRides += 1;
      this.trip.usedTicket = false;
    }
    this.updateTicketOption();
    this.searchMap.stop();
    this.liveMap.stop();
    this.showStep('form');
    this.callbacks.onTripCancelled?.();
  }

  // Deja el formulario listo para un nuevo viaje (sin destino ni tipo de viaje elegido)
  reset() {
    this.clearTimers();
    this.liveMap.stop();
    this.$('#trip-destination').value = '';
    this.trip.rideTypeId = null;
    this.trip.usedTicket = false;
    this.fillField('origin', '');
    this.setActiveField(null);
    this.updateTicketOption();
    this.setDestination('');
    this.showStep('form');
  }
}

/** Distancia simulada (3 a 18 km) derivada del texto del destino, para que el precio sea estable. */
function estimateDistanceKm(destination) {
  let hash = 0;
  for (const char of destination.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  return 3 + (hash % 150) / 10;
}

function formatClock(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatTime(date) {
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
