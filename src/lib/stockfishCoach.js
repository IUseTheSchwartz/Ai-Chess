import { Chess } from 'chess.js';

function scoreMove({ wasCapture, wasCheck, isMate, legalMoveCount }) {
  if (isMate) return 10;
  if (wasCheck && wasCapture) return 9;
  if (wasCheck) return 8;
  if (wasCapture) return 7;
  if (legalMoveCount > 25) return 6;
  return 5;
}

function getBestSimpleMove(fenBefore) {
  const chess = new Chess(fenBefore);
  const moves = chess.moves({ verbose: true });

  const checks = [];
  const captures = [];

  for (const move of moves) {
    const copy = new Chess(fenBefore);
    copy.move(move);

    if (copy.isCheckmate()) return `${move.from}${move.to}${move.promotion || ''}`;
    if (copy.isCheck()) checks.push(move);
    if (move.captured) captures.push(move);
  }

  const picked = checks[0] || captures[0] || moves[0];

  if (!picked) return null;

  return `${picked.from}${picked.to}${picked.promotion || ''}`;
}

export async function analyzeMove({ fenBefore, fenAfter, userMoveUci }) {
  const beforeGame = new Chess(fenBefore);
  const afterGame = new Chess(fenAfter);

  const legalMoveCount = beforeGame.moves().length;
  const bestMove = getBestSimpleMove(fenBefore);

  const history = afterGame.history({ verbose: true });
  const lastMove = history[history.length - 1];

  const wasCapture = Boolean(lastMove?.captured);
  const wasCheck = afterGame.isCheck();
  const isMate = afterGame.isCheckmate();

  const moveScore = bestMove === userMoveUci
    ? 10
    : scoreMove({ wasCapture, wasCheck, isMate, legalMoveCount });

  const coachMessage =
    bestMove === userMoveUci
      ? 'Excellent move. That matched the coach recommendation.'
      : `Your move was playable. A stronger candidate was ${bestMove}.`;

  await new Promise((resolve) => setTimeout(resolve, 350));

  return {
    bestMove,
    moveScore,
    coachMessage
  };
}
