import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, TicketType, Sale, Quota } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { Plus, Wallet, Ticket, PieChart as PieChartIcon, Pencil, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import ContextMenu from './ContextMenu';
import SellerCashPanel from './SellerCashPanel';

export default function SellerView({ profile }: { profile: Profile }) {
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  // Form state
  const [buyerName, setBuyerName] = useState('');
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountSource, setDiscountSource] = useState('');
  const [notes, setNotes] = useState('');
  const [initialPayment, setInitialPayment] = useState(0);
  const [ticketNumber, setTicketNumber] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [filiere, setFiliere] = useState('');
  const [annee, setAnnee] = useState('');
  const [quickMode, setQuickMode] = useState(false);
  const fieldClass = 'w-full rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 shadow-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30';

  // Modal state
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  // Edit state
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [editBuyerName, setEditBuyerName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTicketNumber, setEditTicketNumber] = useState('');
  const [editBuyerPhone, setEditBuyerPhone] = useState('');
  const [editDiscountAmount, setEditDiscountAmount] = useState(0);
  const [editDiscountSource, setEditDiscountSource] = useState('');

  // Waive modal
  const [waivingSale, setWaivingSale] = useState<any | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveSaving, setWaiveSaving] = useState(false);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('seller-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `seller_id=eq.${profile.id}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [ttRes, salesRes, quotasRes] = await Promise.all([
        supabase.from('ticket_types').select('*'),
      supabase.from('sales').select('*, payments(amount)').eq('seller_id', profile.id),
        supabase.from('quotas').select('*').eq('seller_id', profile.id)
      ]);

      if (ttRes.error) throw ttRes.error;
      if (salesRes.error) throw salesRes.error;
      if (quotasRes.error) throw quotasRes.error;

      setTicketTypes(ttRes.data || []);
      setQuotas(quotasRes.data || []);
      
      const processedSales = (salesRes.data || []).map((s: any) => {
        const totalPaid = s.payments.reduce((acc: number, p: any) => acc + p.amount, 0);
        const isWaived = !!s.waived_at;
        return {
          ...s,
          total_paid: totalPaid,
          remaining_balance: isWaived ? 0 : s.final_price - totalPaid,
          is_waived: isWaived,
        };
      });
      setSales(processedSales);
    } catch (error: any) {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }

  // Quota & Chart Computation
  const quotaStats = ticketTypes.map(tt => {
    const quota = quotas.find(q => q.ticket_type_id === tt.id)?.quantity_given || 0;
    const sold = sales.filter(s => s.ticket_type_id === tt.id).length;
    return {
      name: tt.name,
      id: tt.id,
      quota,
      sold,
      remaining: Math.max(0, quota - sold)
    };
  }).filter(q => q.quota > 0 || q.sold > 0); // Show if they have quota OR have sold some
  const visibleQuotaStats = quotaStats.filter(q => q.quota > 0 || q.sold > 0);

  const hasAnyQuota = quotas.length > 0;
  const selectedQuotaStat = quotaStats.find(q => q.id === selectedTicketType);
  const isQuotaExceeded = hasAnyQuota && selectedTicketType ? 
    ((selectedQuotaStat?.remaining || 0) <= 0) : false;

  const chartData = quotaStats.map(qs => ({
    name: qs.name,
    value: qs.sold
  })).filter(d => d.value > 0);
  const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'];
  const totalSoldTickets = chartData.reduce((acc, item) => acc + item.value, 0);
  const totalSalesValue = sales.reduce((acc, sale) => acc + (sale.final_price || 0), 0);

  function openEditSale(s: any) {
    setEditingSale(s);
    setEditBuyerName(s.buyer_name);
    setEditNotes(s.notes || '');
    setEditTicketNumber(s.ticket_number || '');
    setEditBuyerPhone(s.buyer_phone || '');
    setEditDiscountAmount(s.discount_amount || 0);
    setEditDiscountSource(s.discount_source || '');
  }

  async function handleDeleteSale(saleId: string) {
    if (!confirm('Supprimer cette vente ? Cette action est irréversible.')) return;
    const { error } = await supabase.from('sales').delete().eq('id', saleId);
    if (error) { toast.error('Erreur lors de la suppression'); return; }
    toast.success('Vente supprimée');
    fetchData();
  }

  async function handleEditSale(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSale) return;

    // Correction prix si modifié
    const priceChanged = editDiscountAmount !== (editingSale.discount_amount || 0);
    if (priceChanged) {
      const { data, error } = await supabase.rpc('correct_sale_price', {
        p_sale_id:         editingSale.id,
        p_discount_amount: editDiscountAmount,
        p_discount_source: editDiscountSource || null,
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || 'Erreur correction prix');
        return;
      }
      const result = data as any;
      toast.success(`Prix corrigé : ${result.old_final?.toLocaleString()} F → ${result.new_final?.toLocaleString()} F`);
    }

    // Mise à jour des autres champs
    const { error } = await supabase.from('sales').update({
      buyer_name:    editBuyerName,
      notes:         editNotes || null,
      ticket_number: editTicketNumber || null,
      buyer_phone:   editBuyerPhone || null,
    }).eq('id', editingSale.id);

    if (error) { toast.error('Erreur lors de la modification'); return; }
    if (!priceChanged) toast.success('Vente modifiée');
    setEditingSale(null);
    fetchData();
  }

  async function handleWaiveBalance(sale: any) {
    if (!sale) return;
    const totalPaid = sale.total_paid || 0;
    if (totalPaid <= 0) {
      toast.error('Aucun paiement enregistré — impossible d\'effacer un solde nul.');
      return;
    }
    const newDiscount = sale.base_price - totalPaid;
    if (newDiscount < 0) {
      toast.error('Le montant payé dépasse le prix de base, vérifiez les données.');
      return;
    }
    const { data, error } = await supabase.rpc('correct_sale_price', {
      p_sale_id:         sale.id,
      p_discount_amount: newDiscount,
      p_discount_source: 'Remise solde',
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Erreur');
      return;
    }
    toast.success(`Solde effacé — ${sale.buyer_name} est considéré(e) comme soldé(e).`);
    setEditingSale(null);
    fetchData();
  }

  async function handleWaiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!waivingSale || !waiveReason.trim()) return;
    setWaiveSaving(true);
    try {
      const { data, error } = await supabase.rpc('waive_sale_balance', {
        p_sale_id: waivingSale.id,
        p_reason:  waiveReason.trim(),
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || 'Erreur');
        return;
      }
      const res = data as any;
      toast.success(
        `${res.buyer_name} classé(e) comme soldé(e). Payé : ${res.total_paid?.toLocaleString()} F / ${res.final_price?.toLocaleString()} F (écart : ${res.gap?.toLocaleString()} F)`
      );
      setWaivingSale(null);
      setWaiveReason('');
      fetchData();
    } finally {
      setWaiveSaving(false);
    }
  }

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    const type = ticketTypes.find(t => t.id === selectedTicketType);
    if (!type) return;

    const finalPrice = type.price - discountAmount;

    if (isQuotaExceeded) {
      toast.error('Quota atteint ou non défini pour ce type de billet');
      return;
    }

    try {
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
          buyer_name: buyerName,
          ticket_type_id: selectedTicketType,
          base_price: type.price,
          discount_amount: discountAmount,
          discount_source: discountSource || null,
          final_price: finalPrice,
          seller_id: profile.id,
          notes: notes || null,
          ticket_number: ticketNumber || null,
          buyer_phone: buyerPhone || null,
          filiere: filiere || null,
          annee: annee || null
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      if (initialPayment > 0) {
        const { error: payError } = await supabase
          .from('payments')
          .insert([{
            sale_id: saleData.id,
            amount: initialPayment,
            collector_id: profile.id
          }]);
        if (payError) throw payError;
      }

      toast.success('Vente enregistrée avec succès');
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la vente');
    }
  }

  function resetForm() {
    setBuyerName('');
    setSelectedTicketType('');
    setDiscountAmount(0);
    setDiscountSource('');
    setNotes('');
    setInitialPayment(0);
    setTicketNumber('');
    setBuyerPhone('');
    setFiliere('');
    setAnnee('');
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSaleForPayment || paymentAmount <= 0) return;

    try {
      const { error } = await supabase
        .from('payments')
        .insert([{
          sale_id: selectedSaleForPayment.id,
          amount: paymentAmount,
          collector_id: profile.id
        }]);

      if (error) throw error;

      toast.success('Paiement enregistré avec succès');
      setSelectedSaleForPayment(null);
      setPaymentAmount(0);
      fetchData(); // Refresh sales to update balances
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'enregistrement du paiement');
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Ventes & Tickets</h2>
        <p className="text-zinc-400">Enregistrez de nouvelles ventes et suivez vos encaissements.</p>
      </header>

      {/* Panneau Ma Caisse */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-amber-500" />
            Ma Caisse
          </CardTitle>
          <CardDescription>Votre situation financière en temps réel.</CardDescription>
        </CardHeader>
        <CardContent>
          <SellerCashPanel sellerId={profile.id} />
        </CardContent>
      </Card>
      
      {/* Visual Dashboard - Quotas & Charts */}
      {visibleQuotaStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-500" />
                Suivi des Quotas
              </CardTitle>
              <CardDescription>Vos carnets attribués et vos ventes en cours.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Progression
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Quota atteint
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-zinc-500" /> Vendu / quota
                </span>
              </div>
              <div className="space-y-6">
                {visibleQuotaStats.map((qs) => {
                  const percent = qs.quota > 0 ? Math.min(100, Math.round((qs.sold / qs.quota) * 100)) : 0;
                  const barColor = qs.sold >= qs.quota ? 'bg-green-500' : 'bg-amber-500';

                  return (
                    <div key={qs.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-zinc-200">{qs.name}</span>
                        <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                          <strong className="text-white">{qs.sold}</strong> / {qs.quota} · {percent}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-amber-500" />
                Répartition
              </CardTitle>
              <CardDescription>Volume de ventes par type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {chartData.length > 0 ? (
                <>
                  <div className="relative h-[240px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Total ventes</p>
                      <p className="mt-1 text-3xl font-bold text-white">{totalSoldTickets}</p>
                      <p className="mt-1 text-xs text-zinc-400">{totalSalesValue.toLocaleString()} F encaissés</p>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={95}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="#18181b"
                          strokeWidth={2}
                          animationDuration={700}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
                          itemStyle={{ color: '#fff' }}
                          labelStyle={{ color: '#a1a1aa' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {chartData.slice(0, 4).map((item, index) => (
                      <span key={item.name} className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] text-zinc-300">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="truncate max-w-32">{item.name}</span>
                        <span className="text-zinc-500">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-zinc-600 text-sm">Aucune vente enregistrée</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Mes Ventes</CardTitle>
            <CardDescription>Historique de vos transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 relative">
              <input
                type="text"
                placeholder="Rechercher par nom ou N° ticket..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <Table className="table-fixed min-w-[1180px]">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">Acheteur</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">N°</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">Filière</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">Ticket</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">Prix Final</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">Payé</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400">Reste</TableHead>
                  <TableHead className="whitespace-nowrap overflow-hidden text-zinc-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const filtered = sales.filter(s =>
                    s.buyer_name.toLowerCase().includes(search.toLowerCase()) ||
                    ((s as any).ticket_number || '').toLowerCase().includes(search.toLowerCase())
                  );
                  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                  return (<>
                    {paginated.map((s) => (
                  <React.Fragment key={s.id}>
                    <ContextMenu items={[
                      { label: 'Modifier', icon: <Pencil className="w-4 h-4" />, onClick: () => { openEditSale(s); } },
                      { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => handleDeleteSale(s.id) }
                    ]}>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle font-medium">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate">{s.buyer_name}</span>
                        {(s as any).buyer_phone && (
                          <a href={`https://wa.me/${(s as any).buyer_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                            className="shrink-0 text-green-500 hover:text-green-400" title={(s as any).buyer_phone}>
                            📱
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle text-zinc-500 text-xs">{(s as any).ticket_number || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle text-zinc-400 text-xs">
                      {(s as any).filiere ? <span className="font-medium text-white">{(s as any).filiere}</span> : '—'}
                      {(s as any).annee ? <span className="text-zinc-500"> A{(s as any).annee}</span> : ''}
                    </TableCell>
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle text-zinc-400">{s.ticket_type_id}</TableCell>
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle">{s.final_price.toLocaleString()} F</TableCell>
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle">
                      <div className="flex items-center gap-2">
                        <span className={s.remaining_balance! === 0 ? 'font-bold text-green-400' : 'text-zinc-300'}>
                          {s.total_paid?.toLocaleString()} F
                        </span>
                        {s.remaining_balance! === 0 && !(s as any).is_waived && (
                          <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-400">Payé</span>
                        )}
                        {(s as any).is_waived && (
                          <span
                            className="cursor-help rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300"
                            title={(s as any).waived_reason || ''}
                          >
                            Classé ✦
                          </span>
                        )}
                        {s.remaining_balance! > 0 && s.total_paid! > 0 && !(s as any).is_waived && (
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">Partiel</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={s.remaining_balance! > 0 ? 'whitespace-nowrap overflow-hidden py-4 align-middle font-bold text-amber-400' : 'whitespace-nowrap overflow-hidden py-4 align-middle text-zinc-600'}>
                      {s.remaining_balance! > 0 ? `${s.remaining_balance?.toLocaleString()} F` : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap overflow-hidden py-4 align-middle text-right">
                      <div className="flex justify-end gap-1">
                        {s.remaining_balance! > 0 && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500 hover:text-white transition-all shadow-none"
                            onClick={() => { setSelectedSaleForPayment(s); setPaymentAmount(0); }}
                          >
                            Encaisser
                          </Button>
                        )}
                        {s.remaining_balance! > 0 && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-600 hover:text-white transition-all shadow-none"
                            onClick={() => { setWaivingSale(s); setWaiveReason(''); }}
                          >
                            Classer
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                    </ContextMenu>
                  </React.Fragment>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow className="border-zinc-800">
                        <TableCell colSpan={7} className="text-center text-zinc-500 py-6">Aucune vente trouvée.</TableCell>
                      </TableRow>
                    )}
                  </>);
                })()}
              </TableBody>
            </Table>
            {/* Pagination */}
            {sales.filter(s => s.buyer_name.toLowerCase().includes(search.toLowerCase()) || ((s as any).ticket_number || '').toLowerCase().includes(search.toLowerCase())).length > PAGE_SIZE && (
              <div className="flex justify-between items-center mt-4 text-sm text-zinc-400">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-30 hover:bg-zinc-700">← Précédent</button>
                <span>Page {page + 1}</span>
                <button disabled={(page + 1) * PAGE_SIZE >= sales.length} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-30 hover:bg-zinc-700">Suivant →</button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                Nouvelle Vente
              </CardTitle>
              <button
                onClick={() => setQuickMode(!quickMode)}
                className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${quickMode ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
              >
                ⚡ Saisie rapide
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {quickMode ? (
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
                  ⚡ Mode rapide — le type de ticket est mémorisé entre les saisies
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Type de Ticket (mémorisé)</label>
                  <Select value={selectedTicketType} onValueChange={setSelectedTicketType}>
                    <SelectTrigger className={fieldClass}><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      {ticketTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.price.toLocaleString()} F)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const type = ticketTypes.find(t => t.id === selectedTicketType);
                  if (!type || !buyerName) return;
                  try {
                    const { data: saleData, error } = await supabase.from('sales').insert([{
                      buyer_name: buyerName,
                      buyer_phone: buyerPhone || null,
                      ticket_type_id: selectedTicketType,
                      base_price: type.price,
                      discount_amount: 0,
                      final_price: type.price,
                      seller_id: profile.id,
                      ticket_number: ticketNumber || null,
                      filiere: filiere || null,
                      annee: annee || null
                    }]).select().single();
                    if (error) throw error;
                    if (initialPayment > 0) {
                      await supabase.from('payments').insert([{ sale_id: saleData.id, amount: initialPayment, collector_id: profile.id }]);
                    }
                    // Reset only name/phone/payment, keep ticket type
                    setBuyerName(''); setBuyerPhone(''); setInitialPayment(0); setTicketNumber(''); setFiliere(''); setAnnee('');
                    fetchData();
                  } catch { toast.error('Erreur'); }
                }} className="space-y-3">
                  <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required placeholder="Nom acheteur *" className={fieldClass} autoFocus />
                  <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="WhatsApp (optionnel)" className={fieldClass} />
                  <Input value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} placeholder="N° ticket (optionnel)" className={fieldClass} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={filiere} onChange={(e) => setFiliere(e.target.value.toUpperCase())} placeholder="Filière (ex: HTR)" className={fieldClass} />
                    <select value={annee} onChange={(e) => setAnnee(e.target.value)}
                      className={fieldClass}>
                      <option value="">Année</option>
                      <option value="1">1ère année</option>
                      <option value="2">2ème année</option>
                      <option value="3">3ème année</option>
                      <option value="Externe">Externe</option>
                    </select>
                  </div>
                  <Input type="number" value={initialPayment || ''} onChange={(e) => setInitialPayment(Number(e.target.value))} placeholder="Acompte (optionnel)" className={fieldClass} />
                  <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={!selectedTicketType || !buyerName}>
                    ✓ Enregistrer & suivant
                  </Button>
                </form>
              </div>
            ) : (
            <form onSubmit={handleSale} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">N° de Ticket</label>
                <Input 
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  className={fieldClass}
                  placeholder="Ex: T-001"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Nom de l'acheteur</label>
                <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required className={fieldClass} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">WhatsApp acheteur</label>
                <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className={fieldClass} placeholder="+225 07 00 00 00 00" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Type de Ticket</label>
                <Select value={selectedTicketType} onValueChange={setSelectedTicketType}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {ticketTypes.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.price.toLocaleString()} F)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Réduction</label>
                    <Input 
                      type="number"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(Number(e.target.value))}
                      className={fieldClass} 
                    />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Source</label>
                  <Select value={discountSource} onValueChange={setDiscountSource}>
                    <SelectTrigger className={fieldClass}>
                      <SelectValue placeholder="---" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="BDE">BDE</SelectItem>
                      <SelectItem value="Administration">Administration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Acompte Initial (F)</label>
                  <Input 
                    type="number"
                    value={initialPayment}
                    onChange={(e) => setInitialPayment(Number(e.target.value))}
                    className={fieldClass} 
                  />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Notes (Placement)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} placeholder="Ex: Veut être à la table de..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Filière</label>
                  <Input value={filiere} onChange={(e) => setFiliere(e.target.value.toUpperCase())} className={fieldClass} placeholder="Ex: HTR" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Année</label>
                  <select value={annee} onChange={(e) => setAnnee(e.target.value)}
                    className={fieldClass}>
                    <option value="">---</option>
                    <option value="1">1ère</option>
                    <option value="2">2ème</option>
                    <option value="3">3ème</option>
                    <option value="Externe">Externe</option>
                  </select>
                </div>
              </div>
              
              {isQuotaExceeded && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-lg flex gap-2 items-center">
                  Quota épuisé pour ce type de billet. Vous ne pouvez plus en vendre.
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:bg-zinc-800"
                disabled={isQuotaExceeded}
              >
                Enregistrer la vente
              </Button>
            </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal édition vente */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <CardTitle className="flex justify-between items-center">
                Modifier la vente
                <button onClick={() => setEditingSale(null)} className="text-zinc-500 hover:text-white"><Plus className="w-5 h-5 rotate-45" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleEditSale} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Nom acheteur</label>
                  <Input value={editBuyerName} onChange={(e) => setEditBuyerName(e.target.value)} required className={fieldClass} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">WhatsApp</label>
                  <Input value={editBuyerPhone} onChange={(e) => setEditBuyerPhone(e.target.value)} className={fieldClass} placeholder="+225 07 00 00 00 00" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">N° Ticket</label>
                  <Input value={editTicketNumber} onChange={(e) => setEditTicketNumber(e.target.value)} className={fieldClass} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Notes</label>
                  <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={fieldClass} />
                </div>

                {/* ── Correction du prix ── */}
                <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/60 p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Correction du prix</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">Réduction (F)</label>
                      <Input
                        type="number"
                        min={0}
                        max={editingSale?.base_price ?? 99999}
                        value={editDiscountAmount || ''}
                        onChange={(e) => setEditDiscountAmount(Number(e.target.value))}
                        className={fieldClass}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">Source réduction</label>
                      <select
                        value={editDiscountSource}
                        onChange={(e) => setEditDiscountSource(e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">—</option>
                        <option value="BDE">BDE</option>
                        <option value="Administration">Administration</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                  </div>

                  {/* Récapitulatif visuel */}
                  {editingSale && (
                    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs space-y-1">
                      <div className="flex justify-between text-zinc-500">
                        <span>Prix de base</span>
                        <span>{(editingSale.base_price ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between text-amber-400">
                        <span>− Réduction</span>
                        <span>− {editDiscountAmount.toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between border-t border-zinc-800 pt-1 font-bold">
                        <span className="text-zinc-200">Prix final</span>
                        <span className={
                          (editingSale.base_price - editDiscountAmount) < (editingSale.total_paid || 0)
                            ? 'text-green-400'
                            : 'text-white'
                        }>
                          {Math.max(0, (editingSale.base_price ?? 0) - editDiscountAmount).toLocaleString()} F
                        </span>
                      </div>
                      {/* Indique si la personne sera considérée comme soldée après correction */}
                      {(editingSale.total_paid || 0) >= Math.max(0, (editingSale.base_price ?? 0) - editDiscountAmount) && (
                        <p className="text-green-400 font-semibold pt-1">
                          ✅ Après correction, ce ticket sera considéré comme soldé.
                        </p>
                      )}
                      {(editingSale.total_paid || 0) < Math.max(0, (editingSale.base_price ?? 0) - editDiscountAmount) && editDiscountAmount > 0 && (
                        <p className="text-zinc-500 pt-1">
                          Reste à payer après correction : {Math.max(0, (editingSale.base_price ?? 0) - editDiscountAmount - (editingSale.total_paid || 0)).toLocaleString()} F
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 border-zinc-700" onClick={() => setEditingSale(null)}>Annuler</Button>
                  <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700">Enregistrer</Button>
                </div>

                {/* ── Effacer le solde restant ── */}
                {editingSale && (editingSale.remaining_balance || 0) > 0 && (
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 space-y-2">
                    <p className="text-xs font-semibold text-orange-300 uppercase tracking-wider">
                      Remise de dette
                    </p>
                    <p className="text-xs text-zinc-400">
                      Reste dû : <span className="font-bold text-orange-300">{(editingSale.remaining_balance || 0).toLocaleString()} F</span>.
                      En cliquant ci-dessous, ce solde sera annulé et le ticket sera considéré comme soldé.
                    </p>
                    <Button
                      type="button"
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm"
                      onClick={() => {
                        if (confirm(`Effacer le solde de ${(editingSale.remaining_balance || 0).toLocaleString()} F pour ${editingSale.buyer_name} ?`)) {
                          handleWaiveBalance(editingSale);
                        }
                      }}
                    >
                      ✓ Effacer le solde restant ({(editingSale.remaining_balance || 0).toLocaleString()} F)
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal classer comme soldé */}
      {waivingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <CardTitle className="flex justify-between items-center text-base">
                Classer comme soldé
                <button onClick={() => setWaivingSale(null)} className="text-zinc-500 hover:text-white">
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleWaiveSubmit} className="space-y-4">
                {/* Récap */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm space-y-1">
                  <p><span className="text-zinc-500">Invité :</span> <span className="font-bold text-white">{waivingSale.buyer_name}</span></p>
                  <p><span className="text-zinc-500">Prix final :</span> <span className="text-zinc-200">{waivingSale.final_price?.toLocaleString()} F</span></p>
                  <p><span className="text-zinc-500">Déjà payé :</span> <span className="text-green-400 font-bold">{waivingSale.total_paid?.toLocaleString()} F</span></p>
                  <p><span className="text-zinc-500">Solde remis :</span> <span className="text-purple-400 font-bold">{(waivingSale.remaining_balance || 0).toLocaleString()} F</span></p>
                </div>

                {/* Note obligatoire */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Motif <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    required
                    rows={3}
                    placeholder="Ex: Accord BDE, étudiant en difficulté, geste commercial, parrain..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 resize-none"
                  />
                  <p className="text-xs text-zinc-600">Cette note sera visible dans les rapports financiers.</p>
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 border-zinc-700" onClick={() => setWaivingSale(null)}>
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={waiveSaving || !waiveReason.trim()}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-40"
                  >
                    {waiveSaving ? 'Enregistrement...' : 'Confirmer'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal d'ajout de paiement partiel */}
      {selectedSaleForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800/50 pb-4">
              <CardTitle className="flex justify-between items-center">
                Ajouter un paiement
                <button 
                  onClick={() => {
                    setSelectedSaleForPayment(null);
                    setPaymentAmount(0);
                  }}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </CardTitle>
              <CardDescription>
                Règlement pour <span className="text-white font-medium">{selectedSaleForPayment.buyer_name}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleAddPayment} className="space-y-6">
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-sm">
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Total de la vente :</span>
                    <span className="text-white font-bold">{selectedSaleForPayment.final_price?.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Déjà payé :</span>
                    <span className="text-green-500 font-bold">{selectedSaleForPayment.total_paid?.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between border-t border-amber-500/20 pt-2 mt-2">
                    <span className="text-zinc-300 font-bold">Reste à payer :</span>
                    <span className="text-amber-500 font-bold text-lg">{selectedSaleForPayment.remaining_balance?.toLocaleString()} F</span>
                  </div>
                </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Montant encaissé aujourd'hui</label>
                <div className="relative">
                  <Input 
                    type="number"
                    max={selectedSaleForPayment.remaining_balance}
                    min={1}
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="bg-zinc-950 border-zinc-700/80 font-bold text-xl h-14 pl-4 pr-12 shadow-sm focus-visible:ring-amber-500" 
                    autoFocus
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">FCFA</div>
                </div>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    onClick={() => {
                      setSelectedSaleForPayment(null);
                      setPaymentAmount(0);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-900/20"
                    disabled={paymentAmount <= 0 || paymentAmount > (selectedSaleForPayment.remaining_balance || 0)}
                  >
                    Valider
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
