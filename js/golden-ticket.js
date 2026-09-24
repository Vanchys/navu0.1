// Boleto Dorado: premio emergente que el personaje regala al completar su barra de puntos (un viaje gratis).
// El boleto "sale" del cuadro del personaje y vuela al centro de la pantalla.

const $ = (id) => document.getElementById(id);

export class GoldenTicket {
  /** @param onClaim se llama cuando el usuario guarda su boleto */
  constructor(onClaim) {
    this.modal = $('ticket-modal');
    this.ticket = $('golden-ticket');
    this.onClaim = onClaim;
    $('ticket-claim').addEventListener('click', () => this.claim());
  }

  /** Muestra el boleto con el nombre del personaje que lo regala. */
  show(characterName) {
    $('ticket-heading').textContent = `${characterName} te regala un viaje`;
    $('ticket-giver').textContent = `Regalo de ${characterName}`;
    $('ticket-code').textContent = randomCode();
    this.modal.hidden = false;
    this.flyFromCharacter();
  }

  // Animación: el boleto nace pequeño en el cuadro del personaje y vuela girando hasta el centro
  flyFromCharacter() {
    const from = $('character-stage').getBoundingClientRect();
    const to = this.ticket.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    this.ticket.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.15) rotate(-25deg)`, opacity: 0 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(0.8) rotate(8deg)`, opacity: 1, offset: 0.6 },
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      ],
      { duration: 900, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1.1)' }
    );
  }

  claim() {
    this.modal.hidden = true;
    this.onClaim?.();
  }
}

// Código decorativo del boleto (ej. NAVU-7Q2K)
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `NAVU-${code}`;
}
