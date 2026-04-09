import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, UserRole, TicketType, Quota } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { UserPlus, Shield, RefreshCw, Ticket } from 'lucide-react';

export default function AdminView({ profile }: { profile: Profile }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('vendeur');
  const [newUserName, setNewUserName] = useState('');

  // Quotas state
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [quotas, setQuotas] = useState<any[]>([]); // Any because we join seller info
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState('');
  const [quotaQuantity, setQuotaQuantity] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const [usersRes, ttRes, quotasRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('ticket_types').select('*'),
        supabase.from('quotas').select('*, seller:profiles!seller_id(full_name, email)').order('created_at', { ascending: false })
      ]);

      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data || []);
      if (ttRes.data) setTicketTypes(ttRes.data);
      if (quotasRes.data) setQuotas(quotasRes.data);
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
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      toast.success('Rôle mis à jour');
      fetchUsers();
    } catch (error: any) {
      toast.error('Erreur lors de la mise à jour du rôle');
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestion des Comptes</h2>
          <p className="text-zinc-400">Administrez les accès et les rôles du comité.</p>
        </div>
        <Button onClick={fetchUsers} variant="outline" size="icon">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

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
                  <TableHead className="text-zinc-400">Rôle</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium">{u.full_name || '---'}</TableCell>
                    <TableCell className="text-zinc-400">{u.email}</TableCell>
                    <TableCell>
                      <span className={`
                        px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                        ${u.role === 'admin' ? 'bg-red-500/10 text-red-500' : 
                          u.role === 'tresoriere' ? 'bg-green-500/10 text-green-500' : 
                          'bg-blue-500/10 text-blue-500'}
                      `}>
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Select 
                        defaultValue={u.role} 
                        onValueChange={(val) => updateRole(u.id, val as UserRole)}
                      >
                        <SelectTrigger className="w-[130px] bg-zinc-800 border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="vendeur">Vendeur</SelectItem>
                          <SelectItem value="comite">Comité</SelectItem>
                          <SelectItem value="tresoriere">Trésorière</SelectItem>
                          <SelectItem value="tresoriere_generale">Trésorière Générale</SelectItem>
                          <SelectItem value="direction">Direction</SelectItem>
                          <SelectItem value="observateur">Observateur</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <SelectItem value="tresoriere">Trésorière</SelectItem>
                    <SelectItem value="direction">Direction</SelectItem>
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
