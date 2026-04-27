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

  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    await sleep(300);
  }

  return null;
}

function getStoredGuest() {
  try {
    return JSON.parse(localStorage.getItem('chessai_guest') || 'null');
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [guest, setGuest] = useState(() => getStoredGuest());
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
        { onConflict: 'id' }
      ),
      PROFILE_SETUP_TIMEOUT_MS,
      'Profile setup'
    );

    if (error) throw error;

    ensuredUserRef.current = user.id;
    setProfileReady(true);
  }

  function continueAsGuest(name = 'Guest') {
    const guestUser = {
      id: `guest_${crypto.randomUUID()}`,
      name: name.trim() || 'Guest'
    };

    localStorage.setItem('chessai_guest', JSON.stringify(guestUser));
    setGuest(guestUser);
  }

  async function signOutGuestAndUser() {
    localStorage.removeItem('chessai_guest');
    setGuest(null);
    await supabase.auth.signOut();
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
      } finally {
        if (mounted) setLoading(false);
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

        if (newSession) {
          setSession(newSession);
          setGuest(null);
          localStorage.removeItem('chessai_guest');
          await ensureProfile(newSession.user);
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth change error:', err);
        setSetupError(err.message || 'Could not set up your profile.');
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <div className="loading-screen">Loading ChessAI...</div>;

  if (setupError) {
    return (
      <div className="loading-screen" style={{ padding: 24, textAlign: 'center' }}>
        <div>
          <h2>ChessAI setup error</h2>
          <p>{setupError}</p>
          <button onClick={signOutGuestAndUser}>Reset Login</button>
        </div>
      </div>
    );
  }

  if (!session && !guest) {
    return <Login onGuest={continueAsGuest} />;
  }

  if (session && !profileReady) {
    return <div className="loading-screen">Setting up your profile...</div>;
  }

  return (
    <ChessGame
      session={session}
      guest={guest}
      onSignOut={signOutGuestAndUser}
    />
  );
}
