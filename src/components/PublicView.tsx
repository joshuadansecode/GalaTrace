import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Sale, Seat, Table as TableType } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Search, X, CreditCard, StickyNote, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ContextMenu from './ContextMenu';
import { formatTicketType } from '../lib/utils';

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
  const [editFiliere, setEditFiliere] = useState('');
  const [editAnnee, setEditAnnee] = useState('');
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
      supabase.from('sales').select('*, seller:profiles!seller_id(full_name, email), payments(amount, created_at, collector:profiles!collector_id(full_name, email))').order('buyer_name'),
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
    const uniqueSellers = Array.from(new Map(processed.map((s: any) => [s.seller?.email, s.seller]).filter(([k]) => k)).values());
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
    const { error } = await supabase.from('sales').update({
      buyer_name: editName,
      buyer_phone: editPhone || null,
      ticket_number: editTicketNumber || null,
      filiere: editFiliere || null,
      annee: editAnnee || null,
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

  const filteredGuests = sales
    .filter(s => s.buyer_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(s => !filterTicket || s.ticket_type_id === filterTicket)
    .filter(s => !filterStatus || (filterStatus === 'solde' ? s.remaining_balance === 0 : s.remaining_balance > 0))
    .filter(s => !filterSeller || s.seller?.email === filterSeller)
    .filter(s => !filterFiliere || (s.filiere || '').toUpperCase().includes(filterFiliere.toUpperCase()))
    .sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (sortKey === 'remaining_balance') {
        return sortDir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
      }
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  const paginatedGuests = filteredGuests.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-8">
      <header className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Liste des Invités & Placement</h2>
        <p className="text-muted-foreground">Consultez la liste officielle des participants et trouvez votre place.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un nom..." className="pl-10"
            value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }} />
        </div>
        <select value={filterTicket} onChange={(e) => { setFilterTicket(e.target.value); setPage(0); }}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="">Tous les tickets</option>
          <option value="gold_interne">Gold Interne</option>
          <option value="platinum_interne">Platinum Interne</option>
          <option value="diamond_interne">Diamond Interne</option>
          <option value="gold_externe">Gold Externe</option>
          <option value="diamond_externe">Diamond Externe</option>
          <option value="royal">Royal</option>
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="">Tous les statuts</option>
          <option value="solde">Soldé</option>
          <option value="partiel">Partiel</option>
        </select>
        <select value={filterSeller} onChange={(e) => { setFilterSeller(e.target.value); setPage(0); }}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
          <option value="">Tous les vendeurs</option>
          {sellers.map((s: any) => <option key={s.email} value={s.email}>{s.full_name || s.email}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filière (ex: HTR)"
          value={filterFiliere}
          onChange={(e) => { setFilterFiliere(e.target.value); setPage(0); }}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground uppercase w-32"
        />
        <span className="text-xs text-muted-foreground self-center">{filteredGuests.length} résultat(s)</span>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 bg-card z-10 border-b border-border">
              <tr>
                <th className="text-left text-muted-foreground font-medium px-2 py-2.5 w-[25%] cursor-pointer" onClick={() => toggleSort('buyer_name')}>Invité <SortIcon k="buyer_name" /></th>
                <th className="text-left text-muted-foreground font-medium px-2 py-2.5 w-[7%] cursor-pointer hidden sm:table-cell" onClick={() => toggleSort('ticket_number')}>N° <SortIcon k="ticket_number" /></th>
                <th className="text-left text-muted-foreground font-medium px-2 py-2.5 w-[14%] cursor-pointer" onClick={() => toggleSort('ticket_type_id')}>Ticket <SortIcon k="ticket_type_id" /></th>
                <th className="text-left text-muted-foreground font-medium px-2 py-2.5 w-[7%] cursor-pointer hidden md:table-cell" onClick={() => toggleSort('filiere')}>Filière <SortIcon k="filiere" /></th>
                <th className="text-left text-muted-foreground font-medium px-2 py-2.5 w-[12%] hidden lg:table-cell">Vendeur</th>
                <th className="text-right text-muted-foreground font-medium px-2 py-2.5 w-[9%] hidden sm:table-cell">Payé</th>
                <th className="text-right text-muted-foreground font-medium px-2 py-2.5 w-[9%] cursor-pointer" onClick={() => toggleSort('remaining_balance')}>Reste <SortIcon k="remaining_balance" /></th>
                <th className="text-left text-muted-foreground font-medium px-2 py-2.5 w-[9%] hidden md:table-cell">Table</th>
                <th className="text-center text-muted-foreground font-medium px-2 py-2.5 w-[8%]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {paginatedGuests.map((guest) => {
                const seat = seats.find(s => s.sale_id === guest.id);
                const table = seat ? tables.find(t => t.id === seat.table_id) : null;
                const contextItems = isAdmin ? [
                  { label: 'Modifier', icon: <Pencil className="w-4 h-4" />, onClick: () => { setEditingGuest(guest); setEditName(guest.buyer_name); setEditPhone(guest.buyer_phone || ''); setEditTicketNumber(guest.ticket_number || ''); setEditFiliere(guest.filiere || ''); setEditAnnee(guest.annee || ''); setEditNotes(guest.notes || ''); } },
                  { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => handleDelete(guest.id) }
                ] : [];
                return (
                  <ContextMenu key={guest.id} items={contextItems}>
                  <tr
                    className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => openGuest(guest)}
                  >
                    <td className="px-2 py-2.5 font-medium overflow-hidden">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{guest.buyer_name}</span>
                        {guest.buyer_phone && (
                          <a href={`https://wa.me/${guest.buyer_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                            className="text-green-500 hover:text-green-400 shrink-0" title={guest.buyer_phone} onClick={e => e.stopPropagation()}>📱</a>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">{guest.ticket_number || '—'}</td>
                    <td className="px-2 py-2.5 text-xs font-medium overflow-hidden truncate">{formatTicketType(guest.ticket_type_id)}</td>
                    <td className="px-2 py-2.5 text-xs hidden md:table-cell">
                      {guest.filiere || guest.annee
                        ? <span className="font-medium text-foreground">{(guest.filiere || '') + (guest.annee || '')}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground text-xs hidden lg:table-cell overflow-hidden truncate">{guest.seller?.full_name || guest.seller?.email || '—'}</td>
                    <td className="px-2 py-2.5 text-green-500 font-bold text-xs hidden sm:table-cell text-right tabular-nums">{guest.total_paid?.toLocaleString()} F</td>
                    <td className={`px-2 py-2.5 font-bold text-xs text-right tabular-nums ${guest.remaining_balance > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>{guest.remaining_balance?.toLocaleString()} F</td>
                    <td className="px-2 py-2.5 text-amber-500 text-xs hidden md:table-cell truncate">{table ? `${table.name}${seat ? ` #${seat.seat_number}` : ''}` : '---'}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap
                        ${guest.remaining_balance === 0 ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {guest.remaining_balance === 0 ? 'Soldé' : 'Partiel'}
                      </span>
                    </td>
                  </tr>
                  </ContextMenu>
                );
              })}
              {filteredGuests.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground">Aucun invité trouvé.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {filteredGuests.length > PAGE_SIZE && (
            <div className="flex justify-between items-center p-4 text-sm text-muted-foreground border-t border-border">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-muted disabled:opacity-30 hover:bg-muted/80">← Précédent</button>
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredGuests.length)} sur {filteredGuests.length}</span>
              <button disabled={(page + 1) * PAGE_SIZE >= filteredGuests.length} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-muted disabled:opacity-30 hover:bg-muted/80">Suivant →</button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal édition invité (admin) */}
      {editingGuest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <p className="font-bold">Modifier l'acheteur</p>
              <button onClick={() => setEditingGuest(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-3">
              <Input value={editName} onChange={e => setEditName(e.target.value)} required placeholder="Nom" />
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="WhatsApp" />
              <Input value={editTicketNumber} onChange={e => setEditTicketNumber(e.target.value)} placeholder="N° Ticket" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={editFiliere} onChange={e => setEditFiliere(e.target.value.toUpperCase())} placeholder="Filière" />
                <select value={editAnnee} onChange={e => setEditAnnee(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                  <option value="">Année</option>
                  <option value="1">1ère</option>
                  <option value="2">2ème</option>
                  <option value="3">3ème</option>
                  <option value="Externe">Externe</option>
                </select>
              </div>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" />
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
                    <a href={`https://wa.me/${selectedGuest.buyer_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      className="font-bold text-green-500 hover:underline flex items-center gap-1">
                      📱 {selectedGuest.buyer_phone}
                    </a>
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
                    {guestPayments.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm bg-muted rounded-lg px-3 py-2">
                        <div>
                          <p className="font-medium text-green-500">+{p.amount?.toLocaleString()} F</p>
                          <p className="text-xs text-muted-foreground">{p.collector?.full_name || p.collector?.email || '—'}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
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
