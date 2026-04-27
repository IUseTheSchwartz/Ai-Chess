import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { supabase } from '../lib/supabaseClient';
import { analyzeMove, getBotMove } from '../lib/stockfishCoach';
import {
  calculateElo,
  getGameResult,
  makeInviteCode,
  uciFromMove
} from '../lib/chessHelpers';

import ChessNav from '../components/chess/ChessNav';
import MainMenu from '../components/chess/MainMenu';
import FriendsScreen from '../components/chess/FriendsScreen';
import GameScreen from '../components/chess/GameScreen';

const DEFAULT_RATING = 800;

function getProfileSelect() {
  return `
    *,
    white_profile:profiles!games_white_player_id_fkey(id, username, display_name, email, bot_rating, friend_rating, bot_games_completed, friend_games_completed),
    black_profile:profiles!games_black_player_id_fkey(id, username, display_name, email, bot_rating, friend_rating, bot_games_completed, friend_games_completed)
  `;
}

function getBotThinkingDelay(rating) {
  const botRating = Number(rating || DEFAULT_RATING);

  if (botRating >= 2200) return 1600 + Math.floor(Math.random() * 1200);
  if (botRating >= 1800) return 1300 + Math.floor(Math.random() * 1000);
  if (botRating >= 1400) return 1000 + Math.floor(Math.random() * 900);
  if (botRating >= 1000) return 800 + Math.floor(Math.random() * 700);

  return 650 + Math.floor(Math.random() * 550);
}

function getCoachDepthForBotRating(rating) {
  const botRating = Number(rating || DEFAULT_RATING);

  if (botRating >= 2200) return 16;
  if (botRating >= 1800) return 14;
  if (botRating >= 1400) return 12;
  if (botRating >= 1000) return 10;

  return 8;
}

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

  const [profile, setProfile] = useState(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendResults, setFriendResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [stats, setStats] = useState(null);

  const [selectedSide, setSelectedSide] = useState('white');
  const [timeControl, setTimeControl] = useState(600);
  const [botRatingTarget, setBotRatingTarget] = useState(800);
  const [inviteLink, setInviteLink] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [localWhiteTime, setLocalWhiteTime] = useState(600);
  const [localBlackTime, setLocalBlackTime] = useState(600);

  const pollingRef = useRef(null);
  const ratingProcessedRef = useRef({});
  const botMovingRef = useRef(false);

  const isGuest = !session?.user;
  const userId = session?.user?.id || null;
  const playerName =
    session?.user?.user_metadata?.display_name ||
    session?.user?.email ||
    guest?.name ||
    'Guest';

  const fen = game.fen();
  const hasGameStarted = history.length > 0 || Boolean(gameRow?.pgn?.trim());

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

  async function loadProfile() {
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, email, bot_rating, friend_rating, bot_games_completed, friend_games_completed'
      )
      .eq('id', userId)
      .maybeSingle();

    setProfile(data || null);
  }

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
      .select(
        'friend_id, profiles!friends_friend_id_fkey(id, username, display_name, email, elo, friend_rating, friend_games_completed)'
      )
      .eq('user_id', userId);

    setFriends(friendRows || []);
  }

  useEffect(() => {
    loadProfile();
    loadStats();
    loadFriends();
  }, [userId]);

  async function searchUsers() {
    if (!userId || !friendSearch.trim()) return;

    const term = `%${friendSearch.trim()}%`;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, email, elo, friend_rating, friend_games_completed')
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

  function resetGameState(freshGame, row) {
    setGame(freshGame);
    setGameRow(row);
    setGameId(row.id);
    setLocalWhiteTime(row.white_time_seconds || timeControl);
    setLocalBlackTime(row.black_time_seconds || timeControl);
    setCoach(null);
    setHistory(freshGame.history());
    setThinking(false);
    botMovingRef.current = false;
    setScreen('game');
  }

  async function startNewGame(customBotRating = botRatingTarget) {
    const freshGame = new Chess();
    const targetRating = Number(customBotRating || botRatingTarget || DEFAULT_RATING);

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
        bot_rating_target: targetRating,
        rating_processed: false,
        last_move_at: new Date().toISOString()
      })
      .select(getProfileSelect())
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setBotRatingTarget(targetRating);
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
        rating_processed: false,
        last_move_at: new Date().toISOString()
      })
      .select(getProfileSelect())
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setInviteLink(`${window.location.origin}?join=${inviteCode}`);
    resetGameState(freshGame, data);
  }

  async function joinFriendGame(codeValue = joinCode) {
    const code = String(codeValue || '')
      .trim()
      .replace(/\s/g, '')
      .toUpperCase();

    if (!code) return;

    const { data: row, error } = await supabase
      .from('games')
      .select(getProfileSelect())
      .eq('invite_code', code)
      .maybeSingle();

    if (error || !row) {
      alert(
        error?.message ||
          'Game code not found. If the code is correct, your Supabase games SELECT policy is blocking waiting invite games.'
      );
      return;
    }

    if (row.status !== 'waiting' && row.status !== 'active') {
      alert('This game is no longer joinable.');
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
    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('games')
      .update(updates)
      .eq('id', row.id)
      .select(getProfileSelect())
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

    if (code) {
      setJoinCode(code.trim().replace(/\s/g, '').toUpperCase());
      setScreen('friends');
    }
  }, []);

  async function updateStatsForCompletedGame(row) {
    if (!userId || isGuest || !row || row.status !== 'complete') return;

    const isPlayer =
      row.white_player_id === userId ||
      row.black_player_id === userId ||
      row.white_guest_name === guest?.name ||
      row.black_guest_name === guest?.name;

    if (!isPlayer) return;

    const isDraw = !row.winner_id;
    const isWin = row.winner_id === userId;
    const isLoss = !isDraw && !isWin;

    const { data: currentStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const nextStats = {
      user_id: userId,
      games_played: (currentStats?.games_played || 0) + 1,
      wins: (currentStats?.wins || 0) + (isWin ? 1 : 0),
      losses: (currentStats?.losses || 0) + (isLoss ? 1 : 0),
      draws: (currentStats?.draws || 0) + (isDraw ? 1 : 0),
      bot_games: (currentStats?.bot_games || 0) + (row.mode === 'bot' ? 1 : 0),
      friend_games: (currentStats?.friend_games || 0) + (row.mode === 'friend' ? 1 : 0),
      updated_at: new Date().toISOString()
    };

    await supabase.from('user_stats').upsert(nextStats);
    await loadStats();
  }

  async function updateRatingsIfNeeded(row) {
    if (!row || row.status !== 'complete') return;
    if (row.rating_processed) return;
    if (ratingProcessedRef.current[row.id]) return;

    ratingProcessedRef.current[row.id] = true;

    if (row.mode === 'bot') {
      if (!userId || isGuest) return;

      const currentProfile = profile || {};
      const oldRating = currentProfile.bot_rating || DEFAULT_RATING;
      const gamesCompleted = currentProfile.bot_games_completed || 0;
      const opponentRating = row.bot_rating_target || DEFAULT_RATING;

      const result = row.winner_id === userId ? 1 : row.winner_id === null ? 0.5 : 0;

      const newRating = calculateElo({
        playerRating: oldRating,
        opponentRating,
        result,
        gamesCompleted
      });

      await supabase
        .from('profiles')
        .update({
          bot_rating: newRating,
          bot_games_completed: gamesCompleted + 1
        })
        .eq('id', userId);

      await updateStatsForCompletedGame(row);

      await supabase.from('games').update({ rating_processed: true }).eq('id', row.id);

      await loadProfile();
      return;
    }

    if (row.mode === 'friend') {
      const whiteId = row.white_player_id;
      const blackId = row.black_player_id;

      if (!whiteId || !blackId) return;

      const whiteRating = row.white_profile?.friend_rating || DEFAULT_RATING;
      const blackRating = row.black_profile?.friend_rating || DEFAULT_RATING;
      const whiteGames = row.white_profile?.friend_games_completed || 0;
      const blackGames = row.black_profile?.friend_games_completed || 0;

      const whiteResult =
        row.winner_id === whiteId ? 1 : row.winner_id === blackId ? 0 : 0.5;

      const blackResult = 1 - whiteResult;

      const newWhiteRating = calculateElo({
        playerRating: whiteRating,
        opponentRating: blackRating,
        result: whiteResult,
        gamesCompleted: whiteGames
      });

      const newBlackRating = calculateElo({
        playerRating: blackRating,
        opponentRating: whiteRating,
        result: blackResult,
        gamesCompleted: blackGames
      });

      await supabase
        .from('profiles')
        .update({
          friend_rating: newWhiteRating,
          friend_games_completed: whiteGames + 1
        })
        .eq('id', whiteId);

      await supabase
        .from('profiles')
        .update({
          friend_rating: newBlackRating,
          friend_games_completed: blackGames + 1
        })
        .eq('id', blackId);

      await updateStatsForCompletedGame(row);

      await supabase.from('games').update({ rating_processed: true }).eq('id', row.id);

      await loadProfile();
      await loadFriends();
    }
  }

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
      .select(getProfileSelect())
      .single();

    if (data) {
      setGameRow(data);
      await updateRatingsIfNeeded(data);
    }
  }

  async function makeBotMove(currentGame) {
    if (botMovingRef.current) return;
    if (currentGame.isGameOver()) return;

    botMovingRef.current = true;
    setThinking(true);

    const rating = Number(gameRow?.bot_rating_target || botRatingTarget || DEFAULT_RATING);
    const delay = getBotThinkingDelay(rating);

    await new Promise((resolve) => setTimeout(resolve, delay));

    const botChoice = await getBotMove({
      fen: currentGame.fen(),
      rating
    });

    if (!botChoice) {
      setThinking(false);
      botMovingRef.current = false;
      return;
    }

    const fenBefore = currentGame.fen();
    const botMove = currentGame.move(botChoice);
    const fenAfter = currentGame.fen();

    if (!botMove) {
      setThinking(false);
      botMovingRef.current = false;
      return;
    }

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
    botMovingRef.current = false;
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
    const sanHistoryAfterMove = gameCopy.history();

    setGame(new Chess(gameCopy.fen()));
    setHistory(sanHistoryAfterMove);

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
        sanHistory: sanHistoryAfterMove,
        depth: getCoachDepthForBotRating(gameRow?.bot_rating_target || botRatingTarget)
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

      if (!gameCopy.isGameOver()) {
        setTimeout(() => {
          makeBotMove(gameCopy);
        }, 250);
      }
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
        .select(getProfileSelect())
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

      if (data.status === 'complete') {
        await updateRatingsIfNeeded(data);
      }
    }, 1500);

    return () => clearInterval(pollingRef.current);
  }, [gameId, screen, gameRow?.mode, gameRow?.current_fen, gameRow?.status]);

  useEffect(() => {
    if (!gameRow || screen !== 'game') return;
    if (gameRow.status !== 'active') return;
    if (!hasGameStarted) return;

    const timer = setInterval(() => {
      if (gameRow.turn === 'white') {
        setLocalWhiteTime((prev) => Math.max(0, prev - 1));
      } else {
        setLocalBlackTime((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameRow?.id, gameRow?.turn, gameRow?.status, screen, hasGameStarted]);

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
      .select(getProfileSelect())
      .single();

    if (data) {
      setGameRow(data);
      await updateRatingsIfNeeded(data);
    }
  }

  return (
    <div className="site-shell">
      <ChessNav
        isGuest={isGuest}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onGoMenu={() => setScreen('menu')}
        onOpenFriends={() => setScreen('friends')}
        onSignOut={onSignOut}
        onStartNewGame={() => startNewGame(botRatingTarget)}
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
          profile={profile}
          botRatingTarget={botRatingTarget}
          setBotRatingTarget={setBotRatingTarget}
          onStartBot={() => startNewGame(botRatingTarget)}
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
          onCreateFriendGame={createFriendGame}
          onJoinFriendGame={joinFriendGame}
          onSearchUsers={searchUsers}
          onSendFriendRequest={sendFriendRequest}
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
