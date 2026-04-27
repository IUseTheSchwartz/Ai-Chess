import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabaseClient';
import { analyzeMove } from '../lib/stockfishCoach';

function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

export default function ChessGame({ session }) {
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
    return game.turn() === 'w' ? 'White to move' : 'Black to move';
  }, [fen]);

  useEffect(() => {
    startNewGame();
  }, []);

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
      console.error(error);
      alert(error.message);
      return;
    }

    setGame(freshGame);
    setGameId(data.id);
    setCoach(null);
    setHistory([]);
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

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Momentum Chess</h1>
          <p>AI coach reviews your move after it is locked in.</p>
        </div>

        <div className="topbar-actions">
          <button onClick={startNewGame}>New Game</button>
          <button className="secondary" onClick={signOut}>Logout</button>
        </div>
      </header>

      <main className="game-layout">
        <section className="board-panel">
          <Chessboard
            position={fen}
            onPieceDrop={onPieceDrop}
            boardWidth={560}
            arePiecesDraggable={!thinking && game.turn() === 'w'}
          />
        </section>

        <aside className="side-panel">
          <div className="card">
            <h2>Status</h2>
            <p>{status}</p>
            {thinking && <p className="muted">Thinking...</p>}
          </div>

          <div className="card coach-card">
            <h2>AI Coach</h2>

            {!coach ? (
              <p className="muted">Make a move to get your first review.</p>
            ) : (
              <>
                <div className="score">
                  {coach.moveScore ? `${coach.moveScore}/10` : '--'}
                </div>
                <p>{coach.coachMessage}</p>
                {coach.bestMove && (
                  <p className="muted">Best move: {coach.bestMove}</p>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h2>Moves</h2>
            <div className="moves">
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
