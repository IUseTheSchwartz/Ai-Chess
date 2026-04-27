import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login({ onGuest, checkingSession = false, theme = 'light', onToggleTheme }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [guestName, setGuestName] = useState('Guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isSignup = mode === 'signup';

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isSignup) {
        const cleanUsername = username.trim();

        if (!cleanUsername) {
          throw new Error('Please choose a username.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: cleanUsername
            }
          }
        });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              email: email.trim(),
              username: cleanUsername,
              display_name: cleanUsername
            },
            { onConflict: 'id' }
          );

          if (profileError) throw profileError;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
      }
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    onGuest?.(guestName.trim() || 'Guest');
  }

  return (
    <div className="auth-page">
      <button className="auth-theme-toggle" type="button" onClick={onToggleTheme}>
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>

      <div className="auth-bg-glow auth-bg-glow-one" />
      <div className="auth-bg-glow auth-bg-glow-two" />

      <section className="auth-hero">
        <div className="brand-pill">♟ AI-powered chess training</div>

        <h1>
          Play sharper chess with <span>ChessAI</span>
        </h1>

        <p>
          Play the bot, challenge friends, share private matches, and save your stats when you create an account.
        </p>

        <div className="feature-grid">
          <div>
            <strong>AI Coach</strong>
            <small>Get move ratings, best moves, and instant feedback.</small>
          </div>

          <div>
            <strong>Play Friends</strong>
            <small>Create a private link and choose side plus timer.</small>
          </div>

          <div>
            <strong>Guest Mode</strong>
            <small>Jump in fast. Make an account later to save stats.</small>
          </div>
        </div>

        {checkingSession && (
          <div className="brand-pill" style={{ marginTop: 22 }}>
            Checking saved login...
          </div>
        )}
      </section>

      <section className="auth-card">
        <form onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <div className="logo-mark">♞</div>
            <div>
              <h2>{isSignup ? 'Create account' : 'Welcome back'}</h2>
              <p>{isSignup ? 'Save your stats and game history.' : 'Login to keep your progress.'}</p>
            </div>
          </div>

          {isSignup && (
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                autoComplete="username"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              minLength={6}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {errorMsg && <div className="error-box">{errorMsg}</div>}

          <button className="primary-auth-btn" disabled={loading}>
            {loading ? 'Please wait...' : isSignup ? 'Create free account' : 'Login'}
          </button>

          <button
            type="button"
            className="switch-auth-btn"
            onClick={() => {
              setMode(isSignup ? 'login' : 'signup');
              setErrorMsg('');
            }}
          >
            {isSignup ? 'Already have an account? Login' : 'New here? Create an account'}
          </button>
        </form>

        <div className="guest-login-box">
          <div>
            <h3>Play as guest</h3>
            <p>No account needed. Stats will not be saved.</p>
          </div>

          <label>
            Guest name
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest"
            />
          </label>

          <button type="button" className="soft-btn guest-btn" onClick={handleGuest}>
            Continue as guest
          </button>
        </div>
      </section>
    </div>
  );
}
