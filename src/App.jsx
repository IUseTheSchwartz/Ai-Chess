import { useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import ChessGame from './pages/ChessGame';
import './styles.css';

const QUICK_SESSION_TIMEOUT_MS = 1800;
const PROFILE_SETUP_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

function getStoredGuest() {
  try {
    return JSON.parse(localStorage.getItem('chessai_guest') || 'null');
  } catch {
    return null;
  }
}

function getStoredTheme() {
  return localStorage.getItem('chessai_theme') || 'light';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [guest, setGuest] = useState(() => getStoredGuest());
  const [checkingSession, setCheckingSession] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [theme, setTheme] = useState(() => getStoredTheme());

  const ensuredUserRef = useRef(null);
  const mountedRef = useRef(true);

  const isDark = theme === 'dark';

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('chessai_theme', theme);
  }, [theme, isDark]);

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  async function ensureProfile(user) {
    if (!user?.id) return;

    if (ensuredUserRef.current === user.id) return;

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
  }

  function continueAsGuest(name = 'Guest') {
    const existingGuest = getStoredGuest();

    const guestUser =
      existingGuest || {
        id: `guest_${crypto.randomUUID()}`,
        name: name.trim() || 'Guest'
      };

    localStorage.setItem('chessai_guest', JSON.stringify(guestUser));
    setGuest(guestUser);
    setSession(null);
    setCheckingSession(false);
  }

  async function signOutGuestAndUser() {
    localStorage.removeItem('chessai_guest');
    setGuest(null);
    setSession(null);
    ensuredUserRef.current = null;
    await supabase.auth.signOut();
  }

  useEffect(() => {
    mountedRef.current = true;

    async function bootFast() {
      setSetupError('');

      try {
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          QUICK_SESSION_TIMEOUT_MS,
          'Session check'
        );

        if (!mountedRef.current) return;

        if (data?.session) {
          setSession(data.session);
          setGuest(null);
          localStorage.removeItem('chessai_guest');

          ensureProfile(data.session.user).catch((err) => {
            console.error('Profile setup error:', err);
            if (mountedRef.current) {
              setSetupError(err.message || 'Could not set up your profile.');
            }
          });
        }
      } catch (err) {
        console.warn('Fast session restore skipped:', err);
      } finally {
        if (mountedRef.current) setCheckingSession(false);
      }
    }

    bootFast();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      try {
        if (!mountedRef.current) return;

        if (event === 'SIGNED_OUT') {
          ensuredUserRef.current = null;
          setSession(null);
          setSetupError('');
          setCheckingSession(false);
          return;
        }

        if (newSession) {
          setSession(newSession);
          setGuest(null);
          localStorage.removeItem('chessai_guest');
          setCheckingSession(false);

          await ensureProfile(newSession.user);
        }
      } catch (err) {
        console.error('Auth change error:', err);
        setSetupError(err.message || 'Could not set up your profile.');
        setCheckingSession(false);
      }
    });

    async function refreshOnReturn() {
      try {
        const { data } = await supabase.auth.getSession();

        if (data?.session) {
          setSession(data.session);
          setGuest(null);
          localStorage.removeItem('chessai_guest');

          ensureProfile(data.session.user).catch(console.error);
        }
      } catch (err) {
        console.warn('Session refresh failed:', err);
      }
    }

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshOnReturn();
    });

    return () => {
      mountedRef.current = false;
      listener?.subscription?.unsubscribe?.();
      window.removeEventListener('focus', refreshOnReturn);
    };
  }, []);

  if (setupError) {
    return (
      <div className="loading-screen">
        <div className="setup-error-card">
          <h2>ChessAI setup error</h2>
          <p>{setupError}</p>
          <button onClick={signOutGuestAndUser}>Reset Login</button>
        </div>
      </div>
    );
  }

  if (!session && !guest) {
    return (
      <Login
        onGuest={continueAsGuest}
        checkingSession={checkingSession}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <ChessGame
      session={session}
      guest={guest}
      onSignOut={signOutGuestAndUser}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}
