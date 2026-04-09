import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, CashTransfer } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Wallet, ArrowUpRight, CheckCircle2, XCircle, Clock, Plus, BarChart3, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function TreasurerView({ profile }: { profile: Profile }) {
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New transfer form
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState(0);

  // Unpaid sales and payments
  const [unpaidSales, setUnpaidSales] = useState<any[]>([]);
  const [allSales, setAllSales] = useState<any[]>([]); // Added for charts
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [transfersRes, profilesRes, salesRes] = await Promise.all([
        supabase
          .from('cash_transfers')
          .select('*, from:profiles!from_id(full_name, email), to:profiles!to_id(full_name, email)')
          .or(`from_id.eq.${profile.id},to_id.eq.${profile.id}`)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase.from('sales').select('*, payments(amount), seller:profiles!seller_id(full_name, email)')
      ]);

      if (transfersRes.error) throw transfersRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (salesRes.error) throw salesRes.error;

      setTransfers(transfersRes.data || []);
      setProfiles(profilesRes.data || []);
      setAllSales(salesRes.data || []);

      const processedSales = (salesRes.data || []).map((s: any) => {
        const totalPaid = s.payments.reduce((acc: number, p: any) => acc + p.amount, 0);
        return {
          ...s,
          total_paid: totalPaid,
          remaining_balance: s.final_price - totalPaid
        };
      }).filter((s: any) => s.remaining_balance > 0);

      setUnpaidSales(processedSales);
    } catch (error: any) {
      toast.error('Erreur lors du chargement des transferts');
    } finally {
      setLoading(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0 || !targetUserId) return;

    try {
      const { error } = await supabase
        .from('cash_transfers')
        .insert([{
          from_id: profile.id,
          to_id: targetUserId,
          amount: amount,
          status: 'en_attente'
        }]);

      if (error) throw error;
      toast.success('Demande de versement envoyée');
      setAmount(0);
      setTargetUserId('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du transfert');
    }
  }

  async function updateStatus(transferId: string, newStatus: 'valide' | 'rejete') {
    try {
      const { error } = await supabase
        .from('cash_transfers')
        .update({ status: newStatus })
        .eq('id', transferId);

      if (error) throw error;
      toast.success(newStatus === 'valide' ? 'Versement validé' : 'Versement rejeté');
      fetchData();
    } catch (error: any) {
      toast.error('Erreur lors de la mise à jour');
    }
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

      toast.success('Paiement encaissé avec succès par la trésorerie');
      setSelectedSaleForPayment(null);
      setPaymentAmount(0);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'enregistrement du paiement');
    }
  }

  // Chart Data Computation
  const revenueByDay = (allSales || []).reduce((acc: any, sale: any) => {
    const date = new Date(sale.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    if (!acc[date]) acc[date] = 0;
    acc[date] += sale.final_price;
    return acc;
  }, {});
  
  const areaData = Object.keys(revenueByDay).map(date => ({
    date,
    revenue: revenueByDay[date]
  }));

  const ticketPops = (allSales || []).reduce((acc: any, sale: any) => {
    const t = sale.ticket_type_id;
    if (!acc[t]) acc[t] = 0;
    acc[t] += 1;
    return acc;
  }, {});

  const pieData = Object.keys(ticketPops).map(name => ({
    name,
    value: ticketPops[name]
  }));
  const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Gestion de la Trésorerie</h2>
        <p className="text-zinc-400">Suivez les flux financiers et validez les dépôts.</p>
      </header>
      
      {/* Visual Dashboard - Treasurer */}
      {(allSales.length > 0 || transfers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                Évolution des Revenus
              </CardTitle>
              <CardDescription>Cumul des ventes totales par jour généré par la billetterie.</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              {areaData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(v: number) => [`${v.toLocaleString()} F`, 'Chiffre d\'Affaires']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-600 text-sm">Pas assez de données.</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-500" />
                Popularité
              </CardTitle>
              <CardDescription>Billet le plus vendu globalement.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center items-center h-[200px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
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
            <CardTitle>Historique des Flux</CardTitle>
            <CardDescription>Dépôts et réceptions de fonds.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Date</TableHead>
                  <TableHead className="text-zinc-400">De / Vers</TableHead>
                  <TableHead className="text-zinc-400">Montant</TableHead>
                  <TableHead className="text-zinc-400">Statut</TableHead>
                  <TableHead className="text-zinc-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t: any) => (
                  <TableRow key={t.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="text-xs text-zinc-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {t.from_id === profile.id ? (
                        <span className="text-zinc-400">Vers: {t.to?.full_name || t.to?.email}</span>
                      ) : (
                        <span className="text-amber-500">De: {t.from?.full_name || t.from?.email}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-bold">{t.amount.toLocaleString()} F</TableCell>
                    <TableCell>
                      {t.status === 'en_attente' ? (
                        <span className="flex items-center gap-1 text-amber-500 text-xs uppercase font-bold">
                          <Clock className="w-3 h-3" /> En attente
                        </span>
                      ) : t.status === 'valide' ? (
                        <span className="flex items-center gap-1 text-green-500 text-xs uppercase font-bold">
                          <CheckCircle2 className="w-3 h-3" /> Validé
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500 text-xs uppercase font-bold">
                          <XCircle className="w-3 h-3" /> Rejeté
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.to_id === profile.id && t.status === 'en_attente' && (
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-7 px-2 border-green-500/50 text-green-500 hover:bg-green-500/10"
                            onClick={() => updateStatus(t.id, 'valide')}
                          >
                            Valider
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-7 px-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                            onClick={() => updateStatus(t.id, 'rejete')}
                          >
                            Rejeter
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-amber-500" />
              Verser des fonds
            </CardTitle>
            <CardDescription>Déposer l'argent encaissé.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Destinataire</label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {profiles
                      .filter(p => p.id !== profile.id && ['tresoriere', 'tresoriere_generale', 'admin'].includes(p.role))
                      .map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email} ({p.role})</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Montant (F)</label>
                <Input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">
                Envoyer la demande
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-amber-500" />
            Recouvrements & Ventes Non Soldées
          </CardTitle>
          <CardDescription>Liste de l'ensemble des ventes ayant encore un reste à payer.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Vendeur initial</TableHead>
                <TableHead className="text-zinc-400">Acheteur</TableHead>
                <TableHead className="text-zinc-400">Billet</TableHead>
                <TableHead className="text-zinc-400">Reste à payer</TableHead>
                <TableHead className="text-zinc-400 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unpaidSales.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-6">Aucun recouvrement en attente.</TableCell>
                </TableRow>
              ) : (
                unpaidSales.map((s) => (
                  <TableRow key={s.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium text-zinc-400">{s.seller?.full_name || s.seller?.email || 'Inconnu'}</TableCell>
                    <TableCell className="font-medium">{s.buyer_name}</TableCell>
                    <TableCell className="text-zinc-400">{s.ticket_type_id}</TableCell>
                    <TableCell className="text-amber-500 font-bold">{s.remaining_balance?.toLocaleString()} F</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-xs bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500 hover:text-white transition-all shadow-none"
                        onClick={() => {
                          setSelectedSaleForPayment(s);
                          setPaymentAmount(s.remaining_balance || 0);
                        }}
                      >
                        Encaisser
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal d'ajout de paiement partiel pour le Trésorier */}
      {selectedSaleForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800/50 pb-4">
              <CardTitle className="flex justify-between items-center">
                Recouvrement direct
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
                      className="bg-zinc-900 border-zinc-700 font-bold text-xl h-14 pl-4 pr-12 focus-visible:ring-amber-500" 
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
                    Valider l'encaissement
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
