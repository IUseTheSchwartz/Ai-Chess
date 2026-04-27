import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { supabase } from '../lib/supabaseClient';
import { analyzeMove } from '../lib/stockfishCoach';
import {
  getGameResult,
  makeInviteCode,
  uciFromMove
} from '../lib/chessHelpers';

import ChessNav from '../components/chess/ChessNav';
import MainMenu from '../components/chess/MainMenu';
import FriendsScreen from '../components/chess/FriendsScreen';
import GameScreen from '../components/chess/GameScreen';

export default function ChessGame({
  session,
  guest,
  onSignOut,
  theme = 'light',
  onToggleTheme
}) {
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
  const playerName =
    session?.user?.user_metadata?.display_name ||
    session?.user?.email ||
    guest?.name ||
    'Guest';

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
    if (gameRow?.status === 'waiting') return 'Waiting for opponent';
    if (gameRow?.status === 'complete') return gameRow.result_reason || 'Game complete';

    if (game.isCheckmate()) return 'Checkmate';
    if (game.isDraw()) return 'Draw';
    if (game.isCheck()) return 'Check';

    if (gameRow?.mode === 'friend') {
      return isMyTurn ? 'Your turn' : 'Opponent turn';
    }

    return game.turn() === 'w' ? 'Your turn' : 'Bot thinking';
  }, [fen, gameRow, game, isMyTurn]);

  async function loadStats() {
    if (!userId) return;

    const { data } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    setStats(
      data || {
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        bot_games: 0,
        friend_games: 0
      }
    );
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

  function resetGameState(freshGame, row) {
    setGame(freshGame);
    setGameRow(row);
    setGameId(row.id);
    setLocalWhiteTime(row.white_time_seconds || timeControl);
    setLocalBlackTime(row.black_time_seconds || timeControl);
    setCoach(null);
    setHistory(freshGame.history());
    setThinking(false);
    setScreen('game');
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

    resetGameState(freshGame, data);
  }

  async function createFriendGame(friendId = null) {
    const freshGame = new Chess();
    const inviteCode = makeInviteCode();

    let whitePlayerId = null;
    let blackPlayerId = null;
    let whiteGuestName = null;
    let blackGuestName = null;

    const side =
      selectedSide === 'random'
        ? Math.random() > 0.5
          ? 'white'
          : 'black'
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

    setInviteLink(`${window.location.origin}?join=${inviteCode}`);
    resetGameState(freshGame, data);
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
    } else {
      alert('This game already has two players.');
      return;
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
    resetGameState(loadedGame, updated);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');

    if (code) setJoinCode(code);
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

    const timer = setInterval(() => {
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

  return (
    <div className="site-shell">
      <ChessNav
        isGuest={isGuest}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onGoMenu={() => setScreen('menu')}
        onSignOut={onSignOut}
        onStartNewGame={startNewGame}
        onResignGame={resignGame}
        showMenu={screen !== 'menu'}
        showGameActions={screen === 'game'}
        gameStatus={gameRow?.status}
      />

      {screen === 'menu' && (
        <MainMenu
          isGuest={isGuest}
          playerName={playerName}
          stats={stats}
          onStartBot={startNewGame}
          onOpenFriends={() => setScreen('friends')}
        />
      )}

      {screen === 'friends' && (
        <FriendsScreen
          isGuest={isGuest}
          selectedSide={selectedSide}
          setSelectedSide={setSelectedSide}
          timeControl={timeControl}
          setTimeControl={setTimeControl}
          inviteLink={inviteLink}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          friendSearch={friendSearch}
          setFriendSearch={setFriendSearch}
          friendResults={friendResults}
          friends={friends}
          requests={requests}
          onCreateFriendGame={createFriendGame}
          onJoinFriendGame={joinFriendGame}
          onSearchUsers={searchUsers}
          onSendFriendRequest={sendFriendRequest}
          onAcceptRequest={acceptRequest}
          onDenyRequest={denyRequest}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          game={game}
          gameRow={gameRow}
          fen={fen}
          status={status}
          thinking={thinking}
          history={history}
          coach={coach}
          inviteLink={inviteLink}
          mySide={mySide}
          isMyTurn={isMyTurn}
          isGuest={isGuest}
          localWhiteTime={localWhiteTime}
          localBlackTime={localBlackTime}
          onPieceDrop={onPieceDrop}
        />
      )}
    </div>
  );
}
