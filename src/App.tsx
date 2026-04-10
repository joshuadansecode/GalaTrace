import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Profile } from './types';
import { Toaster } from 'sonner';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { Loader2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { toast } from 'sonner';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setSession(session);
        setLoading(false);
        return;
      }
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('Minimum 6 caractères'); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Mot de passe mis à jour !');
    setIsPasswordRecovery(false);
    setNewPassword('');
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0a0a0a] text-white">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  // Écran réinitialisation mot de passe
  if (isPasswordRecovery) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <Toaster position="top-right" theme="dark" />
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-1">Nouveau mot de passe</h2>
            <p className="text-zinc-400 text-sm">Choisissez un nouveau mot de passe sécurisé.</p>
          </div>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <Input
              type="password"
              placeholder="Nouveau mot de passe (min. 6 caractères)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="bg-zinc-800 border-zinc-700 text-white"
            />
            <Button type="submit" disabled={savingPassword} className="w-full bg-amber-600 hover:bg-amber-700">
              {savingPassword ? 'Enregistrement...' : 'Confirmer'}
            </Button>
          </form>
        </div>
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
