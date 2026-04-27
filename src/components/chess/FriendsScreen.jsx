import { playerName as getPlayerName, ratingLabel } from '../../lib/chessHelpers';

export default function FriendsScreen({
  isGuest,
  selectedSide,
  setSelectedSide,
  timeControl,
  setTimeControl,
  inviteLink,
  joinCode,
  setJoinCode,
  friendSearch,
  setFriendSearch,
  friendResults,
  friends,
  onCreateFriendGame,
  onJoinFriendGame,
  onSearchUsers,
  onSendFriendRequest
}) {
  return (
    <main className="friends-page">
      <section className="friends-hero clean-friends-hero">
        <div>
          <div className="eyebrow">Play friends</div>
          <h1>Host or join a private chess match.</h1>
          <p>Create a game code, share the link, or join with a code from a friend.</p>
        </div>
      </section>

      <section className="friends-layout">
        <div className="friends-main-stack">
          <div className="friend-panel host-panel">
            <div className="friend-panel-header">
              <div>
                <h2>Host Game</h2>
                <p>Choose your side and timer. Your game starts when another player joins.</p>
              </div>
            </div>

            <div className="match-settings-grid">
              <label>
                Your side
                <select value={selectedSide} onChange={(e) => setSelectedSide(e.target.value)}>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                  <option value="random">Random</option>
                </select>
              </label>

              <label>
                Time
                <select value={timeControl} onChange={(e) => setTimeControl(Number(e.target.value))}>
                  <option value={60}>1 minute</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                </select>
              </label>

              <button className="main-btn" type="button" onClick={() => onCreateFriendGame()}>
                Host Game
              </button>
            </div>

            {inviteLink && (
              <div className="invite-box">
                <small>Game link</small>
                <p>{inviteLink}</p>
                <button
                  className="soft-btn"
                  type="button"
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                >
                  Copy Link
                </button>
              </div>
            )}
          </div>

          <div className="friend-panel">
            <div className="friend-panel-header">
              <div>
                <h2>Join Game</h2>
                <p>Enter the game code your friend sent you.</p>
              </div>
            </div>

            <div className="join-row">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Game code"
              />
              <button className="soft-btn" type="button" onClick={() => onJoinFriendGame()}>
                Join Game
              </button>
            </div>
          </div>
        </div>

        <aside className="friends-side-stack">
          {isGuest ? (
            <div className="friend-panel">
              <h2>Guest Mode</h2>
              <p className="muted">
                Guests can host and join games. Create an account to save friends and rankings.
              </p>
            </div>
          ) : (
            <>
              <div className="friend-panel">
                <div className="friend-panel-header">
                  <div>
                    <h2>Find Players</h2>
                    <p>Search by username, display name, or email.</p>
                  </div>
                </div>

                <div className="join-row">
                  <input
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    placeholder="Search username"
                  />
                  <button className="soft-btn" type="button" onClick={onSearchUsers}>
                    Search
                  </button>
                </div>

                <div className="people-list">
                  {friendResults.length === 0 ? (
                    <p className="muted">Search for someone to add them.</p>
                  ) : (
                    friendResults.map((user) => (
                      <div className="person-row" key={user.id}>
                        <div>
                          <strong>{getPlayerName(user)}</strong>
                          <small>
                            {ratingLabel(user.friend_rating || 800, user.friend_games_completed || 0)} friend rating
                          </small>
                        </div>
                        <button
                          className="soft-btn"
                          type="button"
                          onClick={() => onSendFriendRequest(user.id)}
                        >
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="friend-panel">
                <div className="friend-panel-header">
                  <div>
                    <h2>Your Friends</h2>
                    <p>{friends.length} saved</p>
                  </div>
                </div>

                <div className="people-list">
                  {friends.length === 0 ? (
                    <p className="muted">No friends yet.</p>
                  ) : (
                    friends.map((friend) => (
                      <div className="person-row" key={friend.friend_id}>
                        <div>
                          <strong>{getPlayerName(friend.profiles)}</strong>
                          <small>
                            {ratingLabel(
                              friend.profiles?.friend_rating || 800,
                              friend.profiles?.friend_games_completed || 0
                            )}{' '}
                            friend rating
                          </small>
                        </div>
                        <button
                          className="soft-btn"
                          type="button"
                          onClick={() => onCreateFriendGame(friend.friend_id)}
                        >
                          Challenge
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
