// Todo lo que toca el DOM: selector de personajes, avisos, pantalla de carga y zona libre del cuadro.

const $ = (id) => document.getElementById(id);

// Margen libre arriba de la cabeza del personaje dentro de su cuadro
const TOP_MARGIN_PX = 14;

export class DashboardUI {
  constructor() {
    this.elements = {
      stage: $('character-stage'),
      stageBar: $('stage-bar'),
      characterName: $('character-name'),
      sheet: $('characters-sheet'),
      characterGrid: $('character-grid'),
      openCharacters: $('open-characters'),
      loader: $('loader'),
      loaderText: $('loader-text'),
    };
    this.bindStaticEvents();
  }

  // Eventos que no dependen de ningún personaje (abrir/cerrar el selector de personajes)
  bindStaticEvents() {
    const { sheet, openCharacters } = this.elements;
    openCharacters.addEventListener('click', () => this.openSheet());
    sheet.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) this.closeSheet();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeSheet();
    });
  }

  /** Deja registrada la animación actual en el cuadro (atributo data-clip, útil para depurar). */
  setActiveClip(clip) {
    this.elements.stage.dataset.clip = clip.id;
  }

  setCharacter(manifest) {
    this.elements.characterName.textContent = manifest.name;
    document.title = manifest.name;
  }

  /** Dibuja las tarjetas del selector de personajes. */
  renderCatalog(entries, currentId, onSelect) {
    this.elements.characterGrid.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'character-card';
        card.setAttribute('aria-current', String(entry.id === currentId));
        card.innerHTML = `<strong></strong><span>${entry.id === currentId ? 'En escena' : 'Toca para cargar'}</span>`;
        card.querySelector('strong').textContent = entry.name;
        card.addEventListener('click', () => {
          this.closeSheet();
          if (entry.id !== currentId) onSelect(entry);
        });
        item.append(card);
        return item;
      })
    );
  }

  openSheet() {
    this.elements.sheet.hidden = false;
  }

  closeSheet() {
    this.elements.sheet.hidden = true;
  }

  /** Muestra un aviso breve en la parte superior del cuadro del personaje. */
  showToast(message) {
    const toast = $('reward-toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  showLoader(message) {
    this.elements.loaderText.textContent = message;
    this.elements.loader.classList.remove('is-hidden');
  }

  hideLoader() {
    this.elements.loader.classList.add('is-hidden');
  }

  /**
   * Zona del cuadro del personaje que no tapa la fila de abajo (nombre y premios).
   * Devuelve su centro y su altura en px, relativos al propio cuadro.
   */
  getFreeArea() {
    const stage = this.elements.stage.getBoundingClientRect();
    const top = TOP_MARGIN_PX;
    const bottom = this.elements.stageBar.getBoundingClientRect().top - stage.top;
    return { x: stage.width / 2, y: (top + bottom) / 2, height: Math.max(bottom - top, 1) };
  }
}
