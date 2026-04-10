import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Sale, Seat, Table as TableType } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Search, X, CreditCard, StickyNote } from 'lucide-react';

export default function PublicView() {
  const [sales, setSales] = useState<any[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [tables, setTables] = useState<TableType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
  const [guestPayments, setGuestPayments] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

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
    setLoading(false);
  }

  function openGuest(guest: any) {
    setSelectedGuest(guest);
    setGuestPayments(guest.payments || []);
  }

  const filteredGuests = sales.filter(s =>
    s.buyer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const paginatedGuests = filteredGuests.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-8">
      <header className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Liste des Invités & Placement</h2>
        <p className="text-zinc-400">Consultez la liste officielle des participants et trouvez votre place.</p>
      </header>

      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input placeholder="Rechercher un nom..." className="pl-10 bg-zinc-900 border-zinc-800"
          value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }} />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Invité</TableHead>
                <TableHead className="text-zinc-400">N°</TableHead>
                <TableHead className="text-zinc-400">Ticket</TableHead>
                <TableHead className="text-zinc-400">Vendeur</TableHead>
                <TableHead className="text-zinc-400">Table</TableHead>
                <TableHead className="text-zinc-400">Place</TableHead>
                <TableHead className="text-zinc-400">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedGuests.map((guest) => {
                const seat = seats.find(s => s.sale_id === guest.id);
                const table = seat ? tables.find(t => t.id === seat.table_id) : null;
                return (
                  <TableRow key={guest.id}
                    className="border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                    onClick={() => openGuest(guest)}
                  >
                    <TableCell className="font-medium">{guest.buyer_name}</TableCell>
                    <TableCell className="text-zinc-500 text-xs">{guest.ticket_number || '—'}</TableCell>
                    <TableCell className="text-zinc-400 text-xs uppercase">{guest.ticket_type_id.replace('_', ' ')}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{guest.seller?.full_name || guest.seller?.email || '—'}</TableCell>
                    <TableCell className="text-amber-500 font-medium">{table ? table.name : '---'}</TableCell>
                    <TableCell>{seat ? `N° ${seat.seat_number}` : '---'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                        ${guest.remaining_balance === 0 ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {guest.remaining_balance === 0 ? 'Soldé' : 'Partiel'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredGuests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-zinc-500">Aucun invité trouvé.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {filteredGuests.length > PAGE_SIZE && (
            <div className="flex justify-between items-center p-4 text-sm text-zinc-400 border-t border-zinc-800">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-30 hover:bg-zinc-700">← Précédent</button>
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredGuests.length)} sur {filteredGuests.length}</span>
              <button disabled={(page + 1) * PAGE_SIZE >= filteredGuests.length} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-30 hover:bg-zinc-700">Suivant →</button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal détail invité */}
      {selectedGuest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <CardTitle className="flex justify-between items-center">
                {selectedGuest.buyer_name}
                <button onClick={() => setSelectedGuest(null)} className="text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              {/* Infos vente */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Ticket</p>
                  <p className="font-bold uppercase">{selectedGuest.ticket_type_id.replace('_', ' ')}</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">N° Ticket</p>
                  <p className="font-bold">{selectedGuest.ticket_number || '—'}</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Prix final</p>
                  <p className="font-bold">{selectedGuest.final_price?.toLocaleString()} F</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Vendeur</p>
                  <p className="font-bold">{selectedGuest.seller?.full_name || selectedGuest.seller?.email || '—'}</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Total payé</p>
                  <p className="font-bold text-green-500">{selectedGuest.total_paid?.toLocaleString()} F</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Reste dû</p>
                  <p className={`font-bold ${selectedGuest.remaining_balance > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                    {selectedGuest.remaining_balance?.toLocaleString()} F
                  </p>
                </div>
              </div>

              {/* Notes */}
              {selectedGuest.notes && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex gap-2">
                  <StickyNote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-zinc-300">{selectedGuest.notes}</p>
                </div>
              )}

              {/* Historique paiements */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-bold">Historique des paiements</p>
                </div>
                {guestPayments.length === 0 ? (
                  <p className="text-zinc-500 text-xs">Aucun paiement enregistré.</p>
                ) : (
                  <div className="space-y-2">
                    {guestPayments.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm bg-zinc-900 rounded-lg px-3 py-2">
                        <div>
                          <p className="font-medium text-green-400">+{p.amount?.toLocaleString()} F</p>
                          <p className="text-xs text-zinc-500">{p.collector?.full_name || p.collector?.email || '—'}</p>
                        </div>
                        <p className="text-xs text-zinc-600">{new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
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
