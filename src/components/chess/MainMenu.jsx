import { ratingLabel } from '../../lib/chessHelpers';

const BOT_LEVELS = [
  { label: 'Beginner', rating: 600, desc: 'Makes mistakes often' },
  { label: 'Casual', rating: 800, desc: 'Good for learning basics' },
  { label: 'Intermediate', rating: 1200, desc: 'Sees simple tactics' },
  { label: 'Club', rating: 1600, desc: 'More accurate and punishing' },
  { label: 'Advanced', rating: 2000, desc: 'Strong engine-style play' },
  { label: 'Expert', rating: 2400, desc: 'Very difficult' }
];

function gamesUntilRated(games) {
  return Math.max(0, 5 - Number(games || 0));
}

export default function MainMenu({
  isGuest,
  playerName,
  stats,
  profile,
  botRatingTarget = 800,
  setBotRatingTarget,
  onStartBot,
  onOpenFriends
}) {
  const botRating = profile?.bot_rating || 800;
  const friendRating = profile?.friend_rating || 800;
  const botGames = profile?.bot_games_completed || 0;
  const friendGames = profile?.friend_games_completed || 0;

  const selectedBot = BOT_LEVELS.find((level) => level.rating === Number(botRatingTarget)) || BOT_LEVELS[1];

  return (
    <main className="home">
      <section className="home-hero">
        <div className="eyebrow">
          {isGuest ? `Guest mode: ${playerName}` : `Logged in as ${playerName}`}
        </div>

        <h1>Play. Review. Improve.</h1>

        <p>
          Choose a bot level, get move feedback from the AI coach, challenge friends, and build
          separate bot and friend ratings.
        </p>

        <div className="bot-difficulty-card">
          <div>
            <h3>Bot Difficulty</h3>
            <p>
              {selectedBot.label} • Estimated rating {selectedBot.rating}
            </p>
            <small>{selectedBot.desc}</small>
          </div>

          <select
            value={botRatingTarget}
            onChange={(e) => setBotRatingTarget?.(Number(e.target.value))}
          >
            {BOT_LEVELS.map((level) => (
              <option key={level.rating} value={level.rating}>
                {level.label} — {level.rating}
              </option>
            ))}
          </select>
        </div>

        <div className="home-actions">
          <button className="main-btn" type="button" onClick={onStartBot}>
            Play Bot vs {selectedBot.rating}
          </button>

          <button className="soft-btn" type="button" onClick={onOpenFriends}>
            Play Friend
          </button>
        </div>
      </section>

      <section className="mode-grid">
        <div className="mode-card active">
          <span>♟</span>
          <h3>Bot Rating</h3>
          {isGuest ? (
            <p>Create an account to save your bot rating.</p>
          ) : (
            <>
              <p>{ratingLabel(botRating, botGames)}</p>
              <small>
                {gamesUntilRated(botGames) > 0
                  ? `${gamesUntilRated(botGames)} bot placement games left`
                  : 'Bot rating active'}
              </small>
            </>
          )}
        </div>

        <div className="mode-card active">
          <span>🤝</span>
          <h3>Friend Rating</h3>
          {isGuest ? (
            <p>Create an account to save your friend rating.</p>
          ) : (
            <>
              <p>{ratingLabel(friendRating, friendGames)}</p>
              <small>
                {gamesUntilRated(friendGames) > 0
                  ? `${gamesUntilRated(friendGames)} friend placement games left`
                  : 'Friend rating active'}
              </small>
            </>
          )}
        </div>

        <div className="mode-card active">
          <span>📈</span>
          <h3>Stats</h3>
          {isGuest ? (
            <p>Create an account to save stats.</p>
          ) : (
            <p>
              {stats?.games_played || 0} games • {stats?.wins || 0} wins •{' '}
              {stats?.losses || 0} losses • {stats?.draws || 0} draws
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
