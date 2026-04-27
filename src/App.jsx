import { useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import ChessGame from './pages/ChessGame';
import './styles.css';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const ensuredUserRef = useRef(null);

  async function ensureProfile(user) {
    if (!user?.id) return;

    if (ensuredUserRef.current === user.id) {
      setProfileReady(true);
      return;
    }

    const username =
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      `player_${user.id.slice(0, 6)}`;

    const displayName =
      user.user_metadata?.display_name ||
      username;

    const { error } = await withTimeout(
      supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        username,
        display_name: displayName
      }),
      7000,
      'Profile setup'
    );

    if (error) throw error;

    ensuredUserRef.current = user.id;
    setProfileReady(true);
  }

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        setSetupError('');

        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          7000,
          'Session check'
        );

        if (error) throw error;
        if (!mounted) return;

        const currentSession = data?.session || null;
        setSession(currentSession);

        if (currentSession?.user) {
          await ensureProfile(currentSession.user);
        } else {
          setProfileReady(false);
        }
      } catch (err) {
        console.error('ChessAI boot error:', err);
        if (!mounted) return;
        setSetupError(err.message || 'ChessAI could not load.');
        setSession(null);
        setProfileReady(false);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      try {
        if (!mounted) return;

        if (event === 'TOKEN_REFRESHED') {
          setSession(newSession);
          return;
        }

        if (event === 'SIGNED_OUT') {
          ensuredUserRef.current = null;
          setSession(null);
          setProfileReady(false);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setSetupError('');
          setSession(newSession);

          if (newSession?.user) {
            await ensureProfile(newSession.user);
          }
        }
      } catch (err) {
        console.error('Auth change error:', err);
        setSetupError(err.message || 'Could not set up your profile.');
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
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
              localStorage.clear();
              sessionStorage.clear();
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
