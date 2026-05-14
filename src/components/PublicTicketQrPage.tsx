import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Download, Loader2, QrCode, Search } from 'lucide-react';
import { formatTicketType } from '../lib/utils';

type PublicTicketType = {
  id: string;
  name: string;
  price: number;
};

type TicketQrResult = {
  sale_id: string;
  buyer_name: string;
  ticket_type_id: string;
  ticket_number: string;
  qr_token: string;
  qr_issued_at: string | null;
};

type TicketQrRpcResponse = Partial<TicketQrResult> & {
  error?: string;
};

export default function PublicTicketQrPage() {
  const [ticketTypes, setTicketTypes] = useState<PublicTicketType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [result, setResult] = useState<TicketQrResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    async function fetchTicketTypes() {
      setLoadingTypes(true);
      try {
        const { data, error } = await supabase
          .from('ticket_types')
          .select('id, name, price')
          .order('price', { ascending: true });

        if (error) throw error;

        const types = (data || []) as PublicTicketType[];
        setTicketTypes(types);
        if (types.length > 0) {
          setSelectedTicketType(types[0].id);
        }
      } catch (error: any) {
        toast.error(error.message || 'Impossible de charger les types de ticket.');
      } finally {
        setLoadingTypes(false);
      }
    }

    fetchTicketTypes();
  }, []);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicketType || !ticketNumber.trim()) {
      toast.error('Type de ticket et numéro requis.');
      return;
    }

    setSubmitting(true);
    setResult(null);
    setQrDataUrl('');

    try {
      const { data, error } = await supabase.rpc('public_get_ticket_qr', {
        p_ticket_type_id: selectedTicketType,
        p_ticket_number: ticketNumber.trim(),
      });

      if (error) throw error;

      const payload = (data || {}) as TicketQrRpcResponse;
      if (payload.error) throw new Error(payload.error);

      if (!payload.sale_id || !payload.qr_token || !payload.ticket_number || !payload.ticket_type_id || !payload.buyer_name) {
        throw new Error('Réponse QR invalide.');
      }

      const safeResult: TicketQrResult = {
        sale_id: payload.sale_id,
        buyer_name: payload.buyer_name,
        ticket_type_id: payload.ticket_type_id,
        ticket_number: payload.ticket_number,
        qr_token: payload.qr_token,
        qr_issued_at: payload.qr_issued_at || null,
      };

      const dataUrl = await QRCode.toDataURL(`GALATRACE:${safeResult.qr_token}`, {
        width: 420,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      setResult(safeResult);
      setQrDataUrl(dataUrl);
      toast.success('QR généré avec succès.');
    } catch (error: any) {
      toast.error(error.message || 'Ticket introuvable.');
    } finally {
      setSubmitting(false);
    }
  }

  function downloadQr() {
    if (!result || !qrDataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = qrDataUrl;
    anchor.download = `galatrace-${result.ticket_type_id}-${result.ticket_number}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6 lg:py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">Récupération du QR Ticket</h1>
        <p className="mt-2 text-sm text-zinc-400">Entrez votre type de ticket et votre numéro pour afficher et télécharger votre QR.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-amber-400" />
              Rechercher mon ticket
            </CardTitle>
            <CardDescription>Les informations saisies doivent correspondre à votre ticket GalaTrace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLookup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Type de ticket</label>
                <select
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  value={selectedTicketType}
                  onChange={(e) => setSelectedTicketType(e.target.value)}
                  disabled={loadingTypes || submitting}
                  required
                >
                  {ticketTypes.map((ticketType) => (
                    <option key={ticketType.id} value={ticketType.id}>
                      {ticketType.name} ({ticketType.price.toLocaleString()} F)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Numéro de ticket</label>
                <Input
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  placeholder="Ex: A-0246"
                  className="border-zinc-700 bg-zinc-900 text-zinc-100"
                  disabled={submitting}
                  required
                />
              </div>

              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loadingTypes || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Afficher mon QR'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-amber-400" />
              Mon QR Ticket
            </CardTitle>
            <CardDescription>Présentez ce QR à l'entrée le jour de l'événement.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result || !qrDataUrl ? (
              <div className="flex min-h-[380px] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-6 text-center text-sm text-zinc-500">
                Le QR apparaît ici après recherche du ticket.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center rounded-xl border border-zinc-800 bg-white p-4">
                  <img src={qrDataUrl} alt="QR Ticket GalaTrace" className="h-64 w-64" />
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
                  <p><span className="text-zinc-500">Nom:</span> <span className="font-semibold text-zinc-100">{result.buyer_name}</span></p>
                  <p><span className="text-zinc-500">Ticket:</span> <span className="font-semibold text-zinc-100">{formatTicketType(result.ticket_type_id)}</span></p>
                  <p><span className="text-zinc-500">Numéro:</span> <span className="font-semibold text-zinc-100">{result.ticket_number}</span></p>
                </div>
                <Button onClick={downloadQr} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger le QR
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
