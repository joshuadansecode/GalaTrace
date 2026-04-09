import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Sale, Seat, Table as TableType } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Search, Users } from 'lucide-react';

export default function PublicView() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [tables, setTables] = useState<TableType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [salesRes, seatsRes, tablesRes] = await Promise.all([
        supabase.from('sales').select('*').order('buyer_name'),
        supabase.from('seats').select('*'),
        supabase.from('tables').select('*')
      ]);

      setSales(salesRes.data || []);
      setSeats(seatsRes.data || []);
      setTables(tablesRes.data || []);
    } catch (error) {
      console.error('Error fetching public data:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredGuests = sales.filter(s => 
    s.buyer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <header className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Liste des Invités & Placement</h2>
        <p className="text-zinc-400">Consultez la liste officielle des participants et trouvez votre place.</p>
      </header>

      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input 
          placeholder="Rechercher un nom..." 
          className="pl-10 bg-zinc-900 border-zinc-800"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Invité</TableHead>
                <TableHead className="text-zinc-400">Ticket</TableHead>
                <TableHead className="text-zinc-400">Table</TableHead>
                <TableHead className="text-zinc-400">Place</TableHead>
                <TableHead className="text-zinc-400">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGuests.map((guest) => {
                const seat = seats.find(s => s.sale_id === guest.id);
                const table = seat ? tables.find(t => t.id === seat.table_id) : null;
                
                return (
                  <TableRow key={guest.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium">{guest.buyer_name}</TableCell>
                    <TableCell className="text-zinc-400 text-xs uppercase">{guest.ticket_type_id.replace('_', ' ')}</TableCell>
                    <TableCell className="text-amber-500 font-medium">{table ? table.name : '---'}</TableCell>
                    <TableCell>{seat ? `N° ${seat.seat_number}` : '---'}</TableCell>
                    <TableCell>
                      <span className={`
                        px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                        ${guest.remaining_balance === 0 ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}
                      `}>
                        {guest.remaining_balance === 0 ? 'Soldé' : 'Partiel'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredGuests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-zinc-500">
                    Aucun invité trouvé.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
