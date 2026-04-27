import Stockfish from 'stockfish';

function scoreMove(evalLoss) {
  if (evalLoss <= 20) return 10;
  if (evalLoss <= 50) return 9;
  if (evalLoss <= 100) return 8;
  if (evalLoss <= 200) return 6;
  if (evalLoss <= 400) return 4;
  return 2;
}

function labelMove(score) {
  if (score >= 10) return 'Best move';
  if (score >= 8) return 'Good move';
  if (score >= 6) return 'Inaccuracy';
  if (score >= 4) return 'Mistake';
  return 'Blunder';
}

function parseEval(line) {
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);

  if (mateMatch) {
    const mate = Number(mateMatch[1]);
    return mate > 0 ? 100000 - mate : -100000 - mate;
  }

  if (cpMatch) return Number(cpMatch[1]);

  return null;
}

export function analyzeMove({ fenBefore, fenAfter, userMoveUci, depth = 12 }) {
  return new Promise((resolve) => {
    const engine = Stockfish();

    let bestMove = null;
    let evalBefore = null;
    let evalAfter = null;
    let phase = 'before';

    const cleanup = () => {
      try {
        engine.postMessage('quit');
        engine.terminate?.();
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        bestMove: bestMove || null,
        moveScore: 5,
        coachMessage: 'Analysis timed out, but your move was saved.'
      });
    }, 12000);

    engine.onmessage = (event) => {
      const line = String(event.data || '');

      if (line.startsWith('info') && line.includes('score')) {
        const parsed = parseEval(line);
        if (parsed !== null) {
          if (phase === 'before') evalBefore = parsed;
          if (phase === 'after') evalAfter = parsed;
        }
      }

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const move = parts[1];

        if (phase === 'before') {
          bestMove = move;
          phase = 'after';

          engine.postMessage(`position fen ${fenAfter}`);
          engine.postMessage(`go depth ${depth}`);
          return;
        }

        clearTimeout(timeout);

        let evalLoss = 0;

        if (evalBefore !== null && evalAfter !== null) {
          evalLoss = Math.max(0, evalBefore - evalAfter);
        }

        const moveScore = scoreMove(evalLoss);
        const label = labelMove(moveScore);

        const coachMessage =
          bestMove === userMoveUci
            ? `Perfect. That was the engine's best move.`
            : `${label}. Best move was ${bestMove}. Your move lost about ${evalLoss} centipawns.`;

        cleanup();

        resolve({
          bestMove,
          moveScore,
          coachMessage
        });
      }
    };

    engine.postMessage('uci');
    engine.postMessage('isready');
    engine.postMessage(`position fen ${fenBefore}`);
    engine.postMessage(`go depth ${depth}`);
  });
}
