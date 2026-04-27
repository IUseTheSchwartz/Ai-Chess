import { Chess } from 'chess.js';

const STOCKFISH_PATHS = ['/stockfish/stockfish.js', '/stockfish.js'];

const OPENINGS = [
  {
    name: 'Ruy Lopez',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    idea: 'White develops quickly, attacks the knight defending e5, and prepares to castle.'
  },
  {
    name: 'Italian Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    idea: 'White develops toward the weak f7 square and prepares quick castling.'
  },
  {
    name: 'Scotch Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'],
    idea: 'White opens the center early and tries to create active piece play.'
  },
  {
    name: 'Four Knights Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'],
    idea: 'Both sides develop naturally and fight for central control.'
  },
  {
    name: 'Sicilian Defense',
    moves: ['e4', 'c5'],
    idea: 'Black fights for the center from the side and creates an unbalanced game.'
  },
  {
    name: 'French Defense',
    moves: ['e4', 'e6'],
    idea: 'Black prepares d5 and builds a strong central pawn structure.'
  },
  {
    name: 'Caro-Kann Defense',
    moves: ['e4', 'c6'],
    idea: 'Black prepares d5 while keeping a solid pawn structure.'
  },
  {
    name: 'Pirc Defense',
    moves: ['e4', 'd6'],
    idea: 'Black lets White build the center, then attacks it later with pieces and pawns.'
  },
  {
    name: 'Queen’s Gambit',
    moves: ['d4', 'd5', 'c4'],
    idea: 'White offers a wing pawn to pressure Black’s center.'
  },
  {
    name: 'Queen’s Gambit Declined',
    moves: ['d4', 'd5', 'c4', 'e6'],
    idea: 'Black keeps the center solid instead of taking the pawn.'
  },
  {
    name: 'Queen’s Gambit Accepted',
    moves: ['d4', 'd5', 'c4', 'dxc4'],
    idea: 'Black accepts the pawn but must be careful not to fall behind in development.'
  },
  {
    name: 'London System',
    moves: ['d4', 'd5', 'Bf4'],
    idea: 'White builds a simple, solid setup with fast development.'
  },
  {
    name: 'King’s Indian Defense',
    moves: ['d4', 'Nf6', 'c4', 'g6'],
    idea: 'Black lets White take space, then attacks the center later.'
  },
  {
    name: 'Nimzo-Indian Defense',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
    idea: 'Black pins the knight and fights for control of e4.'
  },
  {
    name: 'English Opening',
    moves: ['c4'],
    idea: 'White controls d5 from the side and often creates flexible queenside pressure.'
  },
  {
    name: 'Réti Opening',
    moves: ['Nf3', 'd5', 'c4'],
    idea: 'White delays central pawns and pressures Black’s center from a distance.'
  }
];

let enginePromise = null;

function normalizeMove(move) {
  return String(move || '')
    .replace(/[+#?!]/g, '')
    .trim();
}

function uciToMoveObject(uci) {
  if (!uci || uci.length < 4) return null;

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || undefined
  };
}

function getOpeningFromSan(sanMoves = []) {
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

  return bestMatch || {
    name: 'Unknown / custom opening',
    moves: [],
    idea: 'No known opening line was matched yet. Focus on center control, development, king safety, and avoiding loose pieces.'
  };
}

export function detectOpeningFromHistory(sanMoves = []) {
  return getOpeningFromSan(sanMoves).name;
}

export function detectOpeningFromFen() {
  return 'Unknown / custom opening';
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

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = values[piece.type] || 0;
      score += piece.color === 'w' ? value : -value;
    }
  }

  return score;
}

function evaluateSimplePosition(chess, perspectiveColor) {
  const material = getMaterialScore(chess);
  const perspectiveMultiplier = perspectiveColor === 'w' ? 1 : -1;

  let score = material * perspectiveMultiplier;

  if (chess.isCheckmate()) score -= 100000;
  if (chess.isCheck()) score -= 35;

  const legalMoves = chess.moves({ verbose: true });
  score += legalMoves.length * 2;

  return score;
}

function fallbackBestMove(fenBefore) {
  const chess = new Chess(fenBefore);
  const moves = chess.moves({ verbose: true });

  if (!moves.length) return null;

  const color = chess.turn();

  let best = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const copy = new Chess(fenBefore);
    copy.move(move);

    let score = evaluateSimplePosition(copy, color);

    if (copy.isCheckmate()) score += 100000;
    if (copy.isCheck()) score += 80;
    if (move.captured) score += 80;
    if (move.promotion) score += 600;

    const centerSquares = ['d4', 'e4', 'd5', 'e5'];
    if (centerSquares.includes(move.to)) score += 25;

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

      const timeout = setTimeout(() => finish(null), 2500);

      worker.onerror = () => {
        clearTimeout(timeout);
        finish(null);
      };

      worker.onmessage = (event) => {
        const text = String(event.data || '');

        if (text.includes('uciok')) {
          clearTimeout(timeout);
          finish(worker);
        }
      };

      worker.postMessage('uci');
    } catch {
      finish(null);
    }
  });

  return enginePromise;
}

async function getStockfishAnalysis(fen, depth = 12) {
  const engine = await createStockfishEngine();

  if (!engine) {
    return {
      bestMove: null,
      scoreCp: null,
      mate: null
    };
  }

  return new Promise((resolve) => {
    let done = false;
    let latestScoreCp = null;
    let latestMate = null;

    function cleanup() {
      engine.removeEventListener?.('message', handleMessage);
    }

    function finish(payload) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      cleanup();
      resolve(payload);
    }

    function handleMessage(event) {
      const text = String(event.data || '');

      const cpMatch = text.match(/score cp (-?\d+)/);
      const mateMatch = text.match(/score mate (-?\d+)/);

      if (cpMatch) {
        latestScoreCp = Number(cpMatch[1]);
        latestMate = null;
      }

      if (mateMatch) {
        latestMate = Number(mateMatch[1]);
      }

      if (text.startsWith('bestmove')) {
        const parts = text.split(' ');
        finish({
          bestMove: parts[1] && parts[1] !== '(none)' ? parts[1] : null,
          scoreCp: latestScoreCp,
          mate: latestMate
        });
      }
    }

    const timeout = setTimeout(() => {
      finish({
        bestMove: null,
        scoreCp: latestScoreCp,
        mate: latestMate
      });
    }, Math.max(4500, depth * 500));

    engine.addEventListener?.('message', handleMessage);

    engine.postMessage('ucinewgame');
    engine.postMessage('isready');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);
  });
}

export async function getBestMove(fen, depth = 12) {
  const analysis = await getStockfishAnalysis(fen, depth);
  return analysis.bestMove || fallbackBestMove(fen);
}

function getDepthForRating(rating) {
  if (rating >= 2200) return 16;
  if (rating >= 1800) return 14;
  if (rating >= 1400) return 12;
  if (rating >= 1000) return 9;
  return 7;
}

function getMistakeChanceForRating(rating) {
  if (rating >= 2200) return 0.03;
  if (rating >= 1800) return 0.08;
  if (rating >= 1400) return 0.16;
  if (rating >= 1000) return 0.28;
  return 0.42;
}

function chooseHumanLikeFallbackMove(fen, rating) {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });

  if (!legalMoves.length) return null;

  const color = chess.turn();

  const scored = legalMoves.map((move) => {
    const copy = new Chess(fen);
    copy.move(move);

    let score = evaluateSimplePosition(copy, color);

    if (copy.isCheckmate()) score += 100000;
    if (copy.isCheck()) score += 120;
    if (move.captured) score += 90;
    if (move.promotion) score += 700;

    if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) score += 30;

    return {
      move,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const poolSize = rating >= 1600 ? 2 : rating >= 1100 ? 4 : 7;
  const pool = scored.slice(0, Math.min(poolSize, scored.length));

  return pool[Math.floor(Math.random() * pool.length)]?.move || scored[0]?.move || null;
}

export async function getBotMove({ fen, rating = 800 }) {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });

  if (!legalMoves.length) return null;

  const depth = getDepthForRating(Number(rating || 800));
  const mistakeChance = getMistakeChanceForRating(Number(rating || 800));

  const bestMoveUci = await getBestMove(fen, depth);

  if (!bestMoveUci || Math.random() < mistakeChance) {
    return chooseHumanLikeFallbackMove(fen, rating);
  }

  const moveObject = uciToMoveObject(bestMoveUci);
  if (!moveObject) return chooseHumanLikeFallbackMove(fen, rating);

  const legal = legalMoves.find(
    (move) =>
      move.from === moveObject.from &&
      move.to === moveObject.to &&
      (move.promotion || '') === (moveObject.promotion || '')
  );

  return legal || chooseHumanLikeFallbackMove(fen, rating);
}

function moveToSan(fenBefore, uci) {
  try {
    if (!uci) return null;

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

function getMoveFeatures({ fenBefore, fenAfter, userMoveUci, bestMove }) {
  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);

  const userSan = moveToSan(fenBefore, userMoveUci);
  const bestSan = moveToSan(fenBefore, bestMove);

  const userMoveObj = uciToMoveObject(userMoveUci);
  const bestMoveObj = uciToMoveObject(bestMove);

  let bestAfter = null;

  if (bestMoveObj) {
    bestAfter = new Chess(fenBefore);
    try {
      bestAfter.move({
        from: bestMoveObj.from,
        to: bestMoveObj.to,
        promotion: bestMoveObj.promotion || 'q'
      });
    } catch {
      bestAfter = null;
    }
  }

  const movedPiece = userMoveObj ? before.get(userMoveObj.from) : null;
  const bestMovedPiece = bestMoveObj ? before.get(bestMoveObj.from) : null;

  const materialBefore = getMaterialScore(before);
  const materialAfter = getMaterialScore(after);
  const materialSwing = Math.abs(materialAfter - materialBefore);

  return {
    userSan,
    bestSan,
    movedPiece,
    bestMovedPiece,
    materialSwing,
    userGivesCheck: after.isCheck(),
    userCheckmate: after.isCheckmate(),
    bestGivesCheck: bestAfter?.isCheck?.() || false,
    bestCheckmate: bestAfter?.isCheckmate?.() || false,
    userLegalReplies: after.moves().length,
    bestLegalReplies: bestAfter?.moves?.().length || null
  };
}

function scoreMoveFromBest({ userMoveUci, bestMove, fenBefore, fenAfter }) {
  if (!bestMove) return 6;
  if (userMoveUci === bestMove) return 10;

  const features = getMoveFeatures({
    fenBefore,
    fenAfter,
    userMoveUci,
    bestMove
  });

  if (features.userCheckmate) return 10;
  if (features.userGivesCheck && features.materialSwing >= 300) return 8;
  if (features.materialSwing >= 500) return 7;
  if (features.userGivesCheck) return 7;

  return 5;
}

function buildWhyMessage({ moveScore, bestMove, userMoveUci, fenBefore, fenAfter, opening }) {
  const features = getMoveFeatures({
    fenBefore,
    fenAfter,
    userMoveUci,
    bestMove
  });

  if (bestMove && bestMove === userMoveUci) {
    return `Excellent move. ${features.userSan} matched the engine’s top choice. In the ${opening.name}, this fits the main idea: ${opening.idea}`;
  }

  const userMoveText = features.userSan || 'your move';
  const bestMoveText = features.bestSan || 'another move';

  const reasons = [];

  if (features.bestCheckmate) {
    reasons.push(`${bestMoveText} had a direct checkmate threat`);
  } else if (features.bestGivesCheck && !features.userGivesCheck) {
    reasons.push(`${bestMoveText} gave check and forced your opponent to respond`);
  }

  if (features.bestLegalReplies !== null && features.bestLegalReplies < features.userLegalReplies) {
    reasons.push(`${bestMoveText} limited your opponent’s replies more than ${userMoveText}`);
  }

  if (features.bestMovedPiece?.type === 'n' || features.bestMovedPiece?.type === 'b') {
    reasons.push(`${bestMoveText} improved piece development`);
  }

  if (features.bestMovedPiece?.type === 'p') {
    const target = bestMove.slice(2, 4);
    if (['d4', 'e4', 'd5', 'e5'].includes(target)) {
      reasons.push(`${bestMoveText} fought for the center`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(`${bestMoveText} created a cleaner position with fewer weaknesses`);
  }

  if (moveScore >= 8) {
    return `Good move. ${userMoveText} was strong, but the engine slightly preferred ${bestMoveText}. Why: ${reasons.join(', ')}. Opening: ${opening.name}.`;
  }

  if (moveScore >= 6) {
    return `Playable move. ${userMoveText} is okay, but ${bestMoveText} looked better. Why: ${reasons.join(', ')}. Opening idea: ${opening.idea}`;
  }

  return `Risky move. ${userMoveText} may give your opponent too much. The better move was ${bestMoveText}. Why: ${reasons.join(', ')}. Opening: ${opening.name}.`;
}

export async function analyzeMove({
  fenBefore,
  fenAfter,
  userMoveUci,
  sanHistory = [],
  depth = 12
}) {
  const opening = getOpeningFromSan(sanHistory);

  const engineAnalysis = await getStockfishAnalysis(fenBefore, depth);
  const bestMove = engineAnalysis.bestMove || fallbackBestMove(fenBefore);

  const moveScore = scoreMoveFromBest({
    userMoveUci,
    bestMove,
    fenBefore,
    fenAfter
  });

  const coachMessage = buildWhyMessage({
    moveScore,
    bestMove,
    userMoveUci,
    fenBefore,
    fenAfter,
    opening
  });

  return {
    bestMove,
    bestMoveSan: bestMove ? moveToSan(fenBefore, bestMove) : null,
    moveScore,
    coachMessage,
    openingName: opening.name,
    openingIdea: opening.idea,
    engineScoreCp: engineAnalysis.scoreCp,
    mate: engineAnalysis.mate
  };
}
