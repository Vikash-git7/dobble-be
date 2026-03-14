/**
 * Dobble Card Generator
 * Uses finite projective plane of order 7 to generate 57 cards,
 * each with 8 symbols, where any two cards share exactly one symbol.
 */

// 57 easily distinguishable emoji symbols
const SYMBOLS = [
  '🌟', '🎯', '🔥', '🌈', '🎪', '🐉', '🦄', '🎸',
  '🚀', '🌺', '🎭', '🦋', '🍕', '⚡', '🎲', '🎨',
  '🌙', '🎵', '🐬', '🍀', '💎', '🎈', '🦊', '🌻',
  '🎃', '🐧', '🍉', '⭐', '🎹', '🦅', '🌊', '🎠',
  '🍄', '🦁', '🌴', '🎺', '🐝', '🍓', '🦉', '🌵',
  '🎻', '🐙', '🍒', '🦜', '🌸', '🎧', '🐳', '🍩',
  '🦚', '🌽', '🎬', '🐞', '🍋', '🦎', '🌶️', '🎡',
  '🐢'
];

/**
 * Generate a Dobble deck using finite projective plane of prime order n.
 * For n=7: 57 cards, 8 symbols per card, 57 total symbols.
 * Any two cards share exactly one symbol.
 */
function generateDeck(n = 7) {
  const cards = [];

  // Card 0: symbols 0, 1, 2, ..., n
  const card0 = [];
  for (let i = 0; i <= n; i++) {
    card0.push(i);
  }
  cards.push(card0);

  // Cards 1 to n: each card has symbol 0 and n symbols from the grid
  for (let i = 0; i < n; i++) {
    const card = [0];
    for (let j = 0; j < n; j++) {
      card.push(n + 1 + i * n + j);
    }
    cards.push(card);
  }

  // Cards n+1 to n^2+n: using modular arithmetic
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const card = [i + 1];
      for (let k = 0; k < n; k++) {
        card.push(n + 1 + k * n + ((i * k + j) % n));
      }
      cards.push(card);
    }
  }

  return cards;
}

/**
 * Get the full deck with symbol metadata
 */
function getFullDeck() {
  const cards = generateDeck(7);
  return cards.map((symbolIndices, cardIndex) => ({
    id: cardIndex,
    symbols: symbolIndices.map(idx => ({
      id: idx,
      emoji: SYMBOLS[idx],
      // Random size and rotation for visual variety
      size: 28 + Math.floor(Math.random() * 24),
      rotation: Math.floor(Math.random() * 360)
    }))
  }));
}

/**
 * Find the common symbol between two cards (by symbol indices)
 */
function findCommonSymbol(card1Symbols, card2Symbols) {
  const set1 = new Set(card1Symbols.map(s => s.id));
  for (const s of card2Symbols) {
    if (set1.has(s.id)) return s.id;
  }
  return null;
}

/**
 * Verify the deck is valid (any two cards share exactly one symbol)
 */
function verifyDeck() {
  const cards = generateDeck(7);
  let valid = true;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const common = cards[i].filter(s => cards[j].includes(s));
      if (common.length !== 1) {
        console.error(`Cards ${i} and ${j} share ${common.length} symbols: ${common}`);
        valid = false;
      }
    }
  }
  console.log(`Deck verification: ${valid ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Total cards: ${cards.length}`);
  console.log(`Symbols per card: ${cards[0].length}`);
  return valid;
}

module.exports = { generateDeck, getFullDeck, findCommonSymbol, verifyDeck, SYMBOLS };
