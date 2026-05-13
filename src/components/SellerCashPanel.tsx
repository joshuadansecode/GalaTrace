import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { notify, notifyRole } from '../lib/notify';
import { ArrowUpRight, HandCoins, Wallet, AlertTriangle, BadgeDollarSign } from 'lucide-react';

interface Props {
  sellerId: string;
  sellerName?: string;
  canRecord?: boolean; // TG / Admin peuvent enregistrer un versement
  onVersionmentRecorded?: () => void;
}

interface SellerStats {
  quotaTotal: number;
  ticketsSold: number;
  ticketsRemaining: number;
  totalSalesAmount: number;
  totalCollected: number;
  totalVersed: number;
  keptInHand: number;
  notYetCollected: number;
  transfers: any[];
}

export default function SellerCashPanel({ sellerId, sellerName, canRecord, onVersionmentRecorded }: Props) {
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStats();
    const channel = supabase.channel(`seller-cash-${sellerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transfers' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchStats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sellerId]);

  async function fetchStats() {
    setLoading(true);
    const [quotasRes, salesRes, paymentsRes, transfersRes] = await Promise.all([
      supabase.from('quotas').select('quantity_given').eq('seller_id', sellerId),
      supabase.from('sales').select('final_price, payments(amount)').eq('seller_id', sellerId),
      supabase.from('payments').select('amount').eq('collector_id', sellerId),
      supabase.from('cash_transfers')
        .select('*, to:profiles!to_id(full_name, email)')
        .eq('from_id', sellerId)
        .eq('status', 'valide')
        .order('created_at', { ascending: false })
    ]);

    const quotaTotal = (quotasRes.data || []).reduce((a, q) => a + q.quantity_given, 0);
    const ticketsSold = (salesRes.data || []).length;
    const totalSalesAmount = (salesRes.data || []).reduce((a, s) => a + s.final_price, 0);
    const totalCollected = (paymentsRes.data || []).reduce((a, p) => a + p.amount, 0);
    const totalVersed = (transfersRes.data || []).reduce((a, t) => a + t.amount, 0);

    setStats({
      quotaTotal,
      ticketsSold,
      ticketsRemaining: Math.max(0, quotaTotal - ticketsSold),
      totalSalesAmount,
      totalCollected,
      totalVersed,
      keptInHand: totalCollected - totalVersed,
      notYetCollected: totalSalesAmount - totalCollected,
      transfers: transfersRes.data || []
    });
    setLoading(false);
  }

  async function handleRecord(e: FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('cash_transfers').insert([{
      from_id: sellerId,
      to_id: user!.id,
      amount,
      status: 'valide'
    }]);
    setSaving(false);
    if (error) { return; }
    // Notifier le vendeur que son versement a été enregistré
    await notify(sellerId, 'Versement enregistré', `La Trésorière Générale a enregistré un versement de ${amount.toLocaleString()} F`, 'success');
    setAmount(0);
    fetchStats();
    onVersionmentRecorded?.();
  }

  if (loading) return <div className="text-zinc-500 text-sm py-4 text-center">Chargement...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-5">
      {sellerName && <p className="font-bold text-lg">{sellerName}</p>}

      {/* Métriques */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Quota alloué</p>
          <p className="text-xl font-bold">{stats.quotaTotal}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Tickets vendus</p>
          <p className="text-xl font-bold text-amber-500">{stats.ticketsSold}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Tickets restants</p>
          <p className="text-xl font-bold">{stats.ticketsRemaining}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Valeur totale ventes</p>
          <p className="text-xl font-bold">{stats.totalSalesAmount.toLocaleString()} F</p>
        </div>
      </div>

      {/* Flux financier */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700/70 bg-zinc-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-green-400"><span className="h-2 w-2 rounded-full bg-green-500" /> Encaissé</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-400"><span className="h-2 w-2 rounded-full bg-blue-500" /> Versé TG</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-500" /> Gardé en main</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-red-400"><span className="h-2 w-2 rounded-full bg-red-500" /> À collecter</span>
        </div>
        <div className="flex justify-between items-center rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-green-300">Total encaissé</span>
            <p className="text-[11px] text-green-200/70">Somme déjà reçue sur les ventes</p>
          </div>
          <span className="font-bold text-green-400">{stats.totalCollected.toLocaleString()} F</span>
        </div>
        <div className="flex justify-between items-center rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">Total versé à la TG</span>
            <p className="text-[11px] text-blue-200/70">Montants déjà reversés</p>
          </div>
          <span className="font-bold text-blue-400">{stats.totalVersed.toLocaleString()} F</span>
        </div>
        <div className="flex justify-between items-center rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">Gardé en main</span>
            <p className="text-[11px] text-amber-200/70">Montant encore en caisse</p>
          </div>
          <span className="font-bold text-amber-400">{stats.keptInHand.toLocaleString()} F</span>
        </div>
        <div className="flex justify-between items-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-red-300">Non encore collecté</span>
            <p className="text-[11px] text-red-200/70">Montant prioritaire à récupérer</p>
          </div>
          <span className="font-bold text-red-400">{stats.notYetCollected.toLocaleString()} F</span>
        </div>
      </div>

      {/* Enregistrer versement (TG / Admin) */}
      {canRecord && (
        <form onSubmit={handleRecord} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number" min={1} value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="Montant reçu..."
              className="w-full rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button type="submit" disabled={saving || amount <= 0}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
            Enregistrer
          </button>
        </form>
      )}

      {/* Historique versements */}
      {stats.transfers.length > 0 && (
        <div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Historique des versements</p>
          <div className="space-y-2">
            {stats.transfers.map((t: any) => (
              <div key={t.id} className="flex justify-between items-center text-sm bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-800">
                <div>
                  <p className="font-medium text-blue-400">+{t.amount.toLocaleString()} F</p>
                  <p className="text-xs text-zinc-500">vers {t.to?.full_name || t.to?.email || '?'}</p>
                </div>
                <p className="text-xs text-zinc-600">{new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
