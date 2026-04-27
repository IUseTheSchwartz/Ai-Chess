import { Chess } from 'chess.js';

const STOCKFISH_PATH = '/stockfish/stockfish.js';

const OPENINGS = [
  { name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], idea: 'White develops quickly, attacks the knight defending e5, and prepares to castle.' },
  { name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], idea: 'White develops toward f7, builds fast development, and prepares to castle.' },
  { name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], idea: 'White opens the center early and tries to create active piece play.' },
  { name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], idea: 'Both sides develop naturally and fight for central control.' },
  { name: 'Sicilian Defense', moves: ['e4', 'c5'], idea: 'Black fights for the center from the side and creates an unbalanced game.' },
  { name: 'French Defense', moves: ['e4', 'e6'], idea: 'Black prepares d5 and builds a strong central pawn structure.' },
  { name: 'Caro-Kann Defense', moves: ['e4', 'c6'], idea: 'Black prepares d5 while keeping a solid pawn structure.' },
  { name: 'Pirc Defense', moves: ['e4', 'd6'], idea: 'Black lets White build the center, then attacks it later.' },
  { name: 'Queen’s Gambit', moves: ['d4', 'd5', 'c4'], idea: 'White offers a wing pawn to pressure Black’s center.' },
  { name: 'Queen’s Gambit Declined', moves: ['d4', 'd5', 'c4', 'e6'], idea: 'Black keeps the center solid instead of taking the pawn.' },
  { name: 'Queen’s Gambit Accepted', moves: ['d4', 'd5', 'c4', 'dxc4'], idea: 'Black accepts the pawn but must avoid falling behind in development.' },
  { name: 'London System', moves: ['d4', 'd5', 'Bf4'], idea: 'White builds a simple, solid setup with fast development.' },
  { name: 'King’s Indian Defense', moves: ['d4', 'Nf6', 'c4', 'g6'], idea: 'Black lets White take space, then attacks the center later.' },
  { name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], idea: 'Black pins the knight and fights for control of e4.' },
  { name: 'English Opening', moves: ['c4'], idea: 'White controls d5 from the side and creates flexible queenside pressure.' },
  { name: 'Réti Opening', moves: ['Nf3', 'd5', 'c4'], idea: 'White delays central pawns and pressures Black’s center from a distance.' }
];

let enginePromise = null;
let engineReady = false;

function normalizeMove(move) {
  return String(move || '').replace(/[+#?!]/g, '').trim();
}

function getOpeningFromSan(sanMoves = []) {
  const cleanHistory = sanMoves.map(normalizeMove);
  let bestMatch = null;

  for (const opening of OPENINGS) {
    const cleanOpening = opening.moves.map(normalizeMove);
    const matches = cleanOpening.every((move, index) => cleanHistory[index] === move);

    if (matches && (!bestMatch || cleanOpening.length > bestMatch.moves.length)) {
      bestMatch = opening;
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

function uciToMoveObject(uci) {
  if (!uci || uci.length < 4) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || undefined
  };
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

function getMaterialScore(chess) {
  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  let score = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      score += piece.color === 'w' ? values[piece.type] : -values[piece.type];
    }
  }

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

    let score = getMaterialScore(copy) * (color === 'w' ? 1 : -1);
    if (copy.isCheckmate()) score += 100000;
    if (copy.isCheck()) score += 100;
    if (move.captured) score += 100;
    if (move.promotion) score += 700;
    if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) score += 35;

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best ? `${best.from}${best.to}${best.promotion || ''}` : null;
}

function sendAndWait(worker, command, waitFor, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;

    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      worker.removeEventListener?.('message', handleMessage);
      resolve(value);
    }

    function handleMessage(event) {
      const text = String(event.data || '');
      if (waitFor(text)) finish(text);
    }

    const timeout = setTimeout(() => finish(null), timeoutMs);

    worker.addEventListener?.('message', handleMessage);
    worker.postMessage(command);
  });
}

async function createStockfishEngine() {
  if (enginePromise) return enginePromise;

  enginePromise = new Promise((resolve) => {
    try {
      if (typeof Worker === 'undefined') {
        resolve(null);
        return;
      }

      const worker = new Worker(STOCKFISH_PATH);

      const timeout = setTimeout(() => {
        resolve(null);
      }, 6000);

      function handleMessage(event) {
        const text = String(event.data || '');

        if (text.includes('uciok')) {
          worker.removeEventListener?.('message', handleMessage);
          clearTimeout(timeout);
          engineReady = true;
          resolve(worker);
        }
      }

      worker.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      worker.addEventListener?.('message', handleMessage);
      worker.postMessage('uci');
    } catch {
      resolve(null);
    }
  });

  return enginePromise;
}

async function prepareEngine(worker, { rating = null } = {}) {
  if (!worker || !engineReady) return false;

  await sendAndWait(worker, 'isready', (text) => text.includes('readyok'), 4000);

  if (rating) {
    const elo = Math.max(1320, Math.min(3190, Number(rating || 1500)));
    const skill = Math.max(0, Math.min(20, Math.round(((elo - 600) / 1800) * 20)));

    worker.postMessage('setoption name UCI_LimitStrength value true');
    worker.postMessage(`setoption name UCI_Elo value ${elo}`);
    worker.postMessage(`setoption name Skill Level value ${skill}`);
  } else {
    worker.postMessage('setoption name UCI_LimitStrength value false');
    worker.postMessage('setoption name Skill Level value 20');
  }

  await sendAndWait(worker, 'isready', (text) => text.includes('readyok'), 4000);
  return true;
}

async function getStockfishAnalysis(fen, depth = 12, options = {}) {
  const engine = await createStockfishEngine();

  if (!engine) {
    return {
      bestMove: null,
      scoreCp: null,
      mate: null,
      usedEngine: false
    };
  }

  await prepareEngine(engine, options);

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
        latestScoreCp = latestMate > 0 ? 100000 - latestMate : -100000 - latestMate;
      }

      if (text.startsWith('bestmove')) {
        const parts = text.split(' ');
        finish({
          bestMove: parts[1] && parts[1] !== '(none)' ? parts[1] : null,
          scoreCp: latestScoreCp,
          mate: latestMate,
          usedEngine: true
        });
      }
    }

    const timeout = setTimeout(() => {
      finish({
        bestMove: null,
        scoreCp: latestScoreCp,
        mate: latestMate,
        usedEngine: true
      });
    }, Math.max(5000, depth * 650));

    engine.addEventListener?.('message', handleMessage);
    engine.postMessage('ucinewgame');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);
  });
}

function scoreFromWhitePerspective(scoreCp, turn) {
  if (scoreCp === null || scoreCp === undefined) return null;
  return turn === 'w' ? scoreCp : -scoreCp;
}

function getMoveScoreFromEval({ beforeScore, afterScore }) {
  if (beforeScore === null || afterScore === null) return null;

  const loss = beforeScore - afterScore;

  if (loss <= 15) return 10;
  if (loss <= 40) return 9;
  if (loss <= 80) return 8;
  if (loss <= 140) return 7;
  if (loss <= 220) return 6;
  if (loss <= 330) return 5;
  if (loss <= 500) return 4;
  if (loss <= 750) return 3;
  if (loss <= 1100) return 2;
  return 1;
}

function classifyMove(score) {
  if (score >= 10) return 'Excellent';
  if (score >= 9) return 'Great';
  if (score >= 8) return 'Good';
  if (score >= 6) return 'Playable';
  if (score >= 4) return 'Inaccurate';
  if (score >= 2) return 'Mistake';
  return 'Blunder';
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

  return {
    userSan,
    bestSan,
    movedPiece,
    bestMovedPiece,
    materialSwing: Math.abs(materialAfter - materialBefore),
    userGivesCheck: after.isCheck(),
    userCheckmate: after.isCheckmate(),
    bestGivesCheck: bestAfter?.isCheck?.() || false,
    bestCheckmate: bestAfter?.isCheckmate?.() || false,
    userLegalReplies: after.moves().length,
    bestLegalReplies: bestAfter?.moves?.().length ?? null,
    bestTo: bestMove?.slice(2, 4),
    userTo: userMoveUci?.slice(2, 4)
  };
}

function buildCoachMessage({
  moveScore,
  bestMove,
  userMoveUci,
  fenBefore,
  fenAfter,
  opening,
  beforeEval,
  afterEval,
  usedEngine
}) {
  const features = getMoveFeatures({ fenBefore, fenAfter, userMoveUci, bestMove });
  const label = classifyMove(moveScore);
  const userMoveText = features.userSan || 'your move';
  const bestMoveText = features.bestSan || 'the engine move';

  if (bestMove && bestMove === userMoveUci) {
    return `${label}. ${userMoveText} matched Stockfish’s top move. In the ${opening.name}, this fits the main idea: ${opening.idea}`;
  }

  const reasons = [];

  if (!usedEngine) {
    reasons.push('Stockfish did not respond, so this used fallback analysis');
  }

  if (features.bestCheckmate) {
    reasons.push(`${bestMoveText} had a direct checkmate threat`);
  } else if (features.bestGivesCheck && !features.userGivesCheck) {
    reasons.push(`${bestMoveText} gave check and forced a response`);
  }

  if (features.bestLegalReplies !== null && features.bestLegalReplies < features.userLegalReplies) {
    reasons.push(`${bestMoveText} gave your opponent fewer good replies`);
  }

  if (features.bestMovedPiece?.type === 'n' || features.bestMovedPiece?.type === 'b') {
    reasons.push(`${bestMoveText} improved piece development`);
  }

  if (features.bestMovedPiece?.type === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(features.bestTo)) {
    reasons.push(`${bestMoveText} fought for the center`);
  }

  if (beforeEval !== null && afterEval !== null) {
    const loss = Math.round(beforeEval - afterEval);
    if (loss > 80) reasons.push(`your move lost about ${(loss / 100).toFixed(1)} pawns of evaluation`);
    if (loss <= 40) reasons.push('the evaluation barely changed, so your move was still solid');
  }

  if (reasons.length === 0) {
    reasons.push(`${bestMoveText} created a cleaner position with fewer weaknesses`);
  }

  if (moveScore >= 8) {
    return `${label}. ${userMoveText} was strong, but Stockfish slightly preferred ${bestMoveText}. Why: ${reasons.join(', ')}. Opening: ${opening.name}.`;
  }

  if (moveScore >= 6) {
    return `${label}. ${userMoveText} is playable, but ${bestMoveText} looked cleaner. Why: ${reasons.join(', ')}. Opening idea: ${opening.idea}`;
  }

  return `${label}. ${userMoveText} was risky. The better move was ${bestMoveText}. Why: ${reasons.join(', ')}. Opening: ${opening.name}.`;
}

function getDepthForRating(rating) {
  if (rating >= 2400) return 16;
  if (rating >= 2000) return 14;
  if (rating >= 1600) return 12;
  if (rating >= 1200) return 10;
  if (rating >= 800) return 8;
  return 6;
}

function getMistakeChanceForRating(rating) {
  if (rating >= 2400) return 0.01;
  if (rating >= 2000) return 0.04;
  if (rating >= 1600) return 0.09;
  if (rating >= 1200) return 0.18;
  if (rating >= 800) return 0.3;
  return 0.45;
}

function chooseHumanLikeFallbackMove(fen, rating) {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });
  if (!legalMoves.length) return null;

  const color = chess.turn();

  const scored = legalMoves.map((move) => {
    const copy = new Chess(fen);
    copy.move(move);

    let score = getMaterialScore(copy) * (color === 'w' ? 1 : -1);
    if (copy.isCheckmate()) score += 100000;
    if (copy.isCheck()) score += 120;
    if (move.captured) score += 100;
    if (move.promotion) score += 700;
    if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) score += 30;

    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const poolSize = rating >= 1800 ? 2 : rating >= 1200 ? 4 : 7;
  const pool = scored.slice(0, Math.min(poolSize, scored.length));

  return pool[Math.floor(Math.random() * pool.length)]?.move || scored[0]?.move || null;
}

export async function getBestMove(fen, depth = 12) {
  const analysis = await getStockfishAnalysis(fen, depth);
  return analysis.bestMove || fallbackBestMove(fen);
}

export async function getBotMove({ fen, rating = 800 }) {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });
  if (!legalMoves.length) return null;

  const botRating = Number(rating || 800);
  const depth = getDepthForRating(botRating);
  const mistakeChance = getMistakeChanceForRating(botRating);

  const analysis = await getStockfishAnalysis(fen, depth, { rating: botRating });
  const bestMoveUci = analysis.bestMove || fallbackBestMove(fen);

  if (!bestMoveUci || Math.random() < mistakeChance) {
    return chooseHumanLikeFallbackMove(fen, botRating);
  }

  const moveObject = uciToMoveObject(bestMoveUci);
  if (!moveObject) return chooseHumanLikeFallbackMove(fen, botRating);

  const legal = legalMoves.find(
    (move) =>
      move.from === moveObject.from &&
      move.to === moveObject.to &&
      (move.promotion || '') === (moveObject.promotion || '')
  );

  return legal || chooseHumanLikeFallbackMove(fen, botRating);
}

export async function analyzeMove({
  fenBefore,
  fenAfter,
  userMoveUci,
  sanHistory = [],
  depth = 12
}) {
  const opening = getOpeningFromSan(sanHistory);
  const beforeGame = new Chess(fenBefore);
  const playerTurnBefore = beforeGame.turn();

  const beforeAnalysis = await getStockfishAnalysis(fenBefore, depth);
  const bestMove = beforeAnalysis.bestMove || fallbackBestMove(fenBefore);

  const afterAnalysis = await getStockfishAnalysis(fenAfter, Math.max(8, depth - 2));

  const beforeEval = scoreFromWhitePerspective(beforeAnalysis.scoreCp, playerTurnBefore);
  const afterEval = scoreFromWhitePerspective(afterAnalysis.scoreCp, playerTurnBefore);

  let moveScore = getMoveScoreFromEval({
    beforeScore: beforeEval,
    afterScore: afterEval
  });

  if (moveScore === null) {
    moveScore = bestMove && bestMove === userMoveUci ? 10 : 5;
  }

  const coachMessage = buildCoachMessage({
    moveScore,
    bestMove,
    userMoveUci,
    fenBefore,
    fenAfter,
    opening,
    beforeEval,
    afterEval,
    usedEngine: beforeAnalysis.usedEngine && afterAnalysis.usedEngine
  });

  return {
    bestMove,
    bestMoveSan: bestMove ? moveToSan(fenBefore, bestMove) : null,
    moveScore,
    coachMessage,
    openingName: opening.name,
    openingIdea: opening.idea,
    engineScoreCp: beforeAnalysis.scoreCp,
    afterScoreCp: afterAnalysis.scoreCp,
    evalLossCp:
      beforeEval !== null && afterEval !== null ? Math.round(beforeEval - afterEval) : null,
    mate: beforeAnalysis.mate,
    usedEngine: beforeAnalysis.usedEngine && afterAnalysis.usedEngine
  };
}
