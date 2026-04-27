import { Chessboard } from 'react-chessboard';
import { formatClock } from '../../lib/chessHelpers';

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
  return (
    <main className="play-layout">
      <section className="board-wrap">
        <div className="board-header">
          <div>
            <h2>{gameRow?.mode === 'friend' ? 'Friend Match' : 'Bot Match'}</h2>
            <p>{status}</p>
          </div>

          <div className="clock-stack">
            <strong>White: {formatClock(localWhiteTime)}</strong>
            <strong>Black: {formatClock(localBlackTime)}</strong>
          </div>

          {thinking && <div className="thinking-pill">Thinking...</div>}
        </div>

        {gameRow?.status === 'waiting' && (
          <div className="analysis-card" style={{ marginBottom: 16 }}>
            <h3>Waiting for opponent</h3>
            <p>Share this link:</p>
            <p style={{ wordBreak: 'break-all' }}>
              {inviteLink || `${window.location.origin}?join=${gameRow.invite_code}`}
            </p>
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
              AI coaching is active for bot games. Friend game analysis can be added next.
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
              {coach.openingName && <small style={{ display: 'block' }}>Opening: {coach.openingName}</small>}
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
            <p className="muted">Create an account to save game stats and history.</p>
          </div>
        )}
      </aside>
    </main>
  );
}
