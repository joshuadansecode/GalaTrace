import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { ShoppingCart, CreditCard, ArrowRightLeft, Receipt, Clock } from 'lucide-react';

interface FeedItem {
  id: string;
  type: 'sale' | 'payment' | 'transfer' | 'expense';
  label: string;
  amount: number;
  date: string;
  actor?: string;
}

const isFinanceRole = (role: string) =>
  ['admin', 'tresoriere', 'tresoriere_generale', 'direction'].includes(role);

export default function ActivityFeed({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');

  useEffect(() => {
    fetchFeed();
    const channel = supabase.channel('activity-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchFeed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchFeed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchFeed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transfers' }, fetchFeed)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchFeed() {
    setLoading(true);
    const feed: FeedItem[] = [];

    const salesQuery = isFinanceRole(profile.role)
      ? supabase.from('sales').select('id, buyer_name, final_price, created_at, seller:profiles!seller_id(full_name, email), ticket_type_id').order('created_at', { ascending: false }).limit(30)
      : supabase.from('sales').select('id, buyer_name, final_price, created_at, ticket_type_id').eq('seller_id', profile.id).order('created_at', { ascending: false }).limit(30);

    const [salesRes, paymentsRes, expensesRes, transfersRes] = await Promise.all([
      salesQuery,
      isFinanceRole(profile.role)
        ? supabase.from('payments').select('id, amount, created_at, collector:profiles!collector_id(full_name, email), sale:sales!sale_id(buyer_name)').order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
      isFinanceRole(profile.role)
        ? supabase.from('expenses').select('id, title, author, amount, validation_status, created_at').order('created_at', { ascending: false }).limit(20)
        : Promise.resolve({ data: [] }),
      isFinanceRole(profile.role)
        ? supabase.from('cash_transfers').select('id, amount, status, created_at, from:profiles!from_id(full_name, email), to:profiles!to_id(full_name, email)').order('created_at', { ascending: false }).limit(20)
        : Promise.resolve({ data: [] }),
    ]);

    (salesRes.data || []).forEach((s: any) => {
      const actor = s.seller ? (s.seller.full_name || s.seller.email) : 'Vendeur';
      feed.push({
        id: `sale-${s.id}`,
        type: 'sale',
        label: `${actor} a vendu un billet ${s.ticket_type_id} à ${s.buyer_name}`,
        amount: s.final_price,
        date: s.created_at,
        actor,
      });
    });

    (paymentsRes.data || []).forEach((p: any) => {
      const collector = p.collector?.full_name || p.collector?.email || 'Inconnu';
      const buyer = p.sale?.buyer_name || 'Inconnu';
      feed.push({
        id: `payment-${p.id}`,
        type: 'payment',
        label: `Paiement encaissé pour ${buyer} par ${collector}`,
        amount: p.amount,
        date: p.created_at,
      });
    });

    (expensesRes.data || []).forEach((e: any) => {
      feed.push({
        id: `expense-${e.id}`,
        type: 'expense',
        label: `Dépense "${e.title}" (${e.author}) — ${e.validation_status === 'validee' ? 'Validée' : e.validation_status === 'rejetee' ? 'Rejetée' : 'En attente'}`,
        amount: e.amount,
        date: e.created_at,
      });
    });

    (transfersRes.data || []).forEach((t: any) => {
      const from = t.from?.full_name || t.from?.email || '?';
      const to = t.to?.full_name || t.to?.email || '?';
      feed.push({
        id: `transfer-${t.id}`,
        type: 'transfer',
        label: `Transfert de ${from} → ${to} (${t.status})`,
        amount: t.amount,
        date: t.created_at,
      });
    });

    feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setItems(feed.slice(0, 50));
    setLoading(false);
  }

  const icons = {
    sale: <ShoppingCart className="w-4 h-4 text-blue-400" />,
    payment: <CreditCard className="w-4 h-4 text-green-400" />,
    transfer: <ArrowRightLeft className="w-4 h-4 text-amber-400" />,
    expense: <Receipt className="w-4 h-4 text-red-400" />,
  };

  const colors = {
    sale: 'border-blue-500/20 bg-blue-500/5',
    payment: 'border-green-500/20 bg-green-500/5',
    transfer: 'border-amber-500/20 bg-amber-500/5',
    expense: 'border-red-500/20 bg-red-500/5',
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  if (loading) return <div className="text-zinc-500 text-sm py-10 text-center">Chargement...</div>;

  const now = Date.now();
  const filterMs: Record<string, number> = { today: 86400000, week: 604800000, month: 2592000000, all: Infinity };
  const filtered = items.filter(i => now - new Date(i.date).getTime() <= filterMs[filter]);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Flux d'Activité</h2>
          <p className="text-zinc-400">Historique en temps réel des événements du système.</p>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${filter === f ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
              {f === 'today' ? "Aujourd'hui" : f === 'week' ? 'Semaine' : f === 'month' ? 'Mois' : 'Tout'}
            </button>
          ))}
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-sm py-10 text-center">Aucune activité sur cette période.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className={`flex items-start gap-4 p-4 rounded-xl border ${colors[item.type]}`}>
              <div className="mt-0.5">{icons[item.type]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200">{item.label}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3 h-3 text-zinc-600" />
                  <span className="text-xs text-zinc-500">{timeAgo(item.date)}</span>
                </div>
              </div>
              <span className="text-sm font-bold text-zinc-300 whitespace-nowrap">
                {item.amount.toLocaleString()} F
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
