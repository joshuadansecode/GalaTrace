import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, UserRole, TicketType, Quota, ROLE_LABELS } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { UserPlus, Shield, RefreshCw, Ticket, Download, TrendingDown, Wallet, ArrowDownRight } from 'lucide-react';

export default function AdminView({ profile }: { profile: Profile }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('vendeur');
  const [newUserName, setNewUserName] = useState('');

  // Quotas state
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [quotas, setQuotas] = useState<any[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState('');
  const [quotaQuantity, setQuotaQuantity] = useState(0);

  // Financial summary
  const [totalEncaisse, setTotalEncaisse] = useState(0);
  const [totalDepensesActees, setTotalDepensesActees] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const [usersRes, ttRes, quotasRes, paymentsRes, expensesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('ticket_types').select('*'),
        supabase.from('quotas').select('*, seller:profiles!seller_id(full_name, email)').order('created_at', { ascending: false }),
        supabase.from('payments').select('amount'),
        supabase.from('expenses').select('amount, payment_status, validation_status')
      ]);

      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data || []);
      if (ttRes.data) setTicketTypes(ttRes.data);
      if (quotasRes.data) setQuotas(quotasRes.data);

      const encaisse = (paymentsRes.data || []).reduce((acc: number, p: any) => acc + p.amount, 0);
      setTotalEncaisse(encaisse);

      const depensesActees = (expensesRes.data || [])
        .filter((e: any) => e.payment_status === 'reglee' && e.validation_status === 'validee')
        .reduce((acc: number, e: any) => acc + e.amount, 0);
      setTotalDepensesActees(depensesActees);
    } catch (error: any) {
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    // Note: In a real app, you'd use a Supabase Edge Function or Admin API to create auth users.
    // For this demo, we'll assume users sign up themselves and admin just updates their role.
    // Or we can use a "Pre-registration" table.
    toast.info("L'utilisateur doit d'abord s'inscrire. Vous pourrez ensuite modifier son rôle.");
  }

  async function handleAssignQuota(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSellerId || !selectedTicketTypeId || quotaQuantity <= 0) return;

    try {
      // Check if quota already exists for this seller and ticket type
      const existing = quotas.find(q => q.seller_id === selectedSellerId && q.ticket_type_id === selectedTicketTypeId);
      
      if (existing) {
        const { error } = await supabase
          .from('quotas')
          .update({ quantity_given: existing.quantity_given + quotaQuantity })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('quotas')
          .insert([{
            seller_id: selectedSellerId,
            ticket_type_id: selectedTicketTypeId,
            quantity_given: quotaQuantity
          }]);
        if (error) throw error;
      }

      toast.success('Quota attribué avec succès');
      setQuotaQuantity(0);
      fetchUsers(); // Refresh quotas
    } catch (error: any) {
      toast.error('Erreur lors de l\'attribution du quota');
    }
  }

  async function updateRole(userId: string, newRole: UserRole) {
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      if (error) throw error;
      toast.success('Rôle mis à jour');
      fetchUsers();
    } catch (error: any) {
      toast.error('Erreur lors de la mise à jour du rôle');
    }
  }

  async function toggleActive(userId: string, current: boolean) {
    const { error } = await supabase.from('profiles').update({ is_active: !current }).eq('id', userId);
    if (error) { toast.error('Erreur'); return; }
    toast.success(current ? 'Compte désactivé' : 'Compte activé');
    fetchUsers();
  }

  async function approveChanges(userId: string, changes: any) {
    const { error } = await supabase.from('profiles').update({ ...changes, pending_changes: null }).eq('id', userId);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Modifications approuvées');
    fetchUsers();
  }

  async function rejectChanges(userId: string) {
    const { error } = await supabase.from('profiles').update({ pending_changes: null }).eq('id', userId);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Modifications rejetées');
    fetchUsers();
  }

  async function handleExportSales() {
    try {
      toast.info('Préparation du fichier CSV...');
      const { data, error } = await supabase
        .from('sales')
        .select('*, payments(amount, created_at), seller:profiles!seller_id(full_name, email), seat:seats(seat_number, table:tables(name))');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Aucune vente à exporter.'); return; }

      let csvContent = '\uFEFF';
      csvContent += "Date,N° Ticket,Acheteur,Type de Billet,Vendeur,Prix Base,Réduction,Prix Final,Total Payé,Reste à Payer,Table,Place,Notes\n";

      data.forEach((s: any) => {
        const date = new Date(s.created_at).toLocaleString('fr-FR');
        const ticketName = ticketTypes.find(t => t.id === s.ticket_type_id)?.name || s.ticket_type_id;
        const totalPaid = s.payments ? s.payments.reduce((acc: number, p: any) => acc + p.amount, 0) : 0;
        const seat = s.seat?.[0];
        const row = [
          date,
          s.ticket_number || '',
          s.buyer_name || '',
          ticketName,
          s.seller?.full_name || s.seller?.email || '',
          s.base_price || 0,
          s.discount_amount || 0,
          s.final_price || 0,
          totalPaid,
          (s.final_price || 0) - totalPaid,
          seat?.table?.name || '',
          seat ? `N°${seat.seat_number}` : '',
          s.notes || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        csvContent += row + '\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `galatrace_ventes_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Téléchargement terminé');
    } catch (error: any) {
      toast.error('Erreur lors de l\'exportation');
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestion des Comptes</h2>
          <p className="text-zinc-400">Administrez les accès et les rôles du comité.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportSales} variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-white">
            <Download className="w-4 h-4 mr-2" />
            Exporter les Ventes
          </Button>
          <Button onClick={fetchUsers} variant="outline" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Panneau financier — Admin uniquement */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="w-5 h-5 text-green-500" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Fonds Encaissés</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{totalEncaisse.toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown className="w-5 h-5 text-red-400" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Dépenses Actées</span>
            </div>
            <p className="text-2xl font-bold text-red-400">{totalDepensesActees.toLocaleString()} F</p>
            <p className="text-xs text-zinc-600 mt-1">Réglées + validées uniquement</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <ArrowDownRight className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Reste en Caisse</span>
            </div>
            <p className="text-2xl font-bold text-amber-500">{(totalEncaisse - totalDepensesActees).toLocaleString()} F</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Utilisateurs</CardTitle>
            <CardDescription>Liste de tous les membres enregistrés.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Nom</TableHead>
                  <TableHead className="text-zinc-400">Email</TableHead>
                  <TableHead className="text-zinc-400">WhatsApp</TableHead>
                  <TableHead className="text-zinc-400">Rôle</TableHead>
                  <TableHead className="text-zinc-400">Statut</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold">
                          {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : (u.full_name || u.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <p>{u.full_name || '---'}</p>
                          {u.pending_changes && Object.keys(u.pending_changes).length > 0 && (
                            <p className="text-[10px] text-amber-500">⏳ Modif. en attente</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs">{u.email}</TableCell>
                    <TableCell>
                      {u.phone ? (
                        <a href={`https://wa.me/${u.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          className="text-green-500 text-xs hover:underline flex items-center gap-1">
                          📱 {u.phone}
                        </a>
                      ) : <span className="text-zinc-600 text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                        ${u.role === 'admin' ? 'bg-red-500/10 text-red-500' : u.role === 'tresoriere' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => toggleActive(u.id, u.is_active)}
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full transition-colors
                          ${u.is_active ? 'bg-green-500/10 text-green-500 hover:bg-red-500/10 hover:text-red-400' : 'bg-red-500/10 text-red-400 hover:bg-green-500/10 hover:text-green-500'}`}>
                        {u.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-2">
                        {u.pending_changes && Object.keys(u.pending_changes).length > 0 && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-green-500/50 text-green-500 hover:bg-green-500/10"
                              onClick={() => approveChanges(u.id, u.pending_changes)}>✓</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-500/50 text-red-500 hover:bg-red-500/10"
                              onClick={() => rejectChanges(u.id)}>✗</Button>
                          </div>
                        )}
                        <Select defaultValue={u.role} onValueChange={(val) => updateRole(u.id, val as UserRole)}>
                          <SelectTrigger className="w-[120px] bg-zinc-800 border-zinc-700 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="vendeur">Vendeur</SelectItem>
                            <SelectItem value="comite">Comité</SelectItem>
                            <SelectItem value="tresoriere">Trésorière Générale</SelectItem>
                            <SelectItem value="tresoriere_generale">Comptable</SelectItem>
                            <SelectItem value="direction">Direction</SelectItem>
                            <SelectItem value="observateur">Observateur</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
              <UserPlus className="w-5 h-5 text-amber-500" />
              Ajouter un membre
            </CardTitle>
            <CardDescription>Configurez un nouvel accès.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Nom complet</label>
                <Input 
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="bg-zinc-800 border-zinc-700" 
                  placeholder="Ex: Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Email</label>
                <Input 
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="bg-zinc-800 border-zinc-700" 
                  placeholder="email@exemple.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Rôle par défaut</label>
                <Select value={newUserRole} onValueChange={(val) => setNewUserRole(val as UserRole)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="vendeur">Vendeur</SelectItem>
                    <SelectItem value="comite">Comité</SelectItem>
                    <SelectItem value="tresoriere">Trésorière Générale</SelectItem>
                    <SelectItem value="tresoriere_generale">Comptable</SelectItem>
                    <SelectItem value="direction">Direction</SelectItem>
                    <SelectItem value="observateur">Observateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">
                Pré-enregistrer
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Carnets & Quotas Distribués</CardTitle>
            <CardDescription>Vue d'ensemble des limites de vente par vendeur.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Vendeur</TableHead>
                  <TableHead className="text-zinc-400">Type de Billet</TableHead>
                  <TableHead className="text-zinc-400">Quantité Allouée</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotas.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={3} className="text-center text-zinc-500 py-6">Aucun quota défini.</TableCell>
                  </TableRow>
                ) : (
                  quotas.map((q) => (
                    <TableRow key={q.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="font-medium">{q.seller?.full_name || q.seller?.email || 'Inconnu'}</TableCell>
                      <TableCell className="text-zinc-400">{ticketTypes.find(t => t.id === q.ticket_type_id)?.name || q.ticket_type_id}</TableCell>
                      <TableCell className="font-bold text-amber-500">{q.quantity_given}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-amber-500" />
              Attribuer un carnet
            </CardTitle>
            <CardDescription>Donner l'autorisation de vendre une quantité définie.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAssignQuota} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Vendeur</label>
                <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Choisir un vendeur" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {users
                      .filter(u => ['vendeur', 'comite', 'admin'].includes(u.role))
                      .map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Type de Billet</label>
                <Select value={selectedTicketTypeId} onValueChange={setSelectedTicketTypeId}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Choisir un type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {ticketTypes.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.price.toLocaleString()} F)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Quantité Ajoutée</label>
                <Input 
                  type="number"
                  min="1"
                  value={quotaQuantity || ''}
                  onChange={(e) => setQuotaQuantity(Number(e.target.value))}
                  className="bg-zinc-800 border-zinc-700" 
                  placeholder="Ex: 10"
                />
              </div>
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">
                Attribuer le Quota
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
