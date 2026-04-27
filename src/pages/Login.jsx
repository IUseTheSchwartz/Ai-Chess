import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
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
          Challenge the bot, review every move, and get instant AI feedback after your move is locked in.
        </p>

        <div className="feature-grid">
          <div>
            <strong>Move ratings</strong>
            <small>Score every move from 1–10.</small>
          </div>
          <div>
            <strong>Best move coach</strong>
            <small>See what you should have played.</small>
          </div>
          <div>
            <strong>Game history</strong>
            <small>Save your progress and improve.</small>
          </div>
        </div>
      </section>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-header">
          <div className="logo-mark">♞</div>
          <div>
            <h2>{isSignup ? 'Create account' : 'Welcome back'}</h2>
            <p>{isSignup ? 'Start training in seconds.' : 'Login to continue playing.'}</p>
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
      </form>
    </div>
  );
}
