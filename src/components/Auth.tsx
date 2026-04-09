import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Vérifiez votre email pour confirmer votre inscription !');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Connexion réussie');
      }
    } catch (error: any) {
      toast.error(error.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/20 via-black to-black">
      <Card className="w-full max-w-md bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-amber-500/10 rounded-full border border-amber-500/20">
              <Ticket className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">GalaTrace</CardTitle>
          <CardDescription className="text-zinc-400">
            {isSignUp ? 'Créez votre compte pour commencer' : 'Connectez-vous à votre espace de gestion'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-all"
              disabled={loading}
            >
              {loading ? 'Chargement...' : isSignUp ? "S'inscrire" : 'Se connecter'}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-zinc-400 hover:text-amber-500 transition-colors"
            >
              {isSignUp ? 'Déjà un compte ? Connectez-vous' : "Pas encore de compte ? S'inscrire"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
