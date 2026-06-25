import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { formatTicketType } from '../lib/utils';
import { CheckCircle2, Clock3, RotateCcw, ScanLine, Users } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryStat = {
  ticket_type_id: string;
  total: number;
  checked_in: number;
};

type RecentScan = {
  id: string;
  buyer_name: string;
  ticket_type_id: string;
  ticket_number: string;
  qr_used_at: string;
  table_name: string | null;
  seat_number: number | null;
};

type Stats = {
  total: number;
  checkedIn: number;
  pending: number;
  byCategory: CategoryStat[];
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  gold_interne:     'bg-yellow-500',
  gold_externe:     'bg-yellow-400',
  platinum_interne: 'bg-slate-400',
  diamond_interne:  'bg-sky-400',
  diamond_externe:  'bg-sky-300',
  royal:            'bg-purple-500',
};

const RECENT_LIMIT = 20;
const REFRESH_INTERVAL_MS = 15_000;

// ─── Composant ────────────────────────────────────────────────────────────────

export default function CheckInDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [stats, setStats] = useState<Stats>({ total: 0, checkedIn: 0, pending: 0, byCategory: [] });
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [resettingId, setResettingId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('checkin-dashboard-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales' }, () => fetchAll())
      .subscribe();

    channelRef.current = channel;
    const timer = window.setInterval(fetchAll, REFRESH_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, []);

  async function fetchAll() {
    await Promise.all([fetchStats(), fetchRecentScans()]);
    setLastRefresh(new Date());
    setLoading(false);
  }

  async function fetchStats() {
    const { data, error } = await supabase
      .from('sales')
      .select('ticket_type_id, qr_token, qr_used_at')
      .not('qr_token', 'is', null);

    if (error || !data) return;

    const total = data.length;
    const checkedIn = data.filter((s) => s.qr_used_at !== null).length;

    const map: Record<string, CategoryStat> = {};
    data.forEach((s) => {
      const key = s.ticket_type_id;
      if (!map[key]) map[key] = { ticket_type_id: key, total: 0, checked_in: 0 };
      map[key].total += 1;
      if (s.qr_used_at) map[key].checked_in += 1;
    });

    setStats({ total, checkedIn, pending: total - checkedIn, byCategory: Object.values(map).sort((a, b) => b.total - a.total) });
  }

  async function fetchRecentScans() {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        buyer_name,
        ticket_type_id,
        ticket_number,
        qr_used_at,
        seat:seats(seat_number, table:tables(name))
      `)
      .not('qr_used_at', 'is', null)
      .order('qr_used_at', { ascending: false })
      .limit(RECENT_LIMIT);

    if (error || !data) return;

    const scans: RecentScan[] = (data as any[]).map((s) => ({
      id:             s.id,
      buyer_name:     s.buyer_name,
      ticket_type_id: s.ticket_type_id,
      ticket_number:  s.ticket_number,
      qr_used_at:     s.qr_used_at,
      table_name:     s.seat?.[0]?.table?.name ?? null,
      seat_number:    s.seat?.[0]?.seat_number ?? null,
    }));

    setRecentScans(scans);
  }

  async function resetOneScan(saleId: string, buyerName: string) {
    if (!confirm(`Réinitialiser le scan de ${buyerName} ?`)) return;
    setResettingId(saleId);
    try {
      const { data, error } = await supabase.rpc('reset_checkins', { p_sale_id: saleId });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || 'Erreur');
        return;
      }
      toast.success(`Scan de ${buyerName} réinitialisé.`);
      fetchAll();
    } finally {
      setResettingId(null);
    }
  }

  const entryRate = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard Jour J</h2>
          <p className="text-zinc-400">Suivi des entrées en temps réel.</p>
        </div>
        <p className="text-xs text-zinc-500 pt-1">
          Dernière mise à jour : {lastRefresh.toLocaleTimeString('fr-FR')}
        </p>
      </header>

      {/* ── Cartes chiffres clés ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5 text-amber-400" />} label="Billets éligibles" value={loading ? '—' : stats.total} sub="QR générés" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-green-400" />} label="Entrées validées" value={loading ? '—' : stats.checkedIn} sub={loading ? '' : `${entryRate}% du total`} highlight="green" />
        <StatCard icon={<Clock3 className="h-5 w-5 text-amber-400" />} label="En attente" value={loading ? '—' : stats.pending} sub="pas encore scannés" highlight="amber" />
        <StatCard icon={<ScanLine className="h-5 w-5 text-sky-400" />} label="Taux d'entrée" value={loading ? '—' : `${entryRate}%`} sub={loading ? '' : `${stats.checkedIn} / ${stats.total}`} highlight="sky" />
      </div>

      {/* ── Barre de progression globale ── */}
      <Card className="border-zinc-800 bg-zinc-900/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-300">Progression globale</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-green-500 transition-all duration-700" style={{ width: `${entryRate}%` }} />
            </div>
            <span className="w-10 text-right text-sm font-bold text-zinc-200">{entryRate}%</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ── Par catégorie ── */}
        <Card className="border-zinc-800 bg-zinc-900/90">
          <CardHeader>
            <CardTitle className="text-base">Par catégorie de ticket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <p className="text-sm text-zinc-500">Chargement…</p> : stats.byCategory.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune donnée.</p>
            ) : stats.byCategory.map((cat) => {
              const pct = cat.total > 0 ? Math.round((cat.checked_in / cat.total) * 100) : 0;
              return (
                <div key={cat.ticket_type_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-zinc-200">{formatTicketType(cat.ticket_type_id)}</span>
                    <span className="text-zinc-400 tabular-nums">{cat.checked_in} / {cat.total}<span className="ml-2 text-xs text-zinc-500">({pct}%)</span></span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${CATEGORY_COLORS[cat.ticket_type_id] ?? 'bg-zinc-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Derniers scans ── */}
        <Card className="border-zinc-800 bg-zinc-900/90">
          <CardHeader>
            <CardTitle className="text-base">Derniers scans</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-zinc-500">Chargement…</p>
            : recentScans.length === 0 ? <p className="text-sm text-zinc-500">Aucun scan enregistré pour le moment.</p>
            : (
              <ul className="space-y-2">
                {recentScans.map((scan, i) => {
                  const seatLabel = scan.table_name
                    ? `Table ${scan.table_name}${scan.seat_number ? ` — Pl. ${scan.seat_number}` : ''}`
                    : scan.seat_number ? `Place ${scan.seat_number}` : null;

                  return (
                    <li key={`${scan.id}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-100">{scan.buyer_name}</p>
                        <p className="text-xs text-zinc-500">
                          {formatTicketType(scan.ticket_type_id)} · {scan.ticket_number}
                          {seatLabel && (
                            <span className="ml-2 text-amber-400 font-semibold">· {seatLabel}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <time className="text-xs text-zinc-500">
                          {new Date(scan.qr_used_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </time>
                        {isAdmin && (
                          <button
                            onClick={() => resetOneScan(scan.id, scan.buyer_name)}
                            disabled={resettingId === scan.id}
                            title="Réinitialiser ce scan"
                            className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sous-composant StatCard ───────────────────────────────────────────────────

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  highlight?: 'green' | 'amber' | 'sky';
};

function StatCard({ icon, label, value, sub, highlight }: StatCardProps) {
  const valueColor = highlight === 'green' ? 'text-green-400' : highlight === 'amber' ? 'text-amber-400' : highlight === 'sky' ? 'text-sky-400' : 'text-zinc-100';
  return (
    <Card className="border-zinc-800 bg-zinc-900/90">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-zinc-500 font-medium">{label}</span></div>
        <p className={`text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-zinc-600">{sub}</p>}
      </CardContent>
    </Card>
  );
}
