import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, CashTransfer, Expense } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Wallet, ArrowUpRight, CheckCircle2, XCircle, Clock, Plus, BarChart3, TrendingUp, Receipt, Trash2, Pencil, Loader2 } from 'lucide-react';
import ContextMenu from './ContextMenu';
import SellerCashPanel from './SellerCashPanel';
import FinancialSummaryCards from './FinancialSummaryCards';
import { notify, notifyRole } from '../lib/notify';
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
  const [allSales, setAllSales] = useState<any[]>([]);
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  // Expenses
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAuthor, setExpenseAuthor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expensePaymentStatus, setExpensePaymentStatus] = useState<'reglee' | 'non_reglee'>('non_reglee');

  // Sellers cash
  const [sellers, setSellers] = useState<any[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);

  // TG → Comptable transfers
  const [tgTransfers, setTgTransfers] = useState<any[]>([]);
  const [tgAmount, setTgAmount] = useState(0);
  const [comptable, setComptable] = useState<any | null>(null);
  const canManageExpensePayment = ['tresoriere', 'tresoriere_generale'].includes(profile.role);
  const [isCreatingExpense, setIsCreatingExpense] = useState(false);
  const [expenseSubmissionToken, setExpenseSubmissionToken] = useState(() => crypto.randomUUID());
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpenseTitle, setEditExpenseTitle] = useState('');
  const [editExpenseAuthor, setEditExpenseAuthor] = useState('');
  const [editExpenseAmount, setEditExpenseAmount] = useState(0);
  const [editExpensePaymentStatus, setEditExpensePaymentStatus] = useState<'reglee' | 'non_reglee'>('non_reglee');
  const [editExpenseSaving, setEditExpenseSaving] = useState(false);

  const paymentStatusLabel = (status: 'reglee' | 'non_reglee') => status === 'reglee' ? 'Réglée' : 'Non réglée';
  const expenseEditWindowMs = 60 * 1000;

  const normalizeExpenseSignature = (title: string, author: string, amount: number, status: 'reglee' | 'non_reglee') =>
    [title.trim().toLowerCase(), author.trim().toLowerCase(), amount, status].join('|');

  const getExpenseAgeMs = (expense: Expense) => Date.now() - new Date(expense.created_at).getTime();

  const canEditExpense = (expense: Expense) => {
    const isCreator = expense.created_by === profile.id;
    const isRecent = getExpenseAgeMs(expense) <= expenseEditWindowMs;
    return expense.validation_status === 'en_attente' && isCreator && isRecent && ['tresoriere', 'admin'].includes(profile.role);
  };

  const canDeleteExpense = (expense: Expense) => {
    const isCreator = expense.created_by === profile.id;
    const isRecent = getExpenseAgeMs(expense) <= expenseEditWindowMs;
    return expense.validation_status === 'en_attente' && isCreator && isRecent && ['tresoriere', 'admin'].includes(profile.role);
  };

  function openExpenseEditor(expense: Expense) {
    setEditingExpense(expense);
    setEditExpenseTitle(expense.title);
    setEditExpenseAuthor(expense.author);
    setEditExpenseAmount(expense.amount);
    setEditExpensePaymentStatus(expense.payment_status);
  }

  function closeExpenseEditor() {
    setEditingExpense(null);
    setEditExpenseSaving(false);
  }

  const getExpenseCounterpartRole = () => {
    if (profile.role === 'tresoriere') return 'tresoriere_generale';
    if (profile.role === 'tresoriere_generale') return 'tresoriere';
    return null;
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('treasurer-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transfers' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [transfersRes, profilesRes, salesRes, expensesRes] = await Promise.all([
        supabase
          .from('cash_transfers')
          .select('*, from:profiles!from_id(full_name, email), to:profiles!to_id(full_name, email)')
          .or(`from_id.eq.${profile.id},to_id.eq.${profile.id}`)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase.from('sales').select('*, payments(amount), seller:profiles!seller_id(full_name, email)'),
        supabase.from('expenses').select('*').order('created_at', { ascending: false })
      ]);

      if (transfersRes.error) throw transfersRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (salesRes.error) throw salesRes.error;

      setTransfers(transfersRes.data || []);
      setProfiles(profilesRes.data || []);
      setAllSales(salesRes.data || []);
      setExpenses(expensesRes.data || []);

      const sellerRoles = ['admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction'];
      setSellers((profilesRes.data || []).filter((p: any) => sellerRoles.includes(p.role) && p.is_active));

      // TG → Comptable transfers
      const comptableProfile = (profilesRes.data || []).find((p: any) => p.role === 'tresoriere_generale');
      setComptable(comptableProfile || null);

      // Fetch TG↔Comptable transfers (visible to TG, Comptable, Admin, Direction)
      const tgIds = (profilesRes.data || []).filter((p: any) => p.role === 'tresoriere').map((p: any) => p.id);
      const comptableIds = (profilesRes.data || []).filter((p: any) => p.role === 'tresoriere_generale').map((p: any) => p.id);
      if (tgIds.length > 0 && comptableIds.length > 0) {
        const { data: tgData } = await supabase
          .from('cash_transfers')
          .select('*, from:profiles!from_id(full_name, email), to:profiles!to_id(full_name, email)')
          .in('from_id', tgIds)
          .in('to_id', comptableIds)
          .order('created_at', { ascending: false });
        setTgTransfers(tgData || []);
      }

      const processedSales = (salesRes.data || []).map((s: any) => {
        const totalPaid = s.payments.reduce((acc: number, p: any) => acc + p.amount, 0);
        return { ...s, total_paid: totalPaid, remaining_balance: s.final_price - totalPaid };
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

  async function handleTgTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!comptable || tgAmount <= 0) return;
    const { error } = await supabase.from('cash_transfers').insert([{
      from_id: profile.id,
      to_id: comptable.id,
      amount: tgAmount,
      status: 'en_attente'
    }]);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Versement envoyé à la Comptable');
    // Notifier la Comptable
    if (comptable) await notify(comptable.id, 'Versement reçu', `La Trésorière Générale vous a remis ${tgAmount.toLocaleString()} F — à confirmer`, 'warning');
    setTgAmount(0);
    fetchData();
  }

  async function handleTgValidate(transferId: string, status: 'valide' | 'rejete') {
    const { error } = await supabase.from('cash_transfers').update({ status }).eq('id', transferId);
    if (error) { toast.error('Erreur'); return; }
    toast.success(status === 'valide' ? 'Versement confirmé' : 'Versement rejeté');
    // Notifier la TG
    const transfer = tgTransfers.find(t => t.id === transferId);
    if (transfer) await notify(transfer.from_id, status === 'valide' ? 'Versement confirmé' : 'Versement rejeté', `La Comptable a ${status === 'valide' ? 'confirmé' : 'rejeté'} votre versement de ${transfer.amount.toLocaleString()} F`, status === 'valide' ? 'success' : 'warning');
    fetchData();
  }

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (isCreatingExpense || !expenseTitle.trim() || !expenseAuthor.trim() || expenseAmount <= 0) return;

    const duplicateSignature = normalizeExpenseSignature(expenseTitle, expenseAuthor, expenseAmount, expensePaymentStatus);
    const duplicateExpense = expenses.find((expense: Expense) =>
      expense.created_by === profile.id &&
      normalizeExpenseSignature(expense.title, expense.author, expense.amount, expense.payment_status) === duplicateSignature &&
      getExpenseAgeMs(expense) < 2 * 60 * 1000
    );

    if (duplicateExpense) {
      toast.error('Cette dépense vient déjà d\'être enregistrée.');
      return;
    }

    setIsCreatingExpense(true);
    try {
      const { data, error } = await supabase.rpc('create_expense_submission', {
        p_title: expenseTitle.trim(),
        p_author: expenseAuthor.trim(),
        p_amount: expenseAmount,
        p_payment_status: expensePaymentStatus,
        p_submission_token: expenseSubmissionToken,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.duplicate) {
        toast.info('Cette dépense vient déjà d’être enregistrée.');
        setExpenseTitle('');
        setExpenseAuthor('');
        setExpenseAmount(0);
        setExpensePaymentStatus('non_reglee');
        setExpenseSubmissionToken(crypto.randomUUID());
        fetchData();
        return;
      }

      toast.success('Dépense enregistrée');
      // Notifier la Comptable
      await notifyRole('tresoriere_generale', 'Nouvelle dépense à valider', `"${expenseTitle}" — ${expenseAmount.toLocaleString()} F`, 'warning');
      setExpenseTitle(''); setExpenseAuthor(''); setExpenseAmount(0); setExpensePaymentStatus('non_reglee');
      setExpenseSubmissionToken(crypto.randomUUID());
      fetchData();
    } catch (error: any) {
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsCreatingExpense(false);
    }
  }

  async function handleUpdateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense) return;
    if (!canEditExpense(editingExpense)) {
      toast.error('La fenêtre de modification a expiré.');
      return;
    }

    setEditExpenseSaving(true);
    try {
      const { data, error } = await supabase.rpc('update_recent_expense', {
        p_expense_id: editingExpense.id,
        p_title: editExpenseTitle.trim(),
        p_author: editExpenseAuthor.trim(),
        p_amount: editExpenseAmount,
        p_payment_status: editExpensePaymentStatus,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Dépense mise à jour');
      closeExpenseEditor();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setEditExpenseSaving(false);
    }
  }

  async function handleValidateExpense(expenseId: string, status: 'validee' | 'rejetee') {
    try {
      const { data, error } = await supabase.rpc('validate_expense', {
        p_expense_id: expenseId,
        p_status: status,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        status === 'validee'
          ? (profile.role === 'admin' ? 'Dépense validée par admin unique' : 'Dépense validée')
          : 'Dépense rejetée'
      );
      // Notifier la TG
      const exp = expenses.find(e => e.id === expenseId);
      if (exp) await notify(exp.created_by, status === 'validee' ? 'Dépense validée' : 'Dépense rejetée', `"${exp.title}" a été ${status === 'validee' ? 'validée' : 'rejetée'} par la Comptable`, status === 'validee' ? 'success' : 'warning');
      fetchData();
    } catch (error: any) {
      toast.error('Erreur lors de la mise à jour');
    }
  }

  async function handleDeleteExpense(expense: Expense) {
    try {
      const isCreator = expense.created_by === profile.id;
      const isRecent = getExpenseAgeMs(expense) <= expenseEditWindowMs;

      if (expense.validation_status === 'en_attente') {
        if (!isCreator && profile.role !== 'admin') {
          toast.error('Suppression réservée au créateur ou à un administrateur.');
          return;
        }

        if (!isRecent && profile.role !== 'admin') {
          toast.info('Fenêtre de suppression expirée. Une validation admin sera requise ensuite.');
          return;
        }

        const confirmed = confirm('Supprimer cette dépense ?');
        if (!confirmed) return;

        const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
        if (error) throw error;
        toast.success('Dépense supprimée');
        fetchData();
        return;
      }

      if (expense.validation_status === 'validee' && expense.deletion_status === null) {
        if (!['tresoriere', 'tresoriere_generale', 'admin'].includes(profile.role)) {
          toast.error('Suppression réservée aux rôles financiers.');
          return;
        }

        const { data, error } = await supabase.rpc('request_expense_deletion', {
          p_expense_id: expense.id,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success('Demande de suppression envoyée pour double validation');
        fetchData();
        return;
      }

      if (expense.deletion_status === 'en_attente_counterpart') {
        if (expense.deletion_requested_by === profile.id) {
          toast.info('La suppression attend la validation de l’autre rôle.');
          return;
        }

        if (!['tresoriere', 'tresoriere_generale'].includes(profile.role)) {
          toast.error('Validation réservée à la contrepartie financière.');
          return;
        }

        const { data, error } = await supabase.rpc('approve_expense_deletion_counterpart', {
          p_expense_id: expense.id,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success('Suppression validée par la contrepartie, en attente de l’admin');
        fetchData();
        return;
      }

      if (expense.deletion_status === 'en_attente_admin') {
        if (profile.role !== 'admin') {
          toast.error('Validation finale réservée à l’admin.');
          return;
        }

        const confirmed = confirm('Valider la suppression de cette dépense ?');
        if (!confirmed) return;

        const { data, error } = await supabase.rpc('approve_expense_deletion_admin', {
          p_expense_id: expense.id,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success('Dépense supprimée après validation admin');
        fetchData();
        return;
      }

      toast.info('Aucune suppression disponible pour cette dépense.');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  }

  async function handleRequestExpensePaymentChange(expense: Expense, targetStatus: 'reglee' | 'non_reglee') {
    if (!canManageExpensePayment) return;
    if (expense.payment_status === targetStatus) {
      toast.info(`La dépense est déjà ${paymentStatusLabel(targetStatus).toLowerCase()}.`);
      return;
    }
    if (expense.payment_status_pending) {
      toast.info('Une demande de changement est déjà en attente.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('request_expense_payment_change', {
        p_expense_id: expense.id,
        p_target_status: targetStatus,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const counterpartRole = getExpenseCounterpartRole();
      if (counterpartRole) {
        await notifyRole(
          counterpartRole,
          'Validation de règlement attendue',
          `La dépense "${expense.title}" doit passer à ${paymentStatusLabel(targetStatus).toLowerCase()} et attend votre confirmation.`,
          'warning'
        );
      }

      toast.success('Demande de changement envoyée');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la demande');
    }
  }

  async function handleConfirmExpensePaymentChange(expense: Expense) {
    if (!expense.payment_status_pending) return;
    if (expense.payment_status_requested_by === profile.id) {
      toast.info('Vous devez attendre la confirmation de l’autre rôle.');
      return;
    }

    try {
      const nextStatus = expense.payment_status_pending;
      const { data, error } = await supabase.rpc('confirm_expense_payment_change', {
        p_expense_id: expense.id,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (expense.payment_status_requested_by) {
        await notify(
          expense.payment_status_requested_by,
          'Changement de règlement confirmé',
          `La dépense "${expense.title}" a été confirmée comme ${paymentStatusLabel(nextStatus).toLowerCase()}.`,
          'success'
        );
      }

      toast.success(`Dépense marquée ${paymentStatusLabel(nextStatus).toLowerCase()}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la confirmation');
    }
  }

  async function handleRejectExpensePaymentChange(expense: Expense) {
    if (!expense.payment_status_pending) return;
    if (expense.payment_status_requested_by === profile.id) {
      toast.info('Vous devez attendre la confirmation de l’autre rôle.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('reject_expense_payment_change', {
        p_expense_id: expense.id,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (expense.payment_status_requested_by) {
        await notify(
          expense.payment_status_requested_by,
          'Changement de règlement rejeté',
          `La demande de la dépense "${expense.title}" a été rejetée.`,
          'warning'
        );
      }

      toast.success('Demande rejetée');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du rejet');
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

      <FinancialSummaryCards />

      {/* Panneau Ma Caisse (si le rôle vend aussi) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-amber-500" />
            Ma Caisse
          </CardTitle>
          <CardDescription>Votre situation financière personnelle.</CardDescription>
        </CardHeader>
        <CardContent>
          <SellerCashPanel sellerId={profile.id} />
        </CardContent>
      </Card>

      {/* Section Caisse Vendeurs */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-amber-500" />
            Caisse des Vendeurs
          </CardTitle>
          <CardDescription>Situation financière de chaque vendeur.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sellers.map((s: any) => (
              <button key={s.id} onClick={() => setSelectedSeller(s)}
                className="text-left p-4 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-amber-500/50 transition-all">
                <p className="font-bold text-sm mb-1">{s.full_name || s.email}</p>
                <p className="text-xs text-zinc-500 uppercase">{s.role}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal détail vendeur */}
      {selectedSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b border-zinc-800">
              <div>
                <p className="font-bold text-lg">{selectedSeller.full_name || selectedSeller.email}</p>
                <p className="text-xs text-zinc-500 uppercase">{selectedSeller.role}</p>
              </div>
              <button onClick={() => setSelectedSeller(null)} className="text-zinc-500 hover:text-white">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <div className="p-5">
              <SellerCashPanel
                sellerId={selectedSeller.id}
                canRecord={['tresoriere', 'admin'].includes(profile.role)}
                onVersionmentRecorded={() => setSelectedSeller(null)}
              />
            </div>
          </div>
        </div>
      )}

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
                          setPaymentAmount(0);
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

      {/* Flux TG → Comptable */}
      {['tresoriere', 'tresoriere_generale', 'admin', 'direction'].includes(profile.role) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-500" />
                Flux TG → Comptable
              </CardTitle>
              <CardDescription>Versements de la Trésorière Générale vers la Comptable.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Résumé */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Total envoyé</p>
                  <p className="font-bold text-amber-500">{tgTransfers.reduce((a, t) => a + t.amount, 0).toLocaleString()} F</p>
                </div>
                <div className="bg-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Validé</p>
                  <p className="font-bold text-green-500">{tgTransfers.filter(t => t.status === 'valide').reduce((a, t) => a + t.amount, 0).toLocaleString()} F</p>
                </div>
                <div className="bg-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-zinc-500 mb-1">En attente</p>
                  <p className="font-bold text-amber-400">{tgTransfers.filter(t => t.status === 'en_attente').reduce((a, t) => a + t.amount, 0).toLocaleString()} F</p>
                </div>
              </div>
              {/* Liste */}
              <div className="space-y-2">
                {tgTransfers.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center py-4">Aucun versement enregistré.</p>
                ) : tgTransfers.map((t: any) => (
                  <div key={t.id} className="flex justify-between items-center p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                    <div>
                      <p className="font-bold">{t.amount.toLocaleString()} F</p>
                      <p className="text-xs text-zinc-500">{t.from?.full_name || t.from?.email} → {t.to?.full_name || t.to?.email}</p>
                      <p className="text-xs text-zinc-600">{new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === 'en_attente' && (
                        <>
                          <span className="text-xs text-amber-500 font-bold uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> En attente</span>
                          {profile.role === 'tresoriere_generale' && (
                            <div className="flex gap-1 ml-2">
                              <Button size="sm" variant="outline" className="h-7 px-2 border-green-500/50 text-green-500 hover:bg-green-500/10" onClick={() => handleTgValidate(t.id, 'valide')}>Confirmer</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 border-red-500/50 text-red-500 hover:bg-red-500/10" onClick={() => handleTgValidate(t.id, 'rejete')}>Rejeter</Button>
                            </div>
                          )}
                        </>
                      )}
                      {t.status === 'valide' && <span className="text-xs text-green-500 font-bold uppercase flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Confirmé</span>}
                      {t.status === 'rejete' && <span className="text-xs text-red-500 font-bold uppercase flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejeté</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Formulaire versement TG → Comptable */}
          {['tresoriere', 'admin'].includes(profile.role) && comptable && (
            <Card className="bg-zinc-900 border-zinc-800 h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-amber-500" />
                  Remettre à la Comptable
                </CardTitle>
                <CardDescription>Déclarer un versement physique vers {comptable.full_name || comptable.email}.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTgTransfer} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase">Montant (F)</label>
                    <Input type="number" min={1} value={tgAmount || ''} onChange={(e) => setTgAmount(Number(e.target.value))} required className="bg-zinc-800 border-zinc-700" />
                  </div>
                  <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">Envoyer la demande</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Module Dépenses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              Dépenses déclarées
            </CardTitle>
            <CardDescription>Liste de toutes les dépenses soumises à validation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
               <TableHeader>
                 <TableRow className="border-zinc-800 hover:bg-transparent">
                   <TableHead className="text-zinc-400">Titre</TableHead>
                   <TableHead className="text-zinc-400">Bénéficiaire</TableHead>
                   <TableHead className="text-zinc-400">Montant (F)</TableHead>
                   <TableHead className="text-zinc-400">Statut paiement</TableHead>
                   <TableHead className="text-zinc-400">Validation</TableHead>
                   {canManageExpensePayment || profile.role === 'tresoriere_generale' ? <TableHead className="text-zinc-400 text-right">Actions</TableHead> : null}
                 </TableRow>
               </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={canManageExpensePayment || profile.role === 'tresoriere_generale' ? 6 : 5} className="text-center text-zinc-500 py-6">Aucune dépense enregistrée.</TableCell>
                  </TableRow>
                ) : expenses.map((exp) => (
                  <ContextMenu key={exp.id} items={[
                    ...(canEditExpense(exp) ? [{ label: 'Modifier', icon: <Pencil className="w-4 h-4" />, onClick: () => openExpenseEditor(exp) }] : []),
                    ...(canDeleteExpense(exp) ? [{ label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => handleDeleteExpense(exp) }] : [])
                  ]}>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium">{exp.title}</TableCell>
                    <TableCell className="text-zinc-400">{exp.author}</TableCell>
                    <TableCell className="font-bold text-red-400">{exp.amount.toLocaleString()} F</TableCell>
                    <TableCell>
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${exp.payment_status === 'reglee' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-700 text-zinc-400'}`}>
                        {exp.payment_status === 'reglee' ? 'Réglée' : 'Non réglée'}
                      </span>
                      {exp.payment_status_pending && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          Demande: {paymentStatusLabel(exp.payment_status_pending)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {exp.validation_status === 'en_attente' && <span className="flex items-center gap-1 text-amber-500 text-xs font-bold uppercase"><Clock className="w-3 h-3" /> En attente</span>}
                      {exp.validation_status === 'validee' && <span className="flex items-center gap-1 text-green-500 text-xs font-bold uppercase"><CheckCircle2 className="w-3 h-3" /> Validée</span>}
                      {exp.validation_status === 'rejetee' && <span className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase"><XCircle className="w-3 h-3" /> Rejetée</span>}
                    </TableCell>
                    {(canManageExpensePayment || profile.role === 'tresoriere_generale') && (
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          {profile.role === 'tresoriere_generale' && exp.validation_status === 'en_attente' && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-7 px-2 border-green-500/50 text-green-500 hover:bg-green-500/10" onClick={() => handleValidateExpense(exp.id, 'validee')}>Valider</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 border-red-500/50 text-red-500 hover:bg-red-500/10" onClick={() => handleValidateExpense(exp.id, 'rejetee')}>Rejeter</Button>
                            </div>
                          )}

                          {profile.role === 'admin' && exp.validation_status === 'en_attente' && (
                            <div className="flex flex-col items-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                                onClick={() => handleValidateExpense(exp.id, 'validee')}
                              >
                                Validation admin unique
                              </Button>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                Équivaut aux deux validations
                              </span>
                            </div>
                          )}

                          {canManageExpensePayment && !exp.payment_status_pending && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                              onClick={() => handleRequestExpensePaymentChange(exp, exp.payment_status === 'reglee' ? 'non_reglee' : 'reglee')}
                            >
                              Demander {exp.payment_status === 'reglee' ? 'non réglée' : 'réglée'}
                            </Button>
                          )}

                          {canManageExpensePayment && exp.payment_status_pending && exp.payment_status_requested_by !== profile.id && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-7 px-2 border-green-500/50 text-green-500 hover:bg-green-500/10" onClick={() => handleConfirmExpensePaymentChange(exp)}>Confirmer</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 border-red-500/50 text-red-500 hover:bg-red-500/10" onClick={() => handleRejectExpensePaymentChange(exp)}>Rejeter</Button>
                            </div>
                          )}

                          {canManageExpensePayment && exp.payment_status_pending && exp.payment_status_requested_by === profile.id && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">En attente de l’autre validation</span>
                          )}

                          {canEditExpense(exp) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                              onClick={() => openExpenseEditor(exp)}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Modifier
                            </Button>
                          )}

                          {exp.validation_status === 'validee' && exp.deletion_status === null && ['tresoriere', 'tresoriere_generale', 'admin'].includes(profile.role) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                              onClick={() => handleDeleteExpense(exp)}
                            >
                              Demander suppression
                            </Button>
                          )}

                          {exp.deletion_status === 'en_attente_counterpart' && exp.deletion_requested_by !== profile.id && ['tresoriere', 'tresoriere_generale'].includes(profile.role) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-green-500/50 text-green-500 hover:bg-green-500/10"
                              onClick={() => handleDeleteExpense(exp)}
                            >
                              Valider suppression
                            </Button>
                          )}

                          {exp.deletion_status === 'en_attente_admin' && profile.role === 'admin' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                              onClick={() => handleDeleteExpense(exp)}
                            >
                              Validation admin
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {profile.role === 'tresoriere' && (
          <Card className="bg-zinc-900 border-zinc-800 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                Déclarer une dépense
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateExpense} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Titre</label>
                  <Input value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} required className="bg-zinc-800 border-zinc-700" placeholder="Ex: DJ Patrick" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Bénéficiaire</label>
                  <Input value={expenseAuthor} onChange={(e) => setExpenseAuthor(e.target.value)} required className="bg-zinc-800 border-zinc-700" placeholder="Ex: M. Koné" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Montant (F)</label>
                  <Input type="number" min={1} value={expenseAmount || ''} onChange={(e) => setExpenseAmount(Number(e.target.value))} required className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">État du paiement</label>
                  <Select value={expensePaymentStatus} onValueChange={(v) => setExpensePaymentStatus(v as any)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="non_reglee">Non réglée</SelectItem>
                      <SelectItem value="reglee">Réglée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">Enregistrer</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800/50 pb-4">
              <CardTitle className="flex justify-between items-center gap-4">
                Modifier une dépense
                <button
                  onClick={closeExpenseEditor}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </CardTitle>
              <CardDescription>
                Modifications autorisées uniquement pendant la première minute et avant validation.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleUpdateExpense} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Titre</label>
                  <Input value={editExpenseTitle} onChange={(e) => setEditExpenseTitle(e.target.value)} required className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Bénéficiaire</label>
                  <Input value={editExpenseAuthor} onChange={(e) => setEditExpenseAuthor(e.target.value)} required className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">Montant (F)</label>
                  <Input type="number" min={1} value={editExpenseAmount || ''} onChange={(e) => setEditExpenseAmount(Number(e.target.value))} required className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase">État du paiement</label>
                  <Select value={editExpensePaymentStatus} onValueChange={(v) => setEditExpensePaymentStatus(v as any)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="non_reglee">Non réglée</SelectItem>
                      <SelectItem value="reglee">Réglée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={closeExpenseEditor}>
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-900/20"
                    disabled={editExpenseSaving || !canEditExpense(editingExpense)}
                  >
                    {editExpenseSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

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
