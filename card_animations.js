// card_animations.js
// Animates card value changes and renders card suits for the War Card Game UI
// Does not interfere with blockchain_stuff.js

(function() {
  // Suits for display (randomly assign for visual effect)
  const suits = ['♠', '♥', '♣', '♦'];
  const redSuits = ['♥', '♦'];

  // Map card value to face
  function getCardFace(val) {
    if (val === 'A' || val === 1 || val === '1') return 'A';
    if (val === 11 || val === 'J') return 'J';
    if (val === 12 || val === 'Q') return 'Q';
    if (val === 13 || val === 'K') return 'K';
    if (typeof val === 'string' && !isNaN(Number(val))) val = Number(val);
    return val ? val.toString() : '';
  }

  // Pick a suit for a card (pseudo-random for demo)
  function pickSuit(cardId, value) {
    // Use cardId ('player-card' or 'house-card') and value to pick suit deterministically
    const idx = (cardId === 'player-card') ? (value % 4) : ((value + 2) % 4);
    return suits[idx];
  }

  // Render the card face and suits
  function renderCard(cardElem, value) {
    // Remove any old suit nodes
    Array.from(cardElem.querySelectorAll('.card-suit, .card-suit-bottom')).forEach(e => e.remove());
    const face = getCardFace(value);
    const suit = pickSuit(cardElem.id, Number(value));
    // Red color for hearts/diamonds
    if (redSuits.includes(suit)) {
      cardElem.classList.add('red');
    } else {
      cardElem.classList.remove('red');
    }
    cardElem.textContent = face;
    // Add suit icons
    const suitTop = document.createElement('span');
    suitTop.className = 'card-suit';
    suitTop.textContent = suit;
    cardElem.appendChild(suitTop);
    const suitBottom = document.createElement('span');
    suitBottom.className = 'card-suit-bottom';
    suitBottom.textContent = suit;
    cardElem.appendChild(suitBottom);
  }

  // Animate the card (flip and pop)
  function animateCard(cardElem) {
    cardElem.classList.add('animate-flip');
    setTimeout(() => {
      cardElem.classList.remove('animate-flip');
      cardElem.classList.add('animate-pop');
      setTimeout(() => cardElem.classList.remove('animate-pop'), 350);
    }, 350);
  }

  // Observe card value changes and animate
  function observeCard(cardId) {
    const cardElem = document.getElementById(cardId);
    if (!cardElem) return;
    let lastValue = cardElem.textContent;
    // Initial render
    renderCard(cardElem, lastValue);
    // Use a MutationObserver to watch for value changes
    const observer = new MutationObserver(() => {
      const newValue = cardElem.textContent;
      if (newValue !== lastValue) {
        renderCard(cardElem, newValue);
        animateCard(cardElem);
        lastValue = newValue;
      }
    });
    observer.observe(cardElem, { childList: true, characterData: true, subtree: true });
  }

  // Wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function() {
    observeCard('player-card');
    observeCard('house-card');
  });
})();
