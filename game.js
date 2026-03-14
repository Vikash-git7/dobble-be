/**
 * Game Engine for Dobble Online
 * Manages rooms, players, game state, and scoring.
 */

const { getFullDeck } = require('./cards');

class GameEngine {
  constructor() {
    // roomCode -> Room object
    this.rooms = new Map();
  }

  /**
   * Generate a random 4-character room code
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Create a new room
   */
  createRoom(hostId, hostName) {
    const code = this.generateRoomCode();
    const room = {
      code,
      hostId,
      players: [{
        id: hostId,
        name: hostName,
        color: this.getPlayerColor(0),
        isHost: true,
        score: 0,
        card: null,
        connected: true
      }],
      state: 'lobby', // lobby | countdown | playing | finished
      centralPile: [],
      currentCentralCard: null,
      deck: null,
      roundWinner: null,
      countdown: 5
    };
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Join an existing room
   */
  joinRoom(roomCode, playerId, playerName) {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.state !== 'lobby') return { error: 'Game already in progress' };
    if (room.players.length >= 8) return { error: 'Room is full (max 8 players)' };
    if (room.players.find(p => p.id === playerId)) return { error: 'Already in room' };

    const player = {
      id: playerId,
      name: playerName,
      color: this.getPlayerColor(room.players.length),
      isHost: false,
      score: 0,
      card: null,
      connected: true
    };
    room.players.push(player);
    return { room };
  }

  /**
   * Remove a player from a room
   */
  removePlayer(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    room.players = room.players.filter(p => p.id !== playerId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      return { deleted: true };
    }

    // If host left, assign new host
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }

    return { room };
  }

  /**
   * Start the game - shuffle deck and distribute cards
   */
  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.players.length < 2) return { error: 'Need at least 2 players' };

    // Generate and shuffle deck
    const deck = getFullDeck();
    this.shuffleArray(deck);

    // Regenerate random sizes/rotations for each card's symbols
    deck.forEach(card => {
      card.symbols.forEach(sym => {
        sym.size = 28 + Math.floor(Math.random() * 24);
        sym.rotation = Math.floor(Math.random() * 360);
      });
    });

    // Deal one card to each player
    room.players.forEach((player, index) => {
      player.card = deck[index];
      player.score = 0;
    });

    // Remaining cards form the central pile
    room.centralPile = deck.slice(room.players.length);
    room.currentCentralCard = room.centralPile.pop();
    room.state = 'countdown';
    room.deck = deck;
    room.roundWinner = null;

    return { room };
  }

  /**
   * Check if a player's selected symbol matches the central card
   */
  checkMatch(roomCode, playerId, symbolId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing') return { error: 'Game not active' };

    const player = room.players.find(p => p.id === playerId);
    if (!player || !player.card) return { error: 'Player not found or no card' };

    // Check if the selected symbol exists on both player's card and central card
    const playerHasSymbol = player.card.symbols.some(s => s.id === symbolId);
    const centralHasSymbol = room.currentCentralCard.symbols.some(s => s.id === symbolId);

    if (playerHasSymbol && centralHasSymbol) {
      // Correct match!
      player.score++;

      // Player's old card goes to their collection (scored)
      // Central card becomes player's new top card
      const oldPlayerCard = player.card;
      player.card = room.currentCentralCard;

      // Regenerate random sizes/rotations for the new card
      player.card.symbols.forEach(sym => {
        sym.size = 28 + Math.floor(Math.random() * 24);
        sym.rotation = Math.floor(Math.random() * 360);
      });

      // Reveal next central card
      if (room.centralPile.length > 0) {
        room.currentCentralCard = room.centralPile.pop();
        // Regenerate visual variety for new central card
        room.currentCentralCard.symbols.forEach(sym => {
          sym.size = 28 + Math.floor(Math.random() * 24);
          sym.rotation = Math.floor(Math.random() * 360);
        });
        room.roundWinner = { playerId, playerName: player.name, symbolId };
      } else {
        // Game over!
        room.state = 'finished';
        room.currentCentralCard = null;
      }

      return {
        correct: true,
        player,
        room,
        gameOver: room.state === 'finished'
      };
    }

    // Wrong match
    return {
      correct: false,
      error: 'No match! That symbol is not on both cards.'
    };
  }

  /**
   * Get final scores sorted by rank
   */
  getScores(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return [];

    return [...room.players]
      .sort((a, b) => b.score - a.score)
      .map((p, index) => ({
        rank: index + 1,
        name: p.name,
        score: p.score,
        color: p.color,
        isWinner: index === 0
      }));
  }

  /**
   * Find which room a player is in
   */
  findPlayerRoom(playerId) {
    for (const [code, room] of this.rooms) {
      if (room.players.some(p => p.id === playerId)) {
        return code;
      }
    }
    return null;
  }

  /**
   * Get player color based on index
   */
  getPlayerColor(index) {
    const colors = [
      '#00D4FF', // cyan
      '#FF6B9D', // pink
      '#C084FC', // purple
      '#34D399', // green
      '#FBBF24', // yellow
      '#F97316', // orange
      '#EF4444', // red
      '#60A5FA', // blue
    ];
    return colors[index % colors.length];
  }

  /**
   * Fisher-Yates shuffle
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

module.exports = GameEngine;
