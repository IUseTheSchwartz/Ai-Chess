import { Chess } from 'chess.js';

const STOCKFISH_PATHS = [
  '/stockfish/stockfish.js',
  '/stockfish.js'
];

const OPENINGS = [
  { name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { name: 'Sicilian Defense', moves: ['e4', 'c5'] },
  { name: 'French Defense', moves: ['e4', 'e6'] },
  { name: 'Caro-Kann Defense', moves: ['e4', 'c6'] },
  { name: 'Pirc Defense', moves: ['e4', 'd6'] },
  { name: 'Queen’s Gambit', moves: ['d4', 'd5', 'c4'] },
  { name: 'Queen’s Gambit Declined', moves: ['d4', 'd5', 'c4', 'e6'] },
  { name: 'Queen’s Gambit Accepted', moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { name: 'London System', moves: ['d4', 'd5', 'Bf4'] },
  { name: 'King’s Indian Defense', moves: ['d4', 'Nf6', 'c4', 'g6'] },
  { name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { name: 'English Opening', moves: ['c4'] },
  { name: 'Réti Opening', moves: ['Nf3', 'd5', 'c4'] }
];

let enginePromise = null;

function normalizeMove(move) {
  return String(move || '')
    .replace(/[+#?!]/g, '')
    .trim();
}

function getOpeningNameFromSan(sanMoves = []) {
  const cleanHistory = sanMoves.map(normalizeMove);

  let bestMatch = null;

  for (const opening of OPENINGS) {
    const cleanOpening = opening.moves.map(normalizeMove);
    const matches = cleanOpening.every((move, index) => cleanHistory[index] === move);

    if (matches) {
      if (!bestMatch || cleanOpening.length > bestMatch.moves.length) {
        bestMatch = opening;
      }
    }
  }

  return bestMatch?.name || 'Unknown / custom opening';
}

export function detectOpeningFromFen(fen) {
  try {
    const chess = new Chess(fen);
    return getOpeningNameFromSan(chess.history());
  } catch {
    return 'Unknown / custom opening';
  }
}

function getMaterialScore(chess) {
  const values = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0
  };

  let score = 0;
  const board = chess.board();

  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = values[piece.type] || 0;
      score += piece.color === 'w' ? value : -value;
    }
  }

  return score;
}

function fallbackBestMove(fenBefore) {
  const chess = new Chess(fenBefore);
  const moves = chess.moves({ verbose: true });

  let best = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const copy = new Chess(fenBefore);
    copy.move(move);

    let score = 0;

    if (copy.isCheckmate()) score += 100000;
    if (copy.isCheck()) score += 700;
    if (move.captured) score += 500;
    if (move.promotion) score += 800;

    score += copy.turn() === 'b' ? getMaterialScore(copy) : -getMaterialScore(copy);

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  if (!best) return null;
  return `${best.from}${best.to}${best.promotion || ''}`;
}

async function createStockfishEngine() {
  if (enginePromise) return enginePromise;

  enginePromise = new Promise((resolve) => {
    let resolved = false;

    function finish(engine) {
      if (resolved) return;
      resolved = true;
      resolve(engine);
    }

    try {
      if (typeof Worker === 'undefined') {
        finish(null);
        return;
      }

      let worker = null;

      for (const path of STOCKFISH_PATHS) {
        try {
          worker = new Worker(path);
          break;
        } catch {
          worker = null;
        }
      }

      if (!worker) {
        finish(null);
        return;
      }

      worker.onerror = () => finish(null);

      worker.postMessage('uci');

      const timeout = setTimeout(() => finish(null), 1500);

      worker.onmessage = (event) => {
        const text = String(event.data || '');

        if (text.includes('uciok')) {
          clearTimeout(timeout);
          finish(worker);
        }
      };
    } catch {
      finish(null);
    }
  });

  return enginePromise;
}

async function getStockfishBestMove(fen, depth = 12) {
  const engine = await createStockfishEngine();

  if (!engine) {
    return null;
  }

  return new Promise((resolve) => {
    let done = false;

    function finish(bestMove) {
      if (done) return;
      done = true;
      engine.removeEventListener?.('message', handleMessage);
      resolve(bestMove || null);
    }

    function handleMessage(event) {
      const text = String(event.data || '');

      if (text.startsWith('bestmove')) {
        const parts = text.split(' ');
        finish(parts[1] && parts[1] !== '(none)' ? parts[1] : null);
      }
    }

    const timeout = setTimeout(() => finish(null), 5000);

    engine.addEventListener?.('message', handleMessage);

    engine.postMessage('ucinewgame');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);

    const originalFinish = finish;
    finish = (bestMove) => {
      clearTimeout(timeout);
      originalFinish(bestMove);
    };
  });
}

function scoreMoveFromBest({ userMoveUci, bestMove, fenBefore, fenAfter }) {
  if (!bestMove) return 6;
  if (userMoveUci === bestMove) return 10;

  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);
  const legalMoves = before.moves({ verbose: true });
  const played = after.history({ verbose: true }).at(-1);

  if (after.isCheckmate()) return 10;
  if (played?.captured && after.isCheck()) return 8;
  if (played?.captured) return 7;
  if (after.isCheck()) return 7;
  if (legalMoves.length <= 10) return 5;

  return 6;
}

function moveToSan(fenBefore, uci) {
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || 'q'
    });

    return move?.san || uci;
  } catch {
    return uci;
  }
}

function buildCoachMessage({ moveScore, bestMove, userMoveUci, fenBefore, openingName }) {
  const bestMoveSan = bestMove ? moveToSan(fenBefore, bestMove) : null;
  const userMoveSan = userMoveUci ? moveToSan(fenBefore, userMoveUci) : null;

  if (bestMove && bestMove === userMoveUci) {
    return `Excellent move. ${userMoveSan} matched the engine’s top choice. Opening: ${openingName}.`;
  }

  if (moveScore >= 8) {
    return `Good move. ${userMoveSan} was strong, but the engine preferred ${bestMoveSan}. Opening: ${openingName}.`;
  }

  if (moveScore >= 6) {
    return `Playable move. ${userMoveSan} is okay, but ${bestMoveSan} looked cleaner. Opening: ${openingName}.`;
  }

  return `This may be inaccurate or risky. The engine preferred ${bestMoveSan}. Opening: ${openingName}.`;
}

export async function analyzeMove({
  fenBefore,
  fenAfter,
  userMoveUci,
  depth = 12
}) {
  const afterGame = new Chess(fenAfter);
  const openingName = getOpeningNameFromSan(afterGame.history());

  let bestMove = await getStockfishBestMove(fenBefore, depth);

  if (!bestMove) {
    bestMove = fallbackBestMove(fenBefore);
  }

  const moveScore = scoreMoveFromBest({
    userMoveUci,
    bestMove,
    fenBefore,
    fenAfter
  });

  const coachMessage = buildCoachMessage({
    moveScore,
    bestMove,
    userMoveUci,
    fenBefore,
    openingName
  });

  return {
    bestMove,
    bestMoveSan: bestMove ? moveToSan(fenBefore, bestMove) : null,
    moveScore,
    coachMessage,
    openingName
  };
}
