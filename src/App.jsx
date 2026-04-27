import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import ChessGame from './pages/ChessGame';
import './styles.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');

  async function ensureProfile(user) {
    if (!user) return;

    const username =
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      `player_${user.id.slice(0, 6)}`;

    const displayName =
      user.user_metadata?.display_name ||
      username;

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      username,
      display_name: displayName
    });

    if (error) {
      throw error;
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        setSetupError('');

        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!mounted) return;

        setSession(data.session);

        if (data.session?.user) {
          await ensureProfile(data.session.user);
          if (!mounted) return;
          setProfileReady(true);
        } else {
          setProfileReady(false);
        }
      } catch (err) {
        console.error('App setup error:', err);
        if (mounted) {
          setSetupError(err.message || 'Could not load ChessAI.');
          setSession(null);
          setProfileReady(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      try {
        setSetupError('');
        setSession(newSession);
        setProfileReady(false);

        if (newSession?.user) {
          await ensureProfile(newSession.user);
          setProfileReady(true);
        }
      } catch (err) {
        console.error('Auth profile error:', err);
        setSetupError(err.message || 'Could not set up your profile.');
        setProfileReady(false);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading ChessAI...</div>;
  }

  if (setupError) {
    return (
      <div className="loading-screen" style={{ padding: 24, textAlign: 'center' }}>
        <div>
          <h2>ChessAI setup error</h2>
          <p>{setupError}</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
          >
            Reset Login
          </button>
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

  if (!profileReady) {
    return <div className="loading-screen">Setting up your profile...</div>;
  }

  return <ChessGame session={session} />;
}
