import { Chessboard } from 'react-chessboard';
import { formatClock, playerName as getPlayerName } from '../../lib/chessHelpers';

function getSideName(gameRow, side) {
  if (!gameRow) return side === 'white' ? 'White' : 'Black';

  if (side === 'white') {
    return (
      gameRow.white_profile?.display_name ||
      gameRow.white_profile?.username ||
      gameRow.white_guest_name ||
      'Waiting...'
    );
  }

  return (
    gameRow.black_profile?.display_name ||
    gameRow.black_profile?.username ||
    gameRow.black_guest_name ||
    'Waiting...'
  );
}

export default function GameScreen({
  game,
  gameRow,
  fen,
  status,
  thinking,
  history,
  coach,
  inviteLink,
  mySide,
  isMyTurn,
  isGuest,
  localWhiteTime,
  localBlackTime,
  onPieceDrop
}) {
  const whiteName = getSideName(gameRow, 'white');
  const blackName = getSideName(gameRow, 'black');
  const gameCode = gameRow?.invite_code;

  return (
    <main className="play-layout">
      <section className="board-wrap">
        <div className="board-header">
          <div>
            <h2>{gameRow?.mode === 'friend' ? 'Friend Match' : 'Bot Match'}</h2>
            <p>{status}</p>
          </div>

          <div className="clock-stack">
            <strong>{whiteName}: {formatClock(localWhiteTime)}</strong>
            <strong>{blackName}: {formatClock(localBlackTime)}</strong>
          </div>

          {thinking && <div className="thinking-pill">Thinking...</div>}
        </div>

        {gameRow?.mode === 'friend' && (
          <div className="players-bar">
            <div className={mySide === 'white' ? 'player-chip active' : 'player-chip'}>
              <small>White</small>
              <strong>{whiteName}</strong>
            </div>
            <div className={mySide === 'black' ? 'player-chip active' : 'player-chip'}>
              <small>Black</small>
              <strong>{blackName}</strong>
            </div>
          </div>
        )}

        {gameRow?.status === 'waiting' && (
          <div className="waiting-lobby">
            <div>
              <h3>Waiting for player</h3>
              <p>Share the code or link below. The clock starts after White makes the first move.</p>
            </div>

            <div className="lobby-code-box">
              <small>Game code</small>
              <strong>{gameCode}</strong>
            </div>

            <div className="invite-box">
              <small>Game link</small>
              <p>{inviteLink || `${window.location.origin}?join=${gameRow.invite_code}`}</p>
              <button
                className="soft-btn"
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    inviteLink || `${window.location.origin}?join=${gameRow.invite_code}`
                  )
                }
              >
                Copy Link
              </button>
            </div>
          </div>
        )}

        <div className="chessboard-shell">
          <Chessboard
            id="ChessAI-main-board"
            position={fen}
            onPieceDrop={onPieceDrop}
            boardWidth={620}
            boardOrientation={mySide}
            arePiecesDraggable={
              !thinking &&
              gameRow?.status === 'active' &&
              (gameRow?.mode === 'bot' ? game.turn() === 'w' : isMyTurn)
            }
            customBoardStyle={{
              borderRadius: '18px',
              boxShadow: '0 18px 50px rgba(49, 39, 25, 0.18)'
            }}
            customDarkSquareStyle={{ backgroundColor: '#779556' }}
            customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
          />
        </div>
      </section>

      <aside className="analysis-panel">
        <div className="analysis-card coach">
          <h3>AI Coach</h3>

          {gameRow?.mode === 'friend' ? (
            <p className="muted">
              AI coaching is active for bot games. Friend analysis can be added later.
            </p>
          ) : !coach ? (
            <p className="muted">Make a move to get your first review.</p>
          ) : (
            <>
              <div className="coach-score">{coach.moveScore ? `${coach.moveScore}/10` : '--'}</div>
              <p>{coach.coachMessage}</p>
              {coach.bestMoveSan ? (
                <small>Best move: {coach.bestMoveSan}</small>
              ) : coach.bestMove ? (
                <small>Best move: {coach.bestMove}</small>
              ) : null}
              {coach.openingName && (
                <small style={{ display: 'block' }}>Opening: {coach.openingName}</small>
              )}
            </>
          )}
        </div>

        <div className="analysis-card">
          <h3>Move List</h3>
          <div className="move-list">
            {history.length === 0 ? (
              <p className="muted">No moves yet.</p>
            ) : (
              history.map((move, index) => (
                <span key={`${move}-${index}`}>
                  {index + 1}. {move}
                </span>
              ))
            )}
          </div>
        </div>

        {isGuest && (
          <div className="analysis-card">
            <h3>Guest Mode</h3>
            <p className="muted">Create an account to save game stats, friends, and rankings.</p>
          </div>
        )}
      </aside>
    </main>
  );
}
