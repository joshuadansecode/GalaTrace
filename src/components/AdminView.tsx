import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, UserRole, TicketType, Quota, ROLE_LABELS } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { UserPlus, Shield, RefreshCw, Ticket, Download, TrendingDown, Wallet, ArrowDownRight, Trash2, FileText } from 'lucide-react';
import { notify } from '../lib/notify';
import ContextMenu from './ContextMenu';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Export modal state
  const [showExport, setShowExport] = useState(false);
  const [exportCols, setExportCols] = useState({
    date: true, ticket_number: true, buyer_name: true, buyer_phone: true,
    filiere: true, annee: true, ticket_type: true, vendeur: true,
    base_price: false, discount: false, final_price: true,
    total_paid: true, remaining: true, table: true, notes: true
  });
  const [exportFilter, setExportFilter] = useState({ ticket: '', status: '', filiere: '' });
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
        supabase.from('quotas').select('*, seller:profiles!seller_id(full_name, email), sales:sales(id)').order('created_at', { ascending: false }),
        supabase.from('payments').select('amount'),
        supabase.from('expenses').select('amount, payment_status, validation_status')
      ]);

      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data || []);
      if (ttRes.data) setTicketTypes(ttRes.data);

      // Enrichir les quotas avec le nombre de ventes réelles
      if (quotasRes.data) {
        const { data: salesData } = await supabase.from('sales').select('seller_id, ticket_type_id');
        const enriched = quotasRes.data.map((q: any) => ({
          ...q,
          sales_count: (salesData || []).filter(s => s.seller_id === q.seller_id && s.ticket_type_id === q.ticket_type_id).length
        }));
        setQuotas(enriched);
      }

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
      // Notifier le vendeur
      const ticketName = ticketTypes.find(t => t.id === selectedTicketTypeId)?.name || selectedTicketTypeId;
      await notify(selectedSellerId, 'Carnet attribué', `Un quota de ${quotaQuantity} billet(s) ${ticketName} vous a été attribué`, 'success');
      setQuotaQuantity(0);
      fetchUsers();
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
    if (!current) await notify(userId, 'Compte activé', 'Votre compte a été activé. Vous pouvez maintenant vous connecter.', 'success');
    fetchUsers();
  }

  async function handleExportPDF() {
    try {
      toast.info('Génération du PDF...');
      const { data, error } = await supabase
        .from('sales')
        .select('*, payments(amount), seller:profiles!seller_id(full_name, email)');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Aucune vente.'); return; }

      // Appliquer les mêmes filtres
      let filtered = data;
      if (exportFilter.ticket) filtered = filtered.filter((s: any) => s.ticket_type_id === exportFilter.ticket);
      if (exportFilter.status === 'solde') filtered = filtered.filter((s: any) => s.payments.reduce((a: number, p: any) => a + p.amount, 0) >= s.final_price);
      if (exportFilter.status === 'partiel') filtered = filtered.filter((s: any) => s.payments.reduce((a: number, p: any) => a + p.amount, 0) < s.final_price);
      if (exportFilter.filiere) filtered = filtered.filter((s: any) => (s.filiere || '').toUpperCase().includes(exportFilter.filiere.toUpperCase()));

      const doc = new jsPDF({ orientation: 'landscape' });

      // Titre
      doc.setFontSize(16);
      doc.text('GalaTrace — Liste des Ventes', 14, 15);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Exporté le ${new Date().toLocaleString('fr-FR')} — ${filtered.length} entrées`, 14, 22);
      doc.setTextColor(0);

      // Construire colonnes et données selon sélection
      const cols: string[] = [];
      if (exportCols.ticket_number) cols.push('N°');
      if (exportCols.buyer_name) cols.push('Acheteur');
      if (exportCols.buyer_phone) cols.push('WhatsApp');
      if (exportCols.filiere) cols.push('Filière');
      if (exportCols.annee) cols.push('An.');
      if (exportCols.ticket_type) cols.push('Ticket');
      if (exportCols.vendeur) cols.push('Vendeur');
      if (exportCols.final_price) cols.push('Prix');
      if (exportCols.total_paid) cols.push('Payé');
      if (exportCols.remaining) cols.push('Reste');
      if (exportCols.notes) cols.push('Notes');

      const rows = filtered.map((s: any) => {
        const totalPaid = s.payments.reduce((a: number, p: any) => a + p.amount, 0);
        const row: string[] = [];
        if (exportCols.ticket_number) row.push(s.ticket_number || '');
        if (exportCols.buyer_name) row.push(s.buyer_name || '');
        if (exportCols.buyer_phone) row.push(s.buyer_phone || '');
        if (exportCols.filiere) row.push(s.filiere || '');
        if (exportCols.annee) row.push(s.annee || '');
        if (exportCols.ticket_type) row.push((ticketTypes.find(t => t.id === s.ticket_type_id)?.name || s.ticket_type_id).replace(' Interne', '').replace(' Externe', ' Ext.'));
        if (exportCols.vendeur) row.push(s.seller?.full_name || s.seller?.email || '');
        if (exportCols.final_price) row.push(`${s.final_price?.toLocaleString()} F`);
        if (exportCols.total_paid) row.push(`${totalPaid.toLocaleString()} F`);
        if (exportCols.remaining) row.push(`${(s.final_price - totalPaid).toLocaleString()} F`);
        if (exportCols.notes) row.push(s.notes || '');
        return row;
      });

      autoTable(doc, {
        head: [cols],
        body: rows,
        startY: 28,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [180, 120, 0], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: 14, right: 14 },
      });

      doc.save(`galatrace_export_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success(`PDF généré — ${filtered.length} lignes`);
      setShowExport(false);
    } catch (err: any) {
      toast.error('Erreur PDF: ' + err.message);
    }
  }

  async function approveChanges(userId: string, changes: any) {
    const { error } = await supabase.from('profiles').update({ ...changes, pending_changes: null }).eq('id', userId);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Modifications approuvées');
    await notify(userId, 'Profil mis à jour', 'Vos modifications ont été approuvées par l\'admin', 'success');
    fetchUsers();
  }

  async function rejectChanges(userId: string) {
    const { error } = await supabase.from('profiles').update({ pending_changes: null }).eq('id', userId);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Modifications rejetées');
    await notify(userId, 'Modifications rejetées', 'Vos modifications de profil ont été rejetées par l\'admin', 'warning');
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

      // Appliquer les filtres
      let filtered = data;
      if (exportFilter.ticket) filtered = filtered.filter((s: any) => s.ticket_type_id === exportFilter.ticket);
      if (exportFilter.status === 'solde') filtered = filtered.filter((s: any) => {
        const paid = s.payments.reduce((a: number, p: any) => a + p.amount, 0);
        return paid >= s.final_price;
      });
      if (exportFilter.status === 'partiel') filtered = filtered.filter((s: any) => {
        const paid = s.payments.reduce((a: number, p: any) => a + p.amount, 0);
        return paid < s.final_price;
      });
      if (exportFilter.filiere) filtered = filtered.filter((s: any) =>
        (s.filiere || '').toUpperCase().includes(exportFilter.filiere.toUpperCase())
      );

      // Construire les en-têtes
      const headers: string[] = [];
      if (exportCols.date) headers.push('Date');
      if (exportCols.ticket_number) headers.push('N° Ticket');
      if (exportCols.buyer_name) headers.push('Acheteur');
      if (exportCols.buyer_phone) headers.push('WhatsApp');
      if (exportCols.filiere) headers.push('Filière');
      if (exportCols.annee) headers.push('Année');
      if (exportCols.ticket_type) headers.push('Type Billet');
      if (exportCols.vendeur) headers.push('Vendeur');
      if (exportCols.base_price) headers.push('Prix Base');
      if (exportCols.discount) headers.push('Réduction');
      if (exportCols.final_price) headers.push('Prix Final');
      if (exportCols.total_paid) headers.push('Total Payé');
      if (exportCols.remaining) headers.push('Reste');
      if (exportCols.table) headers.push('Table/Place');
      if (exportCols.notes) headers.push('Notes');

      let csv = '\uFEFF' + headers.join(',') + '\n';

      filtered.forEach((s: any) => {
        const totalPaid = s.payments.reduce((a: number, p: any) => a + p.amount, 0);
        const remaining = s.final_price - totalPaid;
        const seat = s.seat?.[0];
        const row: string[] = [];
        if (exportCols.date) row.push(`"${new Date(s.created_at).toLocaleString('fr-FR')}"`);
        if (exportCols.ticket_number) row.push(`"${s.ticket_number || ''}"`);
        if (exportCols.buyer_name) row.push(`"${(s.buyer_name || '').replace(/"/g, '""')}"`);
        if (exportCols.buyer_phone) row.push(`"${s.buyer_phone || ''}"`);
        if (exportCols.filiere) row.push(`"${s.filiere || ''}"`);
        if (exportCols.annee) row.push(`"${s.annee || ''}"`);
        if (exportCols.ticket_type) row.push(`"${ticketTypes.find(t => t.id === s.ticket_type_id)?.name || s.ticket_type_id}"`);
        if (exportCols.vendeur) row.push(`"${s.seller?.full_name || s.seller?.email || ''}"`);
        if (exportCols.base_price) row.push(s.base_price);
        if (exportCols.discount) row.push(s.discount_amount || 0);
        if (exportCols.final_price) row.push(s.final_price);
        if (exportCols.total_paid) row.push(totalPaid);
        if (exportCols.remaining) row.push(remaining);
        if (exportCols.table) row.push(`"${seat?.table?.name ? `${seat.table.name} #${seat.seat_number}` : ''}"`);
        if (exportCols.notes) row.push(`"${(s.notes || '').replace(/"/g, '""')}"`);
        csv += row.join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `galatrace_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`${filtered.length} lignes exportées`);
      setShowExport(false);
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
          <Button onClick={() => setShowExport(true)} variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-white">
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
                            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 mr-1">
                              {u.pending_changes.full_name && <p>Nom : <span className="text-white font-medium">{u.pending_changes.full_name}</span></p>}
                              {u.pending_changes.phone && <p>Tél : <span className="text-white font-medium">{u.pending_changes.phone}</span></p>}
                              {u.pending_changes.avatar_url && <p className="text-white font-medium">Nouvelle photo</p>}
                            </div>
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
                  <TableHead className="text-zinc-400">Alloué</TableHead>
                  <TableHead className="text-zinc-400">Vendus</TableHead>
                  <TableHead className="text-zinc-400">Restants</TableHead>
                  <TableHead className="text-zinc-400">Progression</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotas.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-6">Aucun quota défini.</TableCell>
                  </TableRow>
                ) : (
                  quotas.map((q) => {
                    const sold = (q.sales_count || 0);
                    const remaining = Math.max(0, q.quantity_given - sold);
                    const pct = q.quantity_given > 0 ? Math.min(100, (sold / q.quantity_given) * 100) : 0;
                    return (
                      <ContextMenu key={q.id} items={[
                        { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: async () => {
                          if (!confirm('Supprimer ce quota ?')) return;
                          await supabase.from('quotas').delete().eq('id', q.id);
                          fetchUsers();
                        }}
                      ]}>
                        <TableRow className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                          <TableCell className="font-medium">{q.seller?.full_name || q.seller?.email || 'Inconnu'}</TableCell>
                          <TableCell className="text-zinc-400">{ticketTypes.find(t => t.id === q.ticket_type_id)?.name || q.ticket_type_id}</TableCell>
                          <TableCell className="font-bold text-amber-500">{q.quantity_given}</TableCell>
                          <TableCell className="font-bold text-blue-400">{sold}</TableCell>
                          <TableCell className={`font-bold ${remaining === 0 ? 'text-red-400' : 'text-green-400'}`}>{remaining}</TableCell>
                          <TableCell className="w-32">
                            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-1">{Math.round(pct)}%</p>
                          </TableCell>
                        </TableRow>
                      </ContextMenu>
                    );
                  })
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

      {/* Modal Export */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b border-zinc-800">
              <p className="font-bold text-lg">Configurer l'export</p>
              <button onClick={() => setShowExport(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-6">
              {/* Filtres */}
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Filtres</p>
                <div className="grid grid-cols-1 gap-3">
                  <select value={exportFilter.ticket} onChange={e => setExportFilter(f => ({...f, ticket: e.target.value}))}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">Tous les types de tickets</option>
                    {ticketTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={exportFilter.status} onChange={e => setExportFilter(f => ({...f, status: e.target.value}))}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">Tous les statuts</option>
                    <option value="solde">Soldés uniquement</option>
                    <option value="partiel">Partiels uniquement</option>
                  </select>
                  <input value={exportFilter.filiere} onChange={e => setExportFilter(f => ({...f, filiere: e.target.value.toUpperCase()}))}
                    placeholder="Filière (ex: HTR, laisser vide pour tout)"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500" />
                </div>
              </div>

              {/* Colonnes */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Colonnes à inclure</p>
                  <div className="flex gap-2">
                    <button onClick={() => setExportCols(c => Object.fromEntries(Object.keys(c).map(k => [k, true])) as any)}
                      className="text-xs text-amber-500 hover:underline">Tout</button>
                    <button onClick={() => setExportCols(c => Object.fromEntries(Object.keys(c).map(k => [k, false])) as any)}
                      className="text-xs text-zinc-500 hover:underline">Aucun</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['date', 'Date'], ['ticket_number', 'N° Ticket'], ['buyer_name', 'Nom acheteur'],
                    ['buyer_phone', 'WhatsApp'], ['filiere', 'Filière'], ['annee', 'Année'],
                    ['ticket_type', 'Type billet'], ['vendeur', 'Vendeur'], ['base_price', 'Prix base'],
                    ['discount', 'Réduction'], ['final_price', 'Prix final'], ['total_paid', 'Total payé'],
                    ['remaining', 'Reste dû'], ['table', 'Table/Place'], ['notes', 'Notes']
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-zinc-800">
                      <input type="checkbox" checked={exportCols[key as keyof typeof exportCols]}
                        onChange={e => setExportCols(c => ({...c, [key]: e.target.checked}))}
                        className="accent-amber-500" />
                      <span className="text-sm text-zinc-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={handleExportSales}
                  className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> CSV (Excel)
                </button>
                <button onClick={handleExportPDF}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
