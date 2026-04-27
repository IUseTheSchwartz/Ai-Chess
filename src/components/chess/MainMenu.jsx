export default function MainMenu({
  isGuest,
  playerName,
  stats,
  onStartBot,
  onOpenFriends
}) {
  return (
    <main className="home">
      <section className="home-hero">
        <div className="eyebrow">
          {isGuest ? `Guest mode: ${playerName}` : `Logged in as ${playerName}`}
        </div>

        <h1>Play. Review. Improve.</h1>

        <p>
          Play the bot, challenge friends, share private links, and build separate bot and friend ratings.
        </p>

        <div className="home-actions">
          <button className="main-btn" type="button" onClick={onStartBot}>
            Play Bot
          </button>
          <button className="soft-btn" type="button" onClick={onOpenFriends}>
            Play Friend
          </button>
        </div>
      </section>

      <section className="mode-grid">
        <div className="mode-card active">
          <span>♟</span>
          <h3>Play Bot</h3>
          <p>Use the Play Bot button above to start a coached match.</p>
        </div>

        <div className="mode-card active">
          <span>🤝</span>
          <h3>Challenge Friends</h3>
          <p>Use the Play Friend button above to host, join, or search players.</p>
        </div>

        <div className="mode-card active">
          <span>📈</span>
          <h3>Stats</h3>
          {isGuest ? (
            <p>Create an account to save ratings and stats.</p>
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
