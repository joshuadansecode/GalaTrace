/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Profile } from './types';
import { Toaster } from 'sonner';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        // Handled by ResetPassword component
        return;
      }
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0a0a0a] text-white">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <Toaster position="top-right" theme="dark" />
      {!session ? (
        <Auth />
      ) : profile && !profile.is_active ? (
        <div className="h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-full border border-amber-500/20">
            <Loader2 className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold">Compte en attente de validation</h2>
          <p className="text-zinc-400 max-w-sm">Votre compte a été créé. Un administrateur doit l'activer avant que vous puissiez accéder à l'application.</p>
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-zinc-500 hover:text-white mt-2">Se déconnecter</button>
        </div>
      ) : (
        <Dashboard profile={profile} session={session} />
      )}
    </div>
  );
}
