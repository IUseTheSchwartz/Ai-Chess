export function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

export function makeInviteCode() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase();
}

export function sideToTurn(side) {
  return side === 'w' ? 'white' : 'black';
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function getGameResult(chess, timedOutSide = null) {
  if (timedOutSide) {
    return {
      status: 'complete',
      reason: `${timedOutSide === 'white' ? 'White' : 'Black'} timed out`,
      winnerSide: timedOutSide === 'white' ? 'black' : 'white'
    };
  }

  if (chess.isCheckmate()) {
    const loserSide = sideToTurn(chess.turn());

    return {
      status: 'complete',
      reason: 'Checkmate',
      winnerSide: loserSide === 'white' ? 'black' : 'white'
    };
  }

  if (chess.isDraw()) {
    return {
      status: 'complete',
      reason: 'Draw',
      winnerSide: null
    };
  }

  return {
    status: 'active',
    reason: null,
    winnerSide: null
  };
}

export function playerName(profile, fallback = 'Unknown player') {
  return profile?.display_name || profile?.username || profile?.email || fallback;
}

export function calculateElo({
  playerRating = 800,
  opponentRating = 800,
  result = 0.5,
  gamesCompleted = 0
}) {
  const k = gamesCompleted < 5 ? 48 : gamesCompleted < 20 ? 32 : 20;
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const next = Math.round(playerRating + k * (result - expected));
  return Math.max(100, Math.min(3200, next));
}

export function ratingLabel(rating, gamesCompleted = 0) {
  if (gamesCompleted < 5) return `Provisional ${rating}`;
  return `${rating}`;
}
