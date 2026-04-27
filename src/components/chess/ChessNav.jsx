export default function ChessNav({
  isGuest,
  theme,
  onToggleTheme,
  onGoMenu,
  onSignOut,
  onStartNewGame,
  onResignGame,
  showMenu = false,
  showGameActions = false,
  gameStatus
}) {
  return (
    <nav className="nav">
      <div className="brand" onClick={onGoMenu}>
        <div className="brand-icon">♞</div>
        <span>ChessAI</span>
      </div>

      <div className="nav-actions">
        <button className="theme-toggle-btn" type="button" onClick={onToggleTheme}>
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>

        {showMenu && (
          <button className="ghost-btn" type="button" onClick={onGoMenu}>
            Menu
          </button>
        )}

        {showGameActions && (
          <>
            <button className="ghost-btn" type="button" onClick={onStartNewGame}>
              New Bot Game
            </button>

            {gameStatus === 'active' && (
              <button className="ghost-btn" type="button" onClick={onResignGame}>
                Resign
              </button>
            )}
          </>
        )}

        {!showGameActions && !showMenu && (
          <button className="ghost-btn" type="button" onClick={onSignOut}>
            {isGuest ? 'Exit Guest' : 'Logout'}
          </button>
        )}
      </div>
    </nav>
  );
}
