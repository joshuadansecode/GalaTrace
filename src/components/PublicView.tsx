import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Sale, Seat, Table as TableType } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, X, CreditCard, StickyNote, Pencil, Trash2, Users, Armchair, Phone, BadgeCheck, CircleAlert, Eye, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import ContextMenu from './ContextMenu';
import { formatTicketType } from '../lib/utils';
import { formatForDisplay, toE164, isValidPhoneNumber } from '../lib/phone';

export default function PublicView({ profile }: { profile: Profile | null }) {
  const [sales, setSales] = useState<any[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [tables, setTables] = useState<TableType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
  const [guestPayments, setGuestPayments] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  // Edit state (admin)
  const [editingGuest, setEditingGuest] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTicketNumber, setEditTicketNumber] = useState('');
  const [editTicketTypeId, setEditTicketTypeId] = useState('');
  const [editSellerId, setEditSellerId] = useState('');
  const [editFiliere, setEditFiliere] = useState('');
  const [editAnnee, setEditAnnee] = useState('');
  const [editBasePrice, setEditBasePrice] = useState('');
  const [editDiscountAmount, setEditDiscountAmount] = useState('');
  const [editFinalPrice, setEditFinalPrice] = useState('');
  const [editDiscountSource, setEditDiscountSource] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const isAdmin = profile?.role === 'admin';

  // Tri et filtres
  const [sortKey, setSortKey] = useState<'buyer_name' | 'ticket_type_id' | 'remaining_balance' | 'created_at' | 'ticket_number' | 'filiere'>('buyer_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterTicket, setFilterTicket] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeller, setFilterSeller] = useState('');
  const [filterFiliere, setFilterFiliere] = useState('');
  const [sellers, setSellers] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('public-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    setLoading(true);
    const [salesRes, seatsRes, tablesRes] = await Promise.all([
      supabase.from('sales').select('*, seller:profiles!seller_id(id, full_name, email), payments(amount, created_at, collector:profiles!collector_id(full_name, email))').order('buyer_name'),
      supabase.from('seats').select('*'),
      supabase.from('tables').select('*')
    ]);
    const processed = (salesRes.data || []).map((s: any) => {
      const totalPaid = s.payments.reduce((a: number, p: any) => a + p.amount, 0);
      return { ...s, total_paid: totalPaid, remaining_balance: s.final_price - totalPaid };
    });
    setSales(processed);
    setSeats(seatsRes.data || []);
    setTables(tablesRes.data || []);
    // Extraire vendeurs uniques
    const uniqueSellers = Array.from(
      new Map(
        processed
          .filter((s: any) => s.seller?.email)
          .map((s: any) => [s.seller.email, s.seller] as const)
      ).values()
    );
    setSellers(uniqueSellers);
    setLoading(false);
  }

  function openGuest(guest: any) {
    setSelectedGuest(guest);
    setGuestPayments(guest.payments || []);
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  }

  async function handleDelete(saleId: string) {
    if (!confirm('Supprimer cet acheteur ?')) return;
    const { error } = await supabase.from('sales').delete().eq('id', saleId);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Supprimé');
    fetchData();
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGuest) return;
    if (editPhone && !isValidPhoneNumber(editPhone)) {
      toast.error('Numéro WhatsApp invalide – format international attendu');
      return;
    }
    const { error } = await supabase.from('sales').update({
      buyer_name: editName,
      buyer_phone: editPhone || null,
      ticket_number: editTicketNumber || null,
      ticket_type_id: editTicketTypeId || null,
      seller_id: editSellerId || null,
      filiere: editFiliere || null,
      annee: editAnnee || null,
      base_price: editBasePrice === '' ? null : Number(editBasePrice),
      discount_amount: editDiscountAmount === '' ? null : Number(editDiscountAmount),
      final_price: editFinalPrice === '' ? null : Number(editFinalPrice),
      discount_source: editDiscountSource || null,
      notes: editNotes || null,
    }).eq('id', editingGuest.id);
    if (error) { toast.error('Erreur'); return; }
    toast.success('Modifié');
    setEditingGuest(null);
    fetchData();
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span className="ml-1 text-muted-foreground">{sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
  );

  const enrichedGuests = useMemo(
    () => sales.map((guest) => {
      const seat = seats.find(s => s.sale_id === guest.id) || null;
      const table = seat ? tables.find(t => t.id === seat.table_id) || null : null;
      return {
        ...guest,
        seat,
        table,
        phoneValid: Boolean(guest.buyer_phone && isValidPhoneNumber(guest.buyer_phone)),
      };
    }),
    [sales, seats, tables]
  );

  const summaryStats = useMemo(() => {
    const total = enrichedGuests.length;
    const sold = enrichedGuests.filter(guest => guest.remaining_balance === 0).length;
    const placed = enrichedGuests.filter(guest => guest.seat).length;
    const phoneReady = enrichedGuests.filter(guest => guest.phoneValid).length;
    const outstanding = enrichedGuests.reduce((sum, guest) => sum + Math.max(0, Number(guest.remaining_balance || 0)), 0);
    return { total, sold, placed, phoneReady, outstanding };
  }, [enrichedGuests]);

  const filteredGuests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return enrichedGuests
      .filter((guest) => {
        const haystack = [
          guest.buyer_name,
          guest.buyer_phone ? formatForDisplay(guest.buyer_phone) : '',
          guest.ticket_number,
          formatTicketType(guest.ticket_type_id),
          guest.seller?.full_name,
          guest.seller?.email,
          guest.filiere,
          guest.annee,
          guest.notes,
          guest.table ? `${guest.table.name} ${guest.seat?.seat_number ?? ''}` : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return (!query || haystack.includes(query))
          && (!filterTicket || guest.ticket_type_id === filterTicket)
          && (!filterStatus || (filterStatus === 'solde' ? guest.remaining_balance === 0 : guest.remaining_balance > 0))
          && (!filterSeller || guest.seller?.email === filterSeller)
          && (!filterFiliere || (guest.filiere || '').toUpperCase().includes(filterFiliere.toUpperCase()));
      })
      .sort((a, b) => {
        const va = a[sortKey] ?? '';
        const vb = b[sortKey] ?? '';
        if (sortKey === 'remaining_balance') {
          return sortDir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
        }
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
  }, [enrichedGuests, filterFiliere, filterSeller, filterStatus, filterTicket, searchTerm, sortDir, sortKey]);

  const paginatedGuests = filteredGuests.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterTicket('');
    setFilterStatus('');
    setFilterSeller('');
    setFilterFiliere('');
    setSortKey('buyer_name');
    setSortDir('asc');
    setPage(0);
  };

  return (
    <div className="w-full space-y-8">
      <header className="space-y-4 text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          <Users className="h-3.5 w-3.5" />
          Liste des invités
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Liste des Invités &amp; Placement</h2>
          <p className="mt-2 text-muted-foreground">
            Recherche multi-champs sur le nom, téléphone, ticket, vendeur, filière et table.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-bold">{summaryStats.total}</p>
            </div>
            <Users className="h-8 w-8 text-amber-500" />
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Soldés</p>
              <p className="mt-1 text-2xl font-bold text-green-500">{summaryStats.sold}</p>
            </div>
            <BadgeCheck className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Placés</p>
              <p className="mt-1 text-2xl font-bold text-blue-400">{summaryStats.placed}</p>
            </div>
            <Armchair className="h-8 w-8 text-blue-400" />
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">WhatsApp OK</p>
              <p className="mt-1 text-2xl font-bold text-cyan-400">{summaryStats.phoneReady}</p>
            </div>
            <Phone className="h-8 w-8 text-cyan-400" />
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reste dû</p>
              <p className="mt-1 text-2xl font-bold text-amber-500">{summaryStats.outstanding.toLocaleString()} F</p>
            </div>
            <CircleAlert className="h-8 w-8 text-amber-500" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nom, téléphone, ticket, vendeur, table..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              />
            </div>

            <select
              value={filterTicket}
              onChange={(e) => { setFilterTicket(e.target.value); setPage(0); }}
              className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">Tous les tickets</option>
              <option value="gold_interne">Gold Interne</option>
              <option value="platinum_interne">Platinum Interne</option>
              <option value="diamond_interne">Diamond Interne</option>
              <option value="gold_externe">Gold Externe</option>
              <option value="diamond_externe">Diamond Externe</option>
              <option value="royal">Royal</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
              className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">Tous les statuts</option>
              <option value="solde">Soldé</option>
              <option value="partiel">Partiel</option>
            </select>

            <select
              value={filterSeller}
              onChange={(e) => { setFilterSeller(e.target.value); setPage(0); }}
              className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">Tous les vendeurs</option>
              {sellers.map((s: any) => <option key={s.email} value={s.email}>{s.full_name || s.email}</option>)}
            </select>

            <input
              type="text"
              placeholder="Filière"
              value={filterFiliere}
              onChange={(e) => { setFilterFiliere(e.target.value.toUpperCase()); setPage(0); }}
              className="h-8 w-28 rounded-lg border border-border bg-background px-3 text-sm uppercase text-foreground placeholder:text-muted-foreground"
            />

            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              Réinitialiser
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              {filteredGuests.length} résultat(s) sur {summaryStats.total} invité(s)
            </p>
            <p>
              Trié par <span className="font-medium text-foreground">{sortKey}</span> · {sortDir === 'asc' ? 'croissant' : 'décroissant'}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-[1320px] w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('buyer_name')}>Nom <SortIcon k="buyer_name" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('ticket_number')}>Ticket <SortIcon k="ticket_number" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('ticket_type_id')}>Billet <SortIcon k="ticket_type_id" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('filiere')}>Filière <SortIcon k="filiere" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vendeur</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('remaining_balance')}>Paiement <SortIcon k="remaining_balance" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Placement</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Statuts</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      Chargement de la liste des invités...
                    </td>
                  </tr>
                ) : null}

                {!loading && paginatedGuests.map((guest) => {
                  const contextItems = isAdmin ? [
                    { label: 'Modifier', icon: <Pencil className="w-4 h-4" />, onClick: () => { setEditingGuest(guest); setEditName(guest.buyer_name || ''); setEditPhone(guest.buyer_phone || ''); setEditTicketNumber(guest.ticket_number || ''); setEditTicketTypeId(guest.ticket_type_id || ''); setEditSellerId(guest.seller_id || ''); setEditFiliere(guest.filiere || ''); setEditAnnee(guest.annee || ''); setEditBasePrice(String(guest.base_price ?? '')); setEditDiscountAmount(String(guest.discount_amount ?? '')); setEditFinalPrice(String(guest.final_price ?? '')); setEditDiscountSource(guest.discount_source || ''); setEditNotes(guest.notes || ''); } },
                    { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => handleDelete(guest.id) }
                  ] : [];

                  return (
                    <React.Fragment key={guest.id}>
                      <ContextMenu items={contextItems}>
                      <tr className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => openGuest(guest)}>
                        <td className="px-4 py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{guest.buyer_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex flex-col gap-1">
                            <span className="truncate">{guest.buyer_phone ? formatForDisplay(guest.buyer_phone) : '—'}</span>
                            {guest.buyer_phone ? (
                              guest.phoneValid ? (
                                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-400">
                                  <Phone className="h-3 w-3" /> WhatsApp ok
                                </span>
                              ) : (
                                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                                  <CircleAlert className="h-3 w-3" /> Numéro invalide
                                </span>
                              )
                            ) : (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                <Phone className="h-3 w-3" /> Non renseigné
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{guest.ticket_number || '—'}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{formatTicketType(guest.ticket_type_id)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {guest.filiere || guest.annee
                            ? <span className="truncate block text-foreground">{(guest.filiere || '') + (guest.annee || '')}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <span className="truncate block">{guest.seller?.full_name || guest.seller?.email || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">
                          <div className="ml-auto flex w-fit flex-col items-end gap-1">
                            <span className={`font-semibold ${guest.remaining_balance > 0 ? 'text-amber-400' : 'text-green-500'}`}>
                              {guest.remaining_balance?.toLocaleString()} F restant
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {guest.total_paid?.toLocaleString()} F / {guest.final_price?.toLocaleString()} F
                            </span>
                            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${guest.remaining_balance > 0 ? 'bg-amber-500' : 'bg-green-500'}`}
                                style={{ width: `${guest.final_price ? Math.min(100, Math.round((guest.total_paid / guest.final_price) * 100)) : 0}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex flex-col gap-1">
                            <span className="truncate font-medium text-foreground">{guest.table ? `${guest.table.name}${guest.seat ? ` #${guest.seat.seat_number}` : ''}` : '—'}</span>
                            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${guest.table ? 'border border-blue-500/20 bg-blue-500/10 text-blue-400' : 'border border-zinc-500/20 bg-zinc-500/10 text-zinc-400'}`}>
                              <Armchair className="h-3 w-3" /> {guest.table ? 'Placé' : 'À placer'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${guest.remaining_balance === 0 ? 'border border-green-500/20 bg-green-500/10 text-green-400' : 'border border-amber-500/20 bg-amber-500/10 text-amber-400'}`}>
                              <BadgeCheck className="h-3 w-3" /> {guest.remaining_balance === 0 ? 'Soldé' : 'Partiel'}
                            </span>
                            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${guest.phoneValid ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-400' : 'border border-red-500/20 bg-red-500/10 text-red-400'}`}>
                              <Phone className="h-3 w-3" /> {guest.phoneValid ? 'WhatsApp' : 'Téléphone'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); openGuest(guest); }} title="Voir le détail">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {guest.phoneValid ? (
                              <Button type="button" variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${toE164(guest.buyer_phone)}`, '_blank', 'noreferrer'); }} title="Ouvrir WhatsApp">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {isAdmin ? (
                              <Button type="button" variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); setEditingGuest(guest); setEditName(guest.buyer_name || ''); setEditPhone(guest.buyer_phone || ''); setEditTicketNumber(guest.ticket_number || ''); setEditTicketTypeId(guest.ticket_type_id || ''); setEditSellerId(guest.seller_id || ''); setEditFiliere(guest.filiere || ''); setEditAnnee(guest.annee || ''); setEditBasePrice(String(guest.base_price ?? '')); setEditDiscountAmount(String(guest.discount_amount ?? '')); setEditFinalPrice(String(guest.final_price ?? '')); setEditDiscountSource(guest.discount_source || ''); setEditNotes(guest.notes || ''); }} title="Modifier">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      </ContextMenu>
                    </React.Fragment>
                  );
                })}

                {!loading && filteredGuests.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      Aucun invité trouvé avec ces filtres.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {filteredGuests.length > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                ← Précédent
              </Button>
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredGuests.length)} sur {filteredGuests.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= filteredGuests.length}
                onClick={() => setPage(p => p + 1)}
              >
                Suivant →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal édition invité (admin) */}
      {editingGuest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <p className="font-bold">Édition admin complète</p>
              <button onClick={() => setEditingGuest(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">Admin : tous les champs de vente et d'invité sont modifiables.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nom acheteur *</label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} required placeholder="Nom de l'acheteur" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">WhatsApp</label>
                  <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Numéro WhatsApp" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">N° Ticket</label>
                  <Input value={editTicketNumber} onChange={e => setEditTicketNumber(e.target.value)} placeholder="Numéro du ticket" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Filière</label>
                  <Input value={editFiliere} onChange={e => setEditFiliere(e.target.value.toUpperCase())} placeholder="Ex: HTR" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Année</label>
                  <select value={editAnnee} onChange={(e) => setEditAnnee(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value="">Année</option>
                    <option value="1">1ère</option>
                    <option value="2">2ème</option>
                    <option value="3">3ème</option>
                    <option value="Externe">Externe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Type de ticket</label>
                  <select value={editTicketTypeId} onChange={(e) => setEditTicketTypeId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value="">Type de ticket</option>
                    <option value="gold_interne">Gold Interne</option>
                    <option value="platinum_interne">Platinum Interne</option>
                    <option value="diamond_interne">Diamond Interne</option>
                    <option value="gold_externe">Gold Externe</option>
                    <option value="diamond_externe">Diamond Externe</option>
                    <option value="royal">Royal</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Vendeur</label>
                  <select value={editSellerId} onChange={(e) => setEditSellerId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value="">Vendeur</option>
                    {sellers.map((s: any) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Prix de base (F)</label>
                  <Input type="number" min="0" value={editBasePrice} onChange={(e) => setEditBasePrice(e.target.value)} placeholder="15000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Remise (F)</label>
                  <Input type="number" min="0" value={editDiscountAmount} onChange={(e) => setEditDiscountAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Prix final (F)</label>
                  <Input type="number" min="0" value={editFinalPrice} onChange={(e) => setEditFinalPrice(e.target.value)} placeholder="15000" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Source de la remise</label>
                  <Input value={editDiscountSource} onChange={(e) => setEditDiscountSource(e.target.value)} placeholder="Ex: BDE, Promotion" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                  <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Informations complémentaires" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingGuest(null)} className="flex-1 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm">Annuler</button>
                <button type="submit" className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal détail invité */}
      {selectedGuest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-card border-border shadow-2xl">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex justify-between items-center">
                {selectedGuest.buyer_name}
                <button onClick={() => setSelectedGuest(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">Ticket</p>
                  <p className="font-bold">{formatTicketType(selectedGuest.ticket_type_id)}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">N° Ticket</p>
                  <p className="font-bold">{selectedGuest.ticket_number || '—'}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">Filière / Année</p>
                  <p className="font-bold">{(selectedGuest.filiere || '') + (selectedGuest.annee || '') || '—'}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">Prix final</p>
                  <p className="font-bold">{selectedGuest.final_price?.toLocaleString()} F</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">Vendeur</p>
                  <p className="font-bold">{selectedGuest.seller?.full_name || selectedGuest.seller?.email || '—'}</p>
                </div>
                {selectedGuest.buyer_phone && (
                  <div className="bg-muted rounded-lg p-3 col-span-2">
                    <p className="text-muted-foreground text-xs mb-1">WhatsApp</p>
                    {isValidPhoneNumber(selectedGuest.buyer_phone) ? (
                      <a href={`https://wa.me/${toE164(selectedGuest.buyer_phone)}`} target="_blank" rel="noreferrer"
                        className="font-bold text-green-500 hover:underline flex items-center gap-1">
                        📱 {formatForDisplay(selectedGuest.buyer_phone)}
                      </a>
                    ) : (
                      <span className="font-bold text-red-500">Numéro invalide</span>
                    )}
                  </div>
                )}
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">Total payé</p>
                  <p className="font-bold text-green-500">{selectedGuest.total_paid?.toLocaleString()} F</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-1">Reste dû</p>
                  <p className={`font-bold ${selectedGuest.remaining_balance > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                    {selectedGuest.remaining_balance?.toLocaleString()} F
                  </p>
                </div>
              </div>

              {selectedGuest.notes && (
                <div className="bg-muted border border-border rounded-lg p-3 flex gap-2">
                  <StickyNote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm">{selectedGuest.notes}</p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-bold">Historique des paiements</p>
                </div>
                {guestPayments.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Aucun paiement enregistré.</p>
                ) : (
                  <div className="space-y-2">
                    {guestPayments.map((payment: any) => (
                      <div key={payment.id} className="flex justify-between items-center text-sm bg-muted rounded-lg px-3 py-2 border border-border">
                        <div>
                          <p className="font-bold text-green-500">+{payment.amount.toLocaleString()} F</p>
                          <p className="text-xs text-muted-foreground">par {payment.collector?.full_name || payment.collector?.email || '?'}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(payment.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
