import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login({ onGuest }) {
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
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            email: email.trim(),
            username: cleanUsername,
            display_name: cleanUsername
          });

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

  return (
    <div className="auth-page">
      <div className="auth-bg-glow auth-bg-glow-one" />
      <div className="auth-bg-glow auth-bg-glow-two" />

      <section className="auth-hero">
        <div className="brand-pill">♟ AI-powered chess training</div>

        <h1>
          Play sharper chess with <span>ChessAI</span>
        </h1>

        <p>
          Challenge the bot, play friends, save stats with an account, or jump in as a guest.
        </p>

        <div className="feature-grid">
          <div>
            <strong>Move ratings</strong>
            <small>Score every move from 1–10.</small>
          </div>
          <div>
            <strong>Play friends</strong>
            <small>Share a link and start a match.</small>
          </div>
          <div>
            <strong>Stats</strong>
            <small>Create an account to save progress.</small>
          </div>
        </div>
      </section>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-header">
          <div className="logo-mark">♞</div>
          <div>
            <h2>{isSignup ? 'Create account' : 'Welcome back'}</h2>
            <p>{isSignup ? 'Save your stats and games.' : 'Login to continue playing.'}</p>
          </div>
        </div>

        {isSignup && (
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
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

        <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18 }}>
          <label>
            Guest name
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest"
            />
          </label>

          <button
            type="button"
            className="switch-auth-btn"
            onClick={() => onGuest?.(guestName)}
          >
            Continue as guest
          </button>

          <small style={{ display: 'block', opacity: 0.7, marginTop: 8 }}>
            Guest games are playable, but stats are only saved with an account.
          </small>
        </div>
      </form>
    </div>
  );
}
