import { playerName as getPlayerName } from '../../lib/chessHelpers';

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
  requests,
  onCreateFriendGame,
  onJoinFriendGame,
  onSearchUsers,
  onSendFriendRequest,
  onAcceptRequest,
  onDenyRequest
}) {
  return (
    <main className="friends-page">
      <section className="friends-hero">
        <div>
          <div className="eyebrow">Friend games</div>
          <h1>Play friends your way.</h1>
          <p>
            Pick a side, choose a timer, challenge a friend, or create a private link anyone can
            join.
          </p>
        </div>

        <div className="friends-quick-card">
          <span>⚡</span>
          <strong>Quick match setup</strong>
          <small>Private invite links support logged-in users and guests.</small>
        </div>
      </section>

      <section className="friends-layout">
        <div className="friends-main-stack">
          <div className="friend-panel">
            <div className="friend-panel-header">
              <div>
                <h2>Create Match</h2>
                <p>Choose your side and timer before creating the invite.</p>
              </div>
            </div>

            <div className="match-settings-grid">
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

              <button className="main-btn" type="button" onClick={() => onCreateFriendGame()}>
                Create Share Link
              </button>
            </div>

            {inviteLink && (
              <div className="invite-box">
                <small>Your invite link</small>
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
                <p>Paste a friend’s invite code or open their shared link.</p>
              </div>
            </div>

            <div className="join-row">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Paste invite code"
              />
              <button className="soft-btn" type="button" onClick={() => onJoinFriendGame()}>
                Join
              </button>
            </div>
          </div>
        </div>

        <aside className="friends-side-stack">
          {isGuest ? (
            <div className="friend-panel">
              <h2>Guest Mode</h2>
              <p className="muted">
                You can play using invite links, but friend lists and saved stats require an
                account.
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
                    placeholder="Search player"
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
                          <small>{user.elo || 800} ELO</small>
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
                    <h2>Requests</h2>
                    <p>{requests.length} pending</p>
                  </div>
                </div>

                <div className="people-list">
                  {requests.length === 0 ? (
                    <p className="muted">No pending requests.</p>
                  ) : (
                    requests.map((request) => (
                      <div className="person-row" key={request.id}>
                        <div>
                          <strong>{getPlayerName(request.profiles)}</strong>
                          <small>Wants to be friends</small>
                        </div>
                        <div className="row-actions">
                          <button
                            className="soft-btn"
                            type="button"
                            onClick={() => onAcceptRequest(request)}
                          >
                            Accept
                          </button>
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => onDenyRequest(request.id)}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="friend-panel">
                <div className="friend-panel-header">
                  <div>
                    <h2>Friends</h2>
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
                          <small>{friend.profiles?.elo || 800} ELO</small>
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
