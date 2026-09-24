// Barra de puntuación del personaje (muy delgada, hasta abajo de su cuadro).
// Se llena al alimentarlo; al llegar al tope el personaje festeja y la barra vuelve a cero.

export class ScoreBar {
  constructor(element, maxPoints = 5) {
    this.element = element;
    this.maxPoints = maxPoints;
    this.points = 0;
    this.render();
  }

  // Un segmento por punto
  render() {
    this.element.replaceChildren(
      ...Array.from({ length: this.maxPoints }, () => {
        const segment = document.createElement('span');
        segment.className = 'score-bar__segment';
        return segment;
      })
    );
    this.update();
  }

  update() {
    [...this.element.children].forEach((segment, index) => {
      segment.classList.toggle('is-filled', index < this.points);
    });
    this.element.setAttribute('aria-valuenow', String(this.points));
    this.element.title = `Puntos: ${this.points} de ${this.maxPoints}`;
  }

  /** Suma puntos (sin pasar del tope). Devuelve true si la barra quedó llena. */
  add(points) {
    this.points = Math.min(this.maxPoints, this.points + points);
    this.update();
    return this.isFull();
  }

  isFull() {
    return this.points >= this.maxPoints;
  }

  reset() {
    this.points = 0;
    this.update();
  }
}
