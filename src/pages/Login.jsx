import { supabase } from '../lib/supabaseClient';

export default function Login() {
  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Momentum Chess</h1>
        <p>Play chess, challenge friends, and get coached by AI after every move.</p>
        <button onClick={signIn}>Login with Google</button>
      </div>
    </div>
  );
}
