import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabaseClient';
import { analyzeMove } from '../lib/stockfishCoach';

function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

export default function ChessGame({ session }) {
  const [screen, setScreen] = useState('menu');
  const [game, setGame] = useState(() => new Chess());
  const [gameId, setGameId] = useState(null);
  const [coach, setCoach] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState([]);

  const fen = game.fen();
  const userId = session.user.id;

  const status = useMemo(() => {
    if (game.isCheckmate()) return 'Checkmate';
    if (game.isDraw()) return 'Draw';
    if (game.isCheck()) return 'Check';
    return game.turn() === 'w' ? 'Your turn' : 'Bot thinking';
  }, [fen, game]);

  async function startNewGame() {
    const freshGame = new Chess();

    const { data, error } = await supabase
      .from('games')
      .insert({
        white_player_id: userId,
        black_player_id: null,
        mode: 'bot',
        status: 'active',
        current_fen: freshGame.fen(),
        pgn: freshGame.pgn(),
        turn: 'white'
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setGame(freshGame);
    setGameId(data.id);
    setCoach(null);
    setHistory([]);
    setScreen('game');
  }

  async function saveMove({
    move,
    fenBefore,
    fenAfter,
    bestMove = null,
    moveScore = null,
    coachMessage = null,
    playerId = userId,
    actor = 'user'
  }) {
    if (!gameId) return;

    await supabase.from('game_moves').insert({
      game_id: gameId,
      player_id: playerId,
      actor,
      move_number: Math.ceil(game.history().length / 2),
      san: move.san,
      uci: uciFromMove(move),
      fen_before: fenBefore,
      fen_after: fenAfter,
      best_move: bestMove,
      move_score: moveScore,
      coach_message: coachMessage
    });

    await supabase
      .from('games')
      .update({
        current_fen: fenAfter,
        pgn: game.pgn(),
        turn: game.turn() === 'w' ? 'white' : 'black',
        status: game.isGameOver() ? 'complete' : 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', gameId);
  }

  async function makeBotMove(currentGame) {
    if (currentGame.isGameOver()) return;

    setThinking(true);

    const legalMoves = currentGame.moves({ verbose: true });
    const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];

    await new Promise((resolve) => setTimeout(resolve, 500));

    const fenBefore = currentGame.fen();
    const botMove = currentGame.move(randomMove);
    const fenAfter = currentGame.fen();

    setGame(new Chess(currentGame.fen()));
    setHistory(currentGame.history());

    await saveMove({
      move: botMove,
      fenBefore,
      fenAfter,
      playerId: null,
      actor: 'bot'
    });

    setThinking(false);
  }

  async function onPieceDrop(sourceSquare, targetSquare) {
    if (thinking) return false;
    if (game.turn() !== 'w') return false;

    const gameCopy = new Chess(game.fen());
    const fenBefore = gameCopy.fen();

    const move = gameCopy.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q'
    });

    if (!move) return false;

    const fenAfter = gameCopy.fen();
    const userMoveUci = uciFromMove(move);

    setGame(gameCopy);
    setHistory(gameCopy.history());
    setCoach({
      moveScore: null,
      bestMove: null,
      coachMessage: 'Analyzing your move...'
    });

    setThinking(true);

    const analysis = await analyzeMove({
      fenBefore,
      fenAfter,
      userMoveUci,
      depth: 12
    });

    setCoach(analysis);

    await saveMove({
      move,
      fenBefore,
      fenAfter,
      bestMove: analysis.bestMove,
      moveScore: analysis.moveScore,
      coachMessage: analysis.coachMessage,
      actor: 'user'
    });

    setThinking(false);

    setTimeout(() => {
      makeBotMove(gameCopy);
    }, 400);

    return true;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (screen === 'menu') {
    return (
      <div className="site-shell">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">♞</div>
            <span>ChessAI</span>
          </div>

          <button className="ghost-btn" onClick={signOut}>Logout</button>
        </nav>

        <main className="home">
          <section className="home-hero">
            <div className="eyebrow">AI chess training platform</div>
            <h1>Play. Review. Improve.</h1>
            <p>
              Play chess against the bot and get instant AI coaching after every move.
              See your score, the best move, and what you missed.
            </p>

            <div className="home-actions">
              <button className="main-btn" onClick={startNewGame}>Play Bot</button>
              <button className="soft-btn" disabled>Play Friend Soon</button>
            </div>
          </section>

          <section className="mode-grid">
            <div className="mode-card active">
              <span>♟</span>
              <h3>Play Bot</h3>
              <p>Start a quick game and get coached after every move.</p>
            </div>

            <div className="mode-card locked">
              <span>🤝</span>
              <h3>Challenge Friends</h3>
              <p>Friend requests and live games are coming next.</p>
            </div>

            <div className="mode-card locked">
              <span>📈</span>
              <h3>Game Review</h3>
              <p>Saved games and deeper analysis will be added soon.</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <nav className="nav">
        <div className="brand" onClick={() => setScreen('menu')}>
          <div className="brand-icon">♞</div>
          <span>ChessAI</span>
        </div>

        <div className="nav-actions">
          <button className="ghost-btn" onClick={() => setScreen('menu')}>Menu</button>
          <button className="ghost-btn" onClick={startNewGame}>New Game</button>
        </div>
      </nav>

      <main className="play-layout">
        <section className="board-wrap">
          <div className="board-header">
            <div>
              <h2>Bot Match</h2>
              <p>{status}</p>
            </div>
            {thinking && <div className="thinking-pill">Thinking...</div>}
          </div>

          <div className="chessboard-shell">
            <Chessboard
              position={fen}
              onPieceDrop={onPieceDrop}
              boardWidth={620}
              arePiecesDraggable={!thinking && game.turn() === 'w'}
              customDarkSquareStyle={{ backgroundColor: '#779556' }}
              customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
            />
          </div>
        </section>

        <aside className="analysis-panel">
          <div className="analysis-card coach">
            <h3>AI Coach</h3>

            {!coach ? (
              <p className="muted">Make a move to get your first review.</p>
            ) : (
              <>
                <div className="coach-score">
                  {coach.moveScore ? `${coach.moveScore}/10` : '--'}
                </div>
                <p>{coach.coachMessage}</p>
                {coach.bestMove && <small>Best move: {coach.bestMove}</small>}
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
                  <span key={`${move}-${index}`}>{index + 1}. {move}</span>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
