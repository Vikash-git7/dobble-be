/**
 * Dobble Online - WebSocket Server
 * Express + Socket.io server handling lobby and game events.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const GameEngine = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const game = new GameEngine();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: game.rooms.size });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);

  // ─── CREATE ROOM ───────────────────────────────────────────────
  socket.on('create-room', ({ playerName }) => {
    const room = game.createRoom(socket.id, playerName || 'Host');
    socket.join(room.code);
    socket.roomCode = room.code;

    socket.emit('room-created', {
      roomCode: room.code,
      players: room.players
    });

    console.log(`🏠 Room ${room.code} created by ${playerName}`);
  });

  // ─── JOIN ROOM ─────────────────────────────────────────────────
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const result = game.joinRoom(code, socket.id, playerName || 'Player');

    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }

    socket.join(code);
    socket.roomCode = code;

    socket.emit('room-joined', {
      roomCode: code,
      players: result.room.players
    });

    io.to(code).emit('room-updated', {
      players: result.room.players
    });

    console.log(`👤 ${playerName} joined room ${code}`);
  });

  // ─── START GAME ────────────────────────────────────────────────
  socket.on('start-game', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const room = game.rooms.get(roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }

    const result = game.startGame(roomCode);
    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }

    console.log(`🎮 Game starting in room ${roomCode}`);

    // Countdown sequence
    let countdown = 5;
    io.to(roomCode).emit('game-countdown', { countdown });

    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        io.to(roomCode).emit('game-countdown', { countdown });
      } else {
        clearInterval(countdownInterval);
        room.state = 'playing';

        // Send each player their own card + the central card
        room.players.forEach(player => {
          const playerSocket = io.sockets.sockets.get(player.id);
          if (playerSocket) {
            playerSocket.emit('game-started', {
              yourCard: player.card,
              centralCard: room.currentCentralCard,
              players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                score: p.score,
                isHost: p.isHost,
                isYou: p.id === player.id
              })),
              cardsRemaining: room.centralPile.length
            });
          }
        });

        console.log(`🃏 Game started in room ${roomCode}!`);
      }
    }, 1000);
  });

  // ─── SELECT SYMBOL ─────────────────────────────────────────────
  socket.on('select-symbol', ({ symbolId }) => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const result = game.checkMatch(roomCode, socket.id, symbolId);

    if (result.error && !result.correct && result.correct !== false) {
      socket.emit('error', { message: result.error });
      return;
    }

    if (!result.correct) {
      // Wrong match - notify only the player who guessed
      socket.emit('wrong-match', {
        message: 'Wrong! That symbol is not on both cards.'
      });
      return;
    }

    // Correct match!
    const room = result.room;

    if (result.gameOver) {
      // Game over - send final scores
      const scores = game.getScores(roomCode);
      io.to(roomCode).emit('game-over', {
        scores,
        winner: scores[0],
        lastMatch: {
          playerId: socket.id,
          playerName: result.player.name,
          symbolId
        }
      });
      console.log(`🏆 Game over in room ${roomCode}! Winner: ${scores[0].name}`);
    } else {
      // Send updated state to all players
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('round-result', {
            matchedBy: {
              id: result.player.id,
              name: result.player.name,
              color: result.player.color
            },
            symbolId,
            yourCard: player.card,
            centralCard: room.currentCentralCard,
            players: room.players.map(p => ({
              id: p.id,
              name: p.name,
              color: p.color,
              score: p.score,
              isHost: p.isHost,
              isYou: p.id === player.id
            })),
            cardsRemaining: room.centralPile.length
          });
        }
      });
    }
  });

  // ─── DISCONNECT ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (roomCode) {
      const result = game.removePlayer(roomCode, socket.id);
      if (result && !result.deleted) {
        io.to(roomCode).emit('room-updated', {
          players: result.room.players
        });

        // If game was in progress and not enough players, end it
        if (result.room.state === 'playing' && result.room.players.length < 2) {
          result.room.state = 'finished';
          const scores = game.getScores(roomCode);
          io.to(roomCode).emit('game-over', {
            scores,
            winner: scores[0],
            reason: 'Other players disconnected'
          });
        }
      }
    }
  });

  // ─── PLAY AGAIN ────────────────────────────────────────────────
  socket.on('play-again', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = game.rooms.get(roomCode);
    if (!room) return;

    // Reset game state, keep players
    room.state = 'lobby';
    room.centralPile = [];
    room.currentCentralCard = null;
    room.deck = null;
    room.roundWinner = null;
    room.players.forEach(p => {
      p.score = 0;
      p.card = null;
    });

    io.to(roomCode).emit('back-to-lobby', {
      players: room.players
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎴 Dobble Online Server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}\n`);
});
