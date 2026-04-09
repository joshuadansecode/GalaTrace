import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Table as TableType, Seat, Sale } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { Armchair, Plus, Users, Trash2 } from 'lucide-react';

export default function PlacementView({ profile }: { profile: Profile }) {
  const [tables, setTables] = useState<TableType[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);

  // New table form
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState(10);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [tablesRes, salesRes, seatsRes] = await Promise.all([
        supabase.from('tables').select('*').order('name'),
        supabase.from('sales').select('*'),
        supabase.from('seats').select('*')
      ]);

      if (tablesRes.error) throw tablesRes.error;
      if (salesRes.error) throw salesRes.error;
      if (seatsRes.error) throw seatsRes.error;

      setTables(tablesRes.data || []);
      setSales(salesRes.data || []);
      setSeats(seatsRes.data || []);
    } catch (error: any) {
      toast.error('Erreur lors du chargement du plan de salle');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTable(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data: table, error } = await supabase
        .from('tables')
        .insert([{ name: tableName, capacity }])
        .select()
        .single();

      if (error) throw error;

      // Create empty seats
      const newSeats = Array.from({ length: capacity }, (_, i) => ({
        table_id: table.id,
        seat_number: i + 1
      }));

      const { error: seatsError } = await supabase.from('seats').insert(newSeats);
      if (seatsError) throw seatsError;

      toast.success('Table créée avec succès');
      setTableName('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création');
    }
  }

  async function assignSeat(seatId: string, saleId: string | null) {
    try {
      const { error } = await supabase
        .from('seats')
        .update({ sale_id: saleId })
        .eq('id', seatId);

      if (error) throw error;
      toast.success(saleId ? 'Place assignée' : 'Place libérée');
      fetchData();
    } catch (error: any) {
      toast.error('Erreur lors de l\'assignation');
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Plan de Salle & Placement</h2>
        <p className="text-zinc-400">Gérez les tables et l'attribution des places aux invités.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {tables.map(table => (
            <Card key={table.id} className="bg-zinc-900 border-zinc-800 overflow-hidden">
              <CardHeader className="bg-zinc-800/30 border-b border-zinc-800">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2">
                    <Armchair className="w-5 h-5 text-amber-500" />
                    {table.name}
                  </CardTitle>
                  <span className="text-xs font-medium text-zinc-500 uppercase">
                    {seats.filter(s => s.table_id === table.id && s.sale_id).length} / {table.capacity} Places
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {seats
                    .filter(s => s.table_id === table.id)
                    .sort((a, b) => a.seat_number - b.seat_number)
                    .map(seat => {
                      const assignedSale = sales.find(s => s.id === seat.sale_id);
                      return (
                        <div 
                          key={seat.id}
                          className={`
                            p-3 rounded-lg border text-center transition-all cursor-pointer
                            ${seat.sale_id 
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                              : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:border-zinc-500'}
                          `}
                          onClick={() => {
                            if (seat.sale_id) {
                              if (confirm('Libérer cette place ?')) assignSeat(seat.id, null);
                            } else {
                              const saleId = prompt('ID de la vente ou nom de l\'acheteur ?');
                              if (saleId) {
                                // In a real app, we'd use a searchable dropdown
                                const foundSale = sales.find(s => s.buyer_name.toLowerCase().includes(saleId.toLowerCase()));
                                if (foundSale) assignSeat(seat.id, foundSale.id);
                                else toast.error('Vente non trouvée');
                              }
                            }
                          }}
                        >
                          <p className="text-[10px] font-bold uppercase mb-1">Place {seat.seat_number}</p>
                          <p className="text-xs truncate font-medium">
                            {assignedSale ? assignedSale.buyer_name : 'Libre'}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-zinc-900 border-zinc-800 h-fit sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              Ajouter une Table
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTable} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Nom de la table</label>
                <Input 
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  required
                  placeholder="Ex: Table VIP 1"
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase">Capacité (Places)</label>
                <Input 
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  required
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">
                Créer la table
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
