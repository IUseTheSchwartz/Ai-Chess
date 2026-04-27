import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabaseClient';
import { analyzeMove } from '../lib/stockfishCoach';

function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function makeInviteCode() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 14);
}

function sideToTurn(side) {
  return side === 'w' ? 'white' : 'black';
}

function turnToSide(turn) {
  return turn === 'white' ? 'w' : 'b';
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getGameResult(chess, timedOutSide = null) {
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

export default function ChessGame({ session, guest, onSignOut }) {
  const [screen, setScreen] = useState('menu');
  const [game, setGame] = useState(() => new Chess());
  const [gameRow, setGameRow] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [coach, setCoach] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendResults, setFriendResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedSide, setSelectedSide] = useState('white');
  const [timeControl, setTimeControl] = useState(600);
  const [inviteLink, setInviteLink] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [localWhiteTime, setLocalWhiteTime] = useState(600);
  const [localBlackTime, setLocalBlackTime] = useState(600);
  const pollingRef = useRef(null);

  const isGuest = !session?.user;
  const userId = session?.user?.id || null;
  const playerName = session?.user?.user_metadata?.display_name || session?.user?.email || guest?.name || 'Guest';

  const fen = game.fen();

  const mySide = useMemo(() => {
    if (!gameRow) return 'white';

    if (userId && gameRow.white_player_id === userId) return 'white';
    if (userId && gameRow.black_player_id === userId) return 'black';

    if (guest?.name && gameRow.white_guest_name === guest.name) return 'white';
    if (guest?.name && gameRow.black_guest_name === guest.name) return 'black';

    return 'white';
  }, [gameRow, userId, guest?.name]);

  const isMyTurn = gameRow?.turn === mySide;

  const status = useMemo(() => {
    if (gameRow?.status === 'complete') return gameRow.result_reason || 'Game complete';

    if (game.isCheckmate()) return 'Checkmate';
    if (game.isDraw()) return 'Draw';
    if (game.isCheck()) return 'Check';

    if (gameRow?.mode === 'friend') {
      return isMyTurn ? 'Your turn' : 'Opponent turn';
    }

    return game.turn() === 'w' ? 'Your turn' : 'Bot thinking';
  }, [fen, gameRow, isMyTurn]);

  async function updateStatsForGame(row, result) {
    if (!row || row.stats_saved) return;

    const whiteId = row.white_player_id;
    const blackId = row.black_player_id;

    const ids = [whiteId, blackId].filter(Boolean);
    if (ids.length === 0) return;

    for (const id of ids) {
      const isWinner = row.winner_id && row.winner_id === id;
      const isDraw = !row.winner_id && result.status === 'complete';
      const isLoser = row.winner_id && row.winner_id !== id;

      await supabase.rpc('increment_user_stats_safe', {
        target_user_id: id,
        add_games_played: 1,
        add_wins: isWinner ? 1 : 0,
        add_losses: isLoser ? 1 : 0,
        add_draws: isDraw ? 1 : 0,
        add_bot_games: row.mode === 'bot' ? 1 : 0,
        add_friend_games: row.mode === 'friend' ? 1 : 0
      }).catch(() => {});
    }
  }

  async function loadStats() {
    if (!userId) return;

    const { data } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    setStats(data || {
      games_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      bot_games: 0,
      friend_games: 0
    });
  }

  async function loadFriends() {
    if (!userId) return;

    const { data: friendRows } = await supabase
      .from('friends')
      .select('friend_id, profiles!friends_friend_id_fkey(id, username, display_name, email, elo)')
      .eq('user_id', userId);

    setFriends(friendRows || []);

    const { data: requestRows } = await supabase
      .from('friend_requests')
      .select('id, sender_id, status, profiles!friend_requests_sender_id_fkey(id, username, display_name, email)')
      .eq('receiver_id', userId)
      .eq('status', 'pending');

    setRequests(requestRows || []);
  }

  useEffect(() => {
    loadStats();
    loadFriends();
  }, [userId]);

  async function searchUsers() {
    if (!userId || !friendSearch.trim()) return;

    const term = `%${friendSearch.trim()}%`;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, email, elo')
      .or(`username.ilike.${term},display_name.ilike.${term},email.ilike.${term}`)
      .neq('id', userId)
      .limit(10);

    if (error) {
      alert(error.message);
      return;
    }

    setFriendResults(data || []);
  }

  async function sendFriendRequest(receiverId) {
    if (!userId) return;

    const { error } = await supabase.from('friend_requests').upsert({
      sender_id: userId,
      receiver_id: receiverId,
      status: 'pending'
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert('Friend request sent.');
  }

  async function acceptRequest(request) {
    const senderId = request.sender_id;

    const { error: requestError } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', request.id);

    if (requestError) {
      alert(requestError.message);
      return;
    }

    const { error } = await supabase.from('friends').upsert([
      { user_id: userId, friend_id: senderId },
      { user_id: senderId, friend_id: userId }
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    await loadFriends();
  }

  async function denyRequest(requestId) {
    await supabase
      .from('friend_requests')
      .update({ status: 'denied' })
      .eq('id', requestId);

    await loadFriends();
  }

  async function startNewGame() {
    const freshGame = new Chess();

    const { data, error } = await supabase
      .from('games')
      .insert({
        white_player_id: userId,
        black_player_id: null,
        white_guest_name: isGuest ? playerName : null,
        mode: 'bot',
        status: 'active',
        current_fen: freshGame.fen(),
        pgn: freshGame.pgn(),
        turn: 'white',
        time_control_seconds: timeControl,
        white_time_seconds: timeControl,
        black_time_seconds: timeControl,
        last_move_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setGame(freshGame);
    setGameRow(data);
    setGameId(data.id);
    setLocalWhiteTime(timeControl);
    setLocalBlackTime(timeControl);
    setCoach(null);
    setHistory([]);
    setThinking(false);
    setScreen('game');
  }

  async function createFriendGame(friendId = null) {
    const freshGame = new Chess();
    const inviteCode = makeInviteCode();

    let whitePlayerId = null;
    let blackPlayerId = null;
    let whiteGuestName = null;
    let blackGuestName = null;

    const side = selectedSide === 'random'
      ? (Math.random() > 0.5 ? 'white' : 'black')
      : selectedSide;

    if (side === 'white') {
      whitePlayerId = userId;
      whiteGuestName = isGuest ? playerName : null;
      blackPlayerId = friendId;
    } else {
      blackPlayerId = userId;
      blackGuestName = isGuest ? playerName : null;
      whitePlayerId = friendId;
    }

    const { data, error } = await supabase
      .from('games')
      .insert({
        white_player_id: whitePlayerId,
        black_player_id: blackPlayerId,
        white_guest_name: whiteGuestName,
        black_guest_name: blackGuestName,
        mode: 'friend',
        status: friendId ? 'active' : 'waiting',
        current_fen: freshGame.fen(),
        pgn: freshGame.pgn(),
        turn: 'white',
        invite_code: inviteCode,
        time_control_seconds: timeControl,
        white_time_seconds: timeControl,
        black_time_seconds: timeControl,
        last_move_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    const link = `${window.location.origin}?join=${inviteCode}`;
    setInviteLink(link);

    setGame(freshGame);
    setGameRow(data);
    setGameId(data.id);
    setLocalWhiteTime(timeControl);
    setLocalBlackTime(timeControl);
    setCoach(null);
    setHistory([]);
    setScreen('game');
  }

  async function joinFriendGame(codeValue = joinCode) {
    const code = codeValue.trim();
    if (!code) return;

    const { data: row, error } = await supabase
      .from('games')
      .select('*')
      .eq('invite_code', code)
      .maybeSingle();

    if (error || !row) {
      alert(error?.message || 'Game link not found.');
      return;
    }

    const updates = {};

    if (!row.white_player_id && !row.white_guest_name) {
      updates.white_player_id = userId;
      updates.white_guest_name = isGuest ? playerName : null;
    } else if (!row.black_player_id && !row.black_guest_name) {
      updates.black_player_id = userId;
      updates.black_guest_name = isGuest ? playerName : null;
    }

    updates.status = 'active';

    const { data: updated, error: updateError } = await supabase
      .from('games')
      .update(updates)
      .eq('id', row.id)
      .select()
      .single();

    if (updateError) {
      alert(updateError.message);
      return;
    }

    const loadedGame = new Chess(updated.current_fen);

    setGame(loadedGame);
    setGameRow(updated);
    setGameId(updated.id);
    setLocalWhiteTime(updated.white_time_seconds);
    setLocalBlackTime(updated.black_time_seconds);
    setHistory(loadedGame.history());
    setCoach(null);
    setScreen('game');
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');

    if (code) {
      setJoinCode(code);
    }
  }, []);

  useEffect(() => {
    if (screen === 'menu' && joinCode) {
      joinFriendGame(joinCode);
    }
  }, [screen, joinCode]);

  async function saveMove({
    gameRef,
    move,
    fenBefore,
    fenAfter,
    bestMove = null,
    moveScore = null,
    coachMessage = null,
    playerId = userId,
    actor = 'user',
    nextGameRow = gameRow
  }) {
    if (!gameId) return;

    await supabase.from('game_moves').insert({
      game_id: gameId,
      player_id: playerId,
      actor,
      move_number: Math.ceil(gameRef.history().length / 2),
      san: move.san,
      uci: uciFromMove(move),
      fen_before: fenBefore,
      fen_after: fenAfter,
      best_move: bestMove,
      move_score: moveScore,
      coach_message: coachMessage
    });

    const result = getGameResult(gameRef);
    const winnerId =
      result.winnerSide === 'white'
        ? nextGameRow?.white_player_id
        : result.winnerSide === 'black'
          ? nextGameRow?.black_player_id
          : null;

    const updatePayload = {
      current_fen: fenAfter,
      pgn: gameRef.pgn(),
      turn: gameRef.turn() === 'w' ? 'white' : 'black',
      status: result.status,
      winner_id: winnerId,
      result_reason: result.reason,
      updated_at: new Date().toISOString(),
      last_move_at: new Date().toISOString(),
      white_time_seconds: localWhiteTime,
      black_time_seconds: localBlackTime
    };

    const { data } = await supabase
      .from('games')
      .update(updatePayload)
      .eq('id', gameId)
      .select()
      .single();

    if (data) setGameRow(data);
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
      gameRef: currentGame,
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
    if (gameRow?.status !== 'active') return false;

    if (gameRow?.mode === 'bot' && game.turn() !== 'w') return false;
    if (gameRow?.mode === 'friend' && !isMyTurn) return false;

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

    setGame(new Chess(gameCopy.fen()));
    setHistory(gameCopy.history());

    if (gameRow?.mode === 'bot') {
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
        depth: 10
      });

      setCoach(analysis);

      await saveMove({
        gameRef: gameCopy,
        move,
        fenBefore,
        fenAfter,
        bestMove: analysis.bestMove,
        moveScore: analysis.moveScore,
        coachMessage: analysis.coachMessage,
        actor: isGuest ? 'guest' : 'user'
      });

      setThinking(false);

      setTimeout(() => {
        makeBotMove(gameCopy);
      }, 400);
    } else {
      await saveMove({
        gameRef: gameCopy,
        move,
        fenBefore,
        fenAfter,
        actor: isGuest ? 'guest' : 'user'
      });
    }

    return true;
  }

  useEffect(() => {
    if (!gameId || screen !== 'game' || gameRow?.mode !== 'friend') return;

    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle();

      if (!data) return;

      if (data.current_fen !== gameRow?.current_fen || data.status !== gameRow?.status) {
        const loaded = new Chess(data.current_fen);
        setGame(loaded);
        setHistory(loaded.history());
      }

      setGameRow(data);
      setLocalWhiteTime(data.white_time_seconds);
      setLocalBlackTime(data.black_time_seconds);
    }, 1500);

    return () => clearInterval(pollingRef.current);
  }, [gameId, screen, gameRow?.mode, gameRow?.current_fen, gameRow?.status]);

  useEffect(() => {
    if (!gameRow || screen !== 'game') return;
    if (gameRow.status !== 'active') return;

    const timer = setInterval(async () => {
      if (gameRow.turn === 'white') {
        setLocalWhiteTime((prev) => Math.max(0, prev - 1));
      } else {
        setLocalBlackTime((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameRow?.id, gameRow?.turn, gameRow?.status, screen]);

  async function resignGame() {
    if (!gameRow || gameRow.status !== 'active') return;

    const winnerSide = mySide === 'white' ? 'black' : 'white';
    const winnerId = winnerSide === 'white' ? gameRow.white_player_id : gameRow.black_player_id;

    const { data } = await supabase
      .from('games')
      .update({
        status: 'complete',
        winner_id: winnerId,
        result_reason: `${mySide === 'white' ? 'White' : 'Black'} resigned`,
        updated_at: new Date().toISOString()
      })
      .eq('id', gameRow.id)
      .select()
      .single();

    if (data) setGameRow(data);
  }

  if (screen === 'menu') {
    return (
      <div className="site-shell">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">♞</div>
            <span>ChessAI</span>
          </div>

          <button className="ghost-btn" onClick={onSignOut}>
            {isGuest ? 'Exit Guest' : 'Logout'}
          </button>
        </nav>

        <main className="home">
          <section className="home-hero">
            <div className="eyebrow">
              {isGuest ? `Guest mode: ${playerName}` : `Logged in as ${playerName}`}
            </div>

            <h1>Play. Review. Improve.</h1>

            <p>
              Play the bot, challenge friends, share private links, and save stats when logged in.
            </p>

            <div className="home-actions">
              <button className="main-btn" onClick={startNewGame}>Play Bot</button>
              <button className="soft-btn" onClick={() => setScreen('friends')}>Play Friend</button>
            </div>
          </section>

          <section className="mode-grid">
            <div className="mode-card active">
              <span>♟</span>
              <h3>Play Bot</h3>
              <p>Start a quick game and get coached after every move.</p>
            </div>

            <div className="mode-card active" onClick={() => setScreen('friends')}>
              <span>🤝</span>
              <h3>Challenge Friends</h3>
              <p>Send friend requests or create a shareable invite link.</p>
            </div>

            <div className="mode-card active">
              <span>📈</span>
              <h3>Stats</h3>
              {isGuest ? (
                <p>Create an account to save stats.</p>
              ) : (
                <p>
                  {stats?.games_played || 0} games • {stats?.wins || 0} wins • {stats?.losses || 0} losses • {stats?.draws || 0} draws
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (screen === 'friends') {
    return (
      <div className="site-shell">
        <nav className="nav">
          <div className="brand" onClick={() => setScreen('menu')}>
            <div className="brand-icon">♞</div>
            <span>ChessAI</span>
          </div>

          <button className="ghost-btn" onClick={() => setScreen('menu')}>Menu</button>
        </nav>

        <main className="home">
          <section className="home-hero">
            <div className="eyebrow">Friend games</div>
            <h1>Challenge a friend</h1>
            <p>Choose your side, pick a timer, and send a private game link.</p>

            <div className="feature-grid">
              <label>
                Side
                <select value={selectedSide} onChange={(e) => setSelectedSide(e.target.value)}>
                  <option value="white">Play White</option>
                  <option value="black">Play Black</option>
                  <option value="random">Random</option>
                </select>
              </label>

              <label>
                Timer
                <select value={timeControl} onChange={(e) => setTimeControl(Number(e.target.value))}>
                  <option value={60}>1 minute</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                </select>
              </label>

              <button className="main-btn" onClick={() => createFriendGame()}>
                Create Share Link
              </button>
            </div>

            {inviteLink && (
              <div className="analysis-card" style={{ marginTop: 18 }}>
                <h3>Invite Link</h3>
                <p style={{ wordBreak: 'break-all' }}>{inviteLink}</p>
                <button
                  className="soft-btn"
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                >
                  Copy Link
                </button>
              </div>
            )}

            <div className="analysis-card" style={{ marginTop: 18 }}>
              <h3>Join Game Link</h3>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Paste invite code"
              />
              <button className="soft-btn" onClick={() => joinFriendGame()}>
                Join Game
              </button>
            </div>
          </section>

          {!isGuest && (
            <section className="mode-grid">
              <div className="mode-card active">
                <h3>Find Players</h3>
                <input
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search username or email"
                />
                <button className="soft-btn" onClick={searchUsers}>Search</button>

                {friendResults.map((user) => (
                  <p key={user.id}>
                    {user.display_name || user.username || user.email}
                    <button className="soft-btn" onClick={() => sendFriendRequest(user.id)}>
                      Add
                    </button>
                  </p>
                ))}
              </div>

              <div className="mode-card active">
                <h3>Friend Requests</h3>
                {requests.length === 0 ? (
                  <p>No pending requests.</p>
                ) : (
                  requests.map((request) => (
                    <p key={request.id}>
                      {request.profiles?.display_name || request.profiles?.username || request.profiles?.email}
                      <button className="soft-btn" onClick={() => acceptRequest(request)}>Accept</button>
                      <button className="ghost-btn" onClick={() => denyRequest(request.id)}>Deny</button>
                    </p>
                  ))
                )}
              </div>

              <div className="mode-card active">
                <h3>Friends</h3>
                {friends.length === 0 ? (
                  <p>No friends yet.</p>
                ) : (
                  friends.map((friend) => (
                    <p key={friend.friend_id}>
                      {friend.profiles?.display_name || friend.profiles?.username || friend.profiles?.email}
                      <button
                        className="soft-btn"
                        onClick={() => createFriendGame(friend.friend_id)}
                      >
                        Challenge
                      </button>
                    </p>
                  ))
                )}
              </div>
            </section>
          )}
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
          <button className="ghost-btn" onClick={startNewGame}>New Bot Game</button>
          {gameRow?.status === 'active' && (
            <button className="ghost-btn" onClick={resignGame}>Resign</button>
          )}
        </div>
      </nav>

      <main className="play-layout">
        <section className="board-wrap">
          <div className="board-header">
            <div>
              <h2>{gameRow?.mode === 'friend' ? 'Friend Match' : 'Bot Match'}</h2>
              <p>{status}</p>
            </div>

            <div>
              <strong>White: {formatClock(localWhiteTime)}</strong>
              <br />
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
                (
                  gameRow?.mode === 'bot'
                    ? game.turn() === 'w'
                    : isMyTurn
                )
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
              <p className="muted">AI coaching is active for bot games. Friend game analysis can be added next.</p>
            ) : !coach ? (
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

          {isGuest && (
            <div className="analysis-card">
              <h3>Guest Mode</h3>
              <p className="muted">Create an account to save game stats and history.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
