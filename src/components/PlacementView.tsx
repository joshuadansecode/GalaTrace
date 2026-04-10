import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Table as TableType, Seat, Sale } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Armchair, Plus, X, Trash2 } from 'lucide-react';
import ContextMenu from './ContextMenu';

// Mapping ticket_type → category
const TICKET_CATEGORY: Record<string, string> = {
  gold_interne: 'gold',
  gold_externe: 'gold',
  platinum_interne: 'platinum',
  diamond_interne: 'diamond',
  diamond_externe: 'diamond',
  royal: 'royal',
};

const CATEGORIES = [
  { id: 'gold', label: 'Gold' },
  { id: 'platinum', label: 'Platinum' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'royal', label: 'Royal' },
];

export default function PlacementView({ profile }: { profile: Profile }) {
  const [tables, setTables] = useState<(TableType & { category?: string })[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);

  // Create tables form
  const [category, setCategory] = useState('gold');
  const [tableCount, setTableCount] = useState(1);
  const [capacity, setCapacity] = useState(10);
  const [tableNames, setTableNames] = useState<string[]>(['']);

  // Assign seat modal
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [selectedSeatCategory, setSelectedSeatCategory] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [tablesRes, salesRes, seatsRes] = await Promise.all([
      supabase.from('tables').select('*').order('name'),
      supabase.from('sales').select('*, payments(amount)'),
      supabase.from('seats').select('*')
    ]);
    setTables(tablesRes.data || []);
    const processed = (salesRes.data || []).map((s: any) => {
      const totalPaid = s.payments.reduce((a: number, p: any) => a + p.amount, 0);
      return { ...s, total_paid: totalPaid, remaining_balance: s.final_price - totalPaid };
    });
    setSales(processed);
    setSeats(seatsRes.data || []);
    setLoading(false);
  }

  function handleTableCountChange(n: number) {
    setTableCount(n);
    setTableNames(Array.from({ length: n }, (_, i) => tableNames[i] || ''));
  }

  async function handleCreateTables(e: React.FormEvent) {
    e.preventDefault();
    if (tableNames.some(n => !n.trim())) {
      toast.error('Nommez toutes les tables');
      return;
    }
    try {
      for (const name of tableNames) {
        const { data: table, error } = await supabase
          .from('tables')
          .insert([{ name: name.trim(), capacity, category }])
          .select().single();
        if (error) throw error;
        const newSeats = Array.from({ length: capacity }, (_, i) => ({
          table_id: table.id,
          seat_number: i + 1
        }));
        await supabase.from('seats').insert(newSeats);
      }
      toast.success(`${tableNames.length} table(s) créée(s)`);
      setTableNames(['']);
      setTableCount(1);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création');
    }
  }

  async function assignSeat(seatId: string, saleId: string | null) {
    const { error } = await supabase.from('seats').update({ sale_id: saleId }).eq('id', seatId);
    if (error) { toast.error('Erreur'); return; }
    toast.success(saleId ? 'Place assignée' : 'Place libérée');
    setSelectedSeat(null);
    fetchData();
  }

  async function handleDeleteTable(tableId: string) {
    if (!confirm('Supprimer cette table et toutes ses places ?')) return;
    await supabase.from('seats').delete().eq('table_id', tableId);
    const { error } = await supabase.from('tables').delete().eq('id', tableId);
    if (error) { toast.error('Erreur lors de la suppression'); return; }
    toast.success('Table supprimée');
    fetchData();
  }

  // Guests compatible with a category (not yet seated)
  function getCompatibleGuests(cat: string) {
    const seatedSaleIds = new Set(seats.filter(s => s.sale_id).map(s => s.sale_id));
    return sales.filter(s =>
      TICKET_CATEGORY[s.ticket_type_id] === cat && !seatedSaleIds.has(s.id)
    );
  }

  const groupedTables = CATEGORIES.map(cat => ({
    ...cat,
    tables: tables.filter(t => t.category === cat.id)
  })).filter(g => g.tables.length > 0);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Plan de Salle & Placement</h2>
            <p className="text-zinc-400">Gérez les tables par catégorie et attribuez les places.</p>
          </div>
          <button onClick={() => window.print()} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-lg transition-colors print:hidden">
            🖨️ Imprimer
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Plan de salle */}
        <div className="lg:col-span-2 space-y-8">
          {loading ? (
            <p className="text-zinc-500 text-sm">Chargement...</p>
          ) : groupedTables.length === 0 ? (
            <p className="text-zinc-500 text-sm">Aucune table créée.</p>
          ) : groupedTables.map(group => (
            <div key={group.id}>
              <h3 className="text-lg font-bold text-amber-500 mb-4 uppercase tracking-wider">{group.label}</h3>
              <div className="space-y-4">
                {group.tables.map(table => {
                  const tableSeats = seats.filter(s => s.table_id === table.id).sort((a, b) => a.seat_number - b.seat_number);
                  const occupied = tableSeats.filter(s => s.sale_id).length;
                  return (
                    <ContextMenu key={table.id} items={[
                      { label: 'Supprimer la table', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => handleDeleteTable(table.id) }
                    ]}>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="bg-zinc-800/30 border-b border-zinc-800 py-3 px-5">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Armchair className="w-4 h-4 text-amber-500" />
                            {table.name}
                          </CardTitle>
                          <span className="text-xs text-zinc-500">{occupied}/{table.capacity} places</span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {tableSeats.map(seat => {
                            const assignedSale = sales.find(s => s.id === seat.sale_id);
                            return (
                              <div
                                key={seat.id}
                                title={assignedSale?.notes || ''}
                                className={`p-2 rounded-lg border text-center cursor-pointer transition-all text-xs
                                  ${seat.sale_id
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:border-zinc-400'}`}
                                onClick={() => {
                                  if (seat.sale_id) {
                                    if (confirm(`Libérer la place de ${assignedSale?.buyer_name} ?`))
                                      assignSeat(seat.id, null);
                                  } else {
                                    setSelectedSeat(seat);
                                    setSelectedSeatCategory(table.category || '');
                                  }
                                }}
                              >
                                <p className="font-bold mb-0.5">#{seat.seat_number}</p>
                                <p className="truncate">{assignedSale ? assignedSale.buyer_name : 'Libre'}</p>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                    </ContextMenu>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Formulaire création tables */}
        <Card className="bg-zinc-900 border-zinc-800 h-fit sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              Créer des tables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTables} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Catégorie</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Nombre de tables</label>
                <Input type="number" min={1} max={20} value={tableCount}
                  onChange={(e) => handleTableCountChange(Number(e.target.value))}
                  className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Places par table</label>
                <Input type="number" min={1} value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Noms des tables</label>
                {tableNames.map((name, i) => (
                  <Input key={i} value={name}
                    onChange={(e) => {
                      const updated = [...tableNames];
                      updated[i] = e.target.value;
                      setTableNames(updated);
                    }}
                    placeholder={`Table ${i + 1}`}
                    className="bg-zinc-800 border-zinc-700" />
                ))}
              </div>
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">
                Créer les tables
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Modal assignation */}
      {selectedSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm bg-zinc-950 border-zinc-800 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <CardTitle className="flex justify-between items-center">
                Assigner la place #{selectedSeat.seat_number}
                <button onClick={() => setSelectedSeat(null)} className="text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 max-h-96 overflow-y-auto">
              {getCompatibleGuests(selectedSeatCategory).length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">Aucun invité {selectedSeatCategory} sans place.</p>
              ) : getCompatibleGuests(selectedSeatCategory).map(s => (
                <div key={s.id}
                  className="flex justify-between items-center p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 cursor-pointer transition-all"
                  onClick={() => assignSeat(selectedSeat.id, s.id)}
                >
                  <div>
                    <p className="font-medium text-sm">{s.buyer_name}</p>
                    {s.notes && <p className="text-xs text-zinc-500 mt-0.5">{s.notes}</p>}
                  </div>
                  <span className="text-xs text-zinc-500 uppercase">{s.ticket_type_id.replace('_', ' ')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
