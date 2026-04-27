import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import ChessGame from './pages/ChessGame';
import './styles.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);

  async function ensureProfile(user) {
    if (!user) return;

    const username =
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      `player_${user.id.slice(0, 6)}`;

    const displayName =
      user.user_metadata?.display_name ||
      username;

    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      username,
      display_name: displayName
    });

    setProfileReady(true);
  }

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      setSession(data.session);

      if (data.session?.user) {
        await ensureProfile(data.session.user);
      }

      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setProfileReady(false);

      if (newSession?.user) {
        await ensureProfile(newSession.user);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading-screen">Loading ChessAI...</div>;

  if (!session) return <Login />;

  if (!profileReady) return <div className="loading-screen">Setting up your profile...</div>;

  return <ChessGame session={session} />;
}
