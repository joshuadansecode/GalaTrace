import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS, UserRole } from '../types';
import { Input } from './ui/input';
import { Search } from 'lucide-react';

export default function Directory() {
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name')
      .then(({ data }) => setMembers(data || []));
  }, []);

  const filtered = members.filter(m =>
    (m.full_name || m.email).toLowerCase().includes(search.toLowerCase()) ||
    ROLE_LABELS[m.role as UserRole]?.toLowerCase().includes(search.toLowerCase())
  );

  const roleColors: Record<string, string> = {
    admin: 'bg-red-500/10 text-red-400',
    vendeur: 'bg-blue-500/10 text-blue-400',
    comite: 'bg-purple-500/10 text-purple-400',
    tresoriere: 'bg-green-500/10 text-green-400',
    tresoriere_generale: 'bg-teal-500/10 text-teal-400',
    direction: 'bg-amber-500/10 text-amber-400',
    observateur: 'bg-zinc-500/10 text-zinc-400',
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Annuaire</h2>
        <p className="text-zinc-400">Tous les membres actifs du comité.</p>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input placeholder="Rechercher par nom ou rôle..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(m => (
          <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors">
            <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center text-lg font-bold">
              {m.avatar_url
                ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                : (m.full_name || m.email)[0].toUpperCase()
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{m.full_name || '—'}</p>
              <p className="text-xs text-zinc-500 truncate mb-1">{m.email}</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${roleColors[m.role] || 'bg-zinc-700 text-zinc-400'}`}>
                {ROLE_LABELS[m.role as UserRole]}
              </span>
            </div>
            {m.phone && (
              <a href={`https://wa.me/${m.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                className="shrink-0 w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 hover:bg-green-500/20 transition-colors"
                title={m.phone}>
                📱
              </a>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-zinc-500 text-sm col-span-3 text-center py-8">Aucun membre trouvé.</p>
        )}
      </div>
    </div>
  );
}
