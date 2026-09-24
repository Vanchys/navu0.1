// Paneles desplegables del cuadro del personaje: Historia (lore) y Oráculo (frase al azar al abrirse).
// El contenido viene de la ficha del personaje: manifest.lore y manifest.oracles.

const $ = (id) => document.getElementById(id);

export class CharacterInfo {
  constructor() {
    this.container = $('stage-top');
    this.panels = {
      lore: { toggle: $('lore-toggle'), panel: $('lore-panel') },
      oracle: { toggle: $('oracle-toggle'), panel: $('oracle-panel') },
    };
    this.oracles = [];
    this.lastOracleIndex = -1;
    this.bindEvents();
  }

  bindEvents() {
    for (const [name, { toggle }] of Object.entries(this.panels)) {
      toggle.addEventListener('click', () => this.toggle(name));
    }
    // Tocar fuera de los botones y paneles (por ejemplo, la escena) los cierra
    document.addEventListener('pointerdown', (event) => {
      if (!this.container.contains(event.target)) this.closeAll();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeAll();
    });
  }

  /** Carga la historia y los oráculos del personaje actual. */
  setCharacter(manifest) {
    const lore = manifest.lore ?? { title: 'Historia', paragraphs: ['Este personaje todavía no tiene historia.'] };
    $('lore-title').textContent = lore.title;
    $('lore-body').replaceChildren(
      ...lore.paragraphs.map((text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        return paragraph;
      })
    );
    this.oracles = manifest.oracles ?? [];
    this.lastOracleIndex = -1;
    this.closeAll();
  }

  // Abre el panel pedido y cierra el otro; si ya estaba abierto, lo cierra
  toggle(name) {
    const isOpen = this.panels[name].toggle.getAttribute('aria-expanded') === 'true';
    this.closeAll();
    if (isOpen) return;
    if (name === 'oracle') this.showRandomOracle();
    this.setOpen(name, true);
  }

  setOpen(name, open) {
    const { toggle, panel } = this.panels[name];
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    // Cada vez que se abre, la historia empieza desde arriba
    if (open) panel.scrollTop = 0;
  }

  closeAll() {
    for (const name of Object.keys(this.panels)) this.setOpen(name, false);
  }

  // Elige una frase al azar distinta a la última que se mostró
  showRandomOracle() {
    const text = $('oracle-text');
    if (this.oracles.length === 0) {
      text.textContent = 'Los circuitos del oráculo están descansando. Vuelve más tarde.';
      return;
    }
    let index = Math.floor(Math.random() * this.oracles.length);
    if (this.oracles.length > 1 && index === this.lastOracleIndex) index = (index + 1) % this.oracles.length;
    this.lastOracleIndex = index;
    text.textContent = this.oracles[index];
  }
}
