import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              display_name: username
            }
          }
        });

        if (error) throw error;

        const user = data.user;

        if (user) {
          await supabase.from('profiles').upsert({
            id: user.id,
            email,
            username,
            display_name: username
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
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
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Momentum Chess</h1>

        <p>
          {mode === 'signup'
            ? 'Create your chess account.'
            : 'Login to play chess.'}
        </p>

        {mode === 'signup' && (
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
          />
        )}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          required
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          minLength={6}
          required
        />

        {errorMsg && <div className="error-box">{errorMsg}</div>}

        <button disabled={loading}>
          {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Login'}
        </button>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup');
            setErrorMsg('');
          }}
        >
          {mode === 'signup'
            ? 'Already have an account? Login'
            : 'Need an account? Create one'}
        </button>
      </form>
    </div>
  );
}
