import { useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import ChessGame from './pages/ChessGame';
import './styles.css';

const SESSION_RESTORE_TIMEOUT_MS = 20000;
const PROFILE_SETUP_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

async function waitForSession(timeoutMs = SESSION_RESTORE_TIMEOUT_MS) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data?.session) {
        return data.session;
      }
    } catch (err) {
      lastError = err;
    }

    await sleep(300);
  }

  if (lastError) {
    console.warn('Session restore warning:', lastError);
  }

  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const ensuredUserRef = useRef(null);
  const bootedRef = useRef(false);

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
      user.user_metadata?.full_name ||
      username;

    const { error } = await withTimeout(
      supabase.from('profiles').upsert(
        {
          id: user.id,
          email: user.email,
          username,
          display_name: displayName
        },
        {
          onConflict: 'id'
        }
      ),
      PROFILE_SETUP_TIMEOUT_MS,
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
        setLoading(true);
        setSetupError('');

        const restoredSession = await waitForSession();

        if (!mounted) return;

        setSession(restoredSession);

        if (restoredSession?.user) {
          await ensureProfile(restoredSession.user);
        } else {
          setProfileReady(false);
        }
      } catch (err) {
        console.error('ChessAI boot error:', err);

        if (!mounted) return;

        setSetupError(err.message || 'ChessAI could not load.');
        setProfileReady(false);

        /*
          Important:
          Do NOT force setSession(null) here.
          A slow browser tab restore should not kick the user out.
        */
      } finally {
        if (mounted) {
          bootedRef.current = true;
          setLoading(false);
        }
      }
    }

    boot();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      try {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          ensuredUserRef.current = null;
          setSession(null);
          setProfileReady(false);
          setSetupError('');
          setLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (newSession) {
            setSession(newSession);
          }
          return;
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setSetupError('');

          if (newSession) {
            setSession(newSession);

            if (newSession.user) {
              await ensureProfile(newSession.user);
            }
          } else if (bootedRef.current) {
            setSession(null);
            setProfileReady(false);
          }

          setLoading(false);
        }
      } catch (err) {
        console.error('Auth change error:', err);
        setSetupError(err.message || 'Could not set up your profile.');
        setLoading(false);
      }
    });

    async function refreshSessionOnReturn() {
      if (document.visibilityState !== 'visible') return;

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (data?.session) {
          setSession(data.session);

          if (data.session.user) {
            setSetupError('');
            await ensureProfile(data.session.user);
          }
        }
      } catch (err) {
        console.warn('Session refresh on return failed:', err);
        /*
          Do not log them out here.
          Tab switching can briefly interrupt auth storage access.
        */
      }
    }

    window.addEventListener('focus', refreshSessionOnReturn);
    document.addEventListener('visibilitychange', refreshSessionOnReturn);

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
      window.removeEventListener('focus', refreshSessionOnReturn);
      document.removeEventListener('visibilitychange', refreshSessionOnReturn);
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
