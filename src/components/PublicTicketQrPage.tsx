import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Download, FileText, Loader2, QrCode, Search } from 'lucide-react';
import { formatTicketType } from '../lib/utils';
import { generateTicketPdf } from '../lib/generateTicketPdf';

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
  table_name?: string;
  seat_number?: number;
};

type TicketNotFound = { type: 'not_found' };
type TicketNotPaid = {
  type: 'not_paid';
  buyer_name: string;
  final_price: number;
  total_paid: number;
  remaining: number;
};
type TicketError = 'not_found' | 'not_paid' | null;

type TicketQrRpcResponse = Partial<TicketQrResult> & {
  error?: string;
  buyer_name?: string;
  final_price?: number;
  total_paid?: number;
  remaining?: number;
};

export default function PublicTicketQrPage() {
  const [ticketTypes, setTicketTypes] = useState<PublicTicketType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [phoneLastFour, setPhoneLastFour] = useState('');
  const [result, setResult] = useState<TicketQrResult | null>(null);
  const [notPaid, setNotPaid] = useState<TicketNotPaid | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Onboarding — s'affiche une seule fois, mémorisé en localStorage
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('galatrace-qr-onboarding') !== 'done';
  });
  const [onboardingStep, setOnboardingStep] = useState(0);

  const ONBOARDING_STEPS = [
    {
      icon: '🎟️',
      color: 'from-amber-500/20 to-amber-500/5',
      border: 'border-amber-500/30',
      accent: 'text-amber-400',
      title: 'Bienvenue sur la page QR',
      desc: 'Cette page te permet de récupérer ton QR d\'entrée pour la Nuit des Distingués 2026. Tu en auras besoin le soir du gala pour entrer.',
      hint: 'Suis les 3 étapes pour obtenir ton QR.',
    },
    {
      icon: '🔢',
      color: 'from-sky-500/20 to-sky-500/5',
      border: 'border-sky-500/30',
      accent: 'text-sky-400',
      title: 'Ton numéro de ticket',
      desc: 'Ton vendeur t\'a remis un ticket avec un numéro dessus. Ex: D022, G001, P003… C\'est ce numéro qu\'il faut saisir.',
      hint: 'Si tu ne le trouves pas, contacte ton vendeur.',
    },
    {
      icon: '📱',
      color: 'from-purple-500/20 to-purple-500/5',
      border: 'border-purple-500/30',
      accent: 'text-purple-400',
      title: '4 derniers chiffres WhatsApp',
      desc: 'Pour sécuriser l\'accès, on te demande les 4 derniers chiffres du numéro WhatsApp que tu as donné lors de l\'achat.',
      hint: 'Ex: si ton numéro finit par ...4782, tu saisis 4782.',
    },
    {
      icon: '✅',
      color: 'from-green-500/20 to-green-500/5',
      border: 'border-green-500/30',
      accent: 'text-green-400',
      title: 'Télécharge ton e-ticket',
      desc: 'Une fois ton QR affiché, télécharge ton e-ticket PDF. Il contient ton QR, ton nom, ta place et les infos du gala. Garde-le précieusement !',
      hint: 'Présente-le à l\'entrée le soir du gala.',
    },
  ];

  function closeOnboarding() {
    localStorage.setItem('galatrace-qr-onboarding', 'done');
    setShowOnboarding(false);
  }

  function nextStep() {
    if (onboardingStep < ONBOARDING_STEPS.length - 1) {
      setOnboardingStep(s => s + 1);
    } else {
      closeOnboarding();
    }
  }

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

    const digits = phoneLastFour.replace(/\D/g, '');
    if (digits.length !== 4) {
      toast.error('Saisissez les 4 derniers chiffres de votre numéro WhatsApp.');
      return;
    }

    setSubmitting(true);
    setResult(null);
    setNotPaid(null);
    setNotFound(false);
    setQrDataUrl('');

    try {
      const { data, error } = await supabase.rpc('public_get_ticket_qr', {
        p_ticket_type_id: selectedTicketType,
        p_ticket_number: ticketNumber.trim(),
        p_phone_last_four: digits,
      });

      if (error) throw error;

      const payload = (data || {}) as TicketQrRpcResponse;

      // Cas ticket non payé — on affiche le panneau "clash"
      if (payload.error === 'not_paid') {
        setNotPaid({
          buyer_name: payload.buyer_name ?? '',
          final_price: payload.final_price ?? 0,
          total_paid: payload.total_paid ?? 0,
          remaining: payload.remaining ?? 0,
        });
        // On vide l'éventuel résultat précédent
        setResult(null);
        setQrDataUrl('');
        return;
      }

      if (payload.error) {
        // Tous les cas d'erreur → panneau dans la card, pas de toast
        setNotFound(true);
        return;
      }

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
        table_name: (payload as any).table_name ?? undefined,
        seat_number: (payload as any).seat_number ?? undefined,
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
      setNotFound(true);
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

  async function downloadPdf() {
    if (!result || !qrDataUrl) return;
    setGeneratingPdf(true);
    try {
      await generateTicketPdf({
        buyer_name:     result.buyer_name,
        ticket_type_id: result.ticket_type_id,
        ticket_number:  result.ticket_number,
        qr_issued_at:   result.qr_issued_at,
        qrDataUrl,
        table_name:     result.table_name,
        seat_number:    result.seat_number,
      });
      toast.success('E-ticket PDF téléchargé.');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la génération du PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6 lg:py-12">

      {/* ── Modal Onboarding ── */}
      {showOnboarding && (() => {
        const step = ONBOARDING_STEPS[onboardingStep];
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className={`w-full max-w-sm rounded-2xl border ${step.border} bg-gradient-to-b ${step.color} bg-zinc-950 shadow-2xl overflow-hidden`}>

              {/* Barre de progression */}
              <div className="flex gap-1 p-4 pb-0">
                {ONBOARDING_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= onboardingStep ? step.accent.replace('text-', 'bg-') : 'bg-zinc-800'}`}
                  />
                ))}
              </div>

              {/* Contenu */}
              <div className="p-6 space-y-4">
                <div className="text-5xl text-center">{step.icon}</div>
                <div className="text-center space-y-2">
                  <h3 className={`text-xl font-black ${step.accent}`}>{step.title}</h3>
                  <p className="text-sm text-zinc-300 leading-relaxed">{step.desc}</p>
                </div>

                {/* Hint */}
                <div className={`rounded-lg border ${step.border} bg-zinc-900/60 px-3 py-2 text-center`}>
                  <p className={`text-xs font-medium ${step.accent}`}>💡 {step.hint}</p>
                </div>

                {/* Boutons */}
                <div className="flex gap-3 pt-1">
                  {onboardingStep > 0 && (
                    <button
                      onClick={() => setOnboardingStep(s => s - 1)}
                      className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
                    >
                      ← Précédent
                    </button>
                  )}
                  <button
                    onClick={nextStep}
                    className={`flex-1 rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-95
                      ${onboardingStep === ONBOARDING_STEPS.length - 1
                        ? 'bg-green-600 hover:bg-green-500'
                        : 'bg-amber-600 hover:bg-amber-500'}`}
                  >
                    {onboardingStep === ONBOARDING_STEPS.length - 1 ? "C'est parti !" : 'Suivant →'}
                  </button>
                </div>

                {/* Passer */}
                <button
                  onClick={closeOnboarding}
                  className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
                >
                  Passer le guide
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-400">
          🎟️ GalaTrace
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
          Mon QR d'entrée
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Renseigne les informations de ton ticket pour récupérer ton QR et l'imprimer.
        </p>
        <button
          onClick={() => { setOnboardingStep(0); setShowOnboarding(true); }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
        >
          <span className="text-sm">?</span> Voir le guide
        </button>
      </div>

      {/* ── Guide 3 étapes ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-2">
        {[
          {
            num: '1',
            icon: '🎟️',
            title: 'Ton type de ticket',
            desc: 'Choisis le type de ticket que tu as acheté (Gold, Diamond, Platinum, Royal…)',
          },
          {
            num: '2',
            icon: '🔢',
            title: 'Ton numéro de ticket',
            desc: 'C\'est le numéro inscrit sur ton ticket physique ou communiqué par ton vendeur. Ex: D022',
          },
          {
            num: '3',
            icon: '📱',
            title: '4 derniers chiffres WhatsApp',
            desc: 'Les 4 derniers chiffres du numéro WhatsApp enregistré lors de ton achat. Ex: 4782',
          },
        ].map((step) => (
          <div key={step.num} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-black text-amber-400">
              {step.num}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">{step.icon} {step.title}</p>
              <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Guide 3 étapes ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-2">
        {[
          {
            num: '1',
            icon: '🎟️',
            title: 'Ton type de ticket',
            desc: 'Choisis le type de ticket que tu as acheté (Gold, Diamond, Platinum, Royal…)',
          },
          {
            num: '2',
            icon: '🔢',
            title: 'Ton numéro de ticket',
            desc: 'C\'est le numéro inscrit sur ton ticket physique ou communiqué par ton vendeur. Ex: D022',
          },
          {
            num: '3',
            icon: '📱',
            title: '4 derniers chiffres WhatsApp',
            desc: 'Les 4 derniers chiffres du numéro WhatsApp enregistré lors de ton achat. Ex: 4782',
          },
        ].map((step) => (
          <div key={step.num} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-black text-amber-400">
              {step.num}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">{step.icon} {step.title}</p>
              <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
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

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  4 derniers chiffres WhatsApp
                </label>
                <Input
                  value={phoneLastFour}
                  onChange={(e) => setPhoneLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Ex: 4782"
                  maxLength={4}
                  inputMode="numeric"
                  className="border-zinc-700 bg-zinc-900 text-zinc-100 tracking-widest"
                  disabled={submitting}
                  required
                />
                <p className="text-xs text-zinc-600">
                  Doit correspondre au numéro WhatsApp enregistré lors de l'achat.
                </p>
              </div>

              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loadingTypes || submitting}>
                {loadingTypes ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…</>
                ) : submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recherche en cours…</>
                ) : (
                  'Afficher mon QR'
                )}
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
            {/* ── Cas : ticket introuvable ── */}
            {notFound && !result && !notPaid && (
              <div className="flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-zinc-600/60 bg-zinc-900/80 px-6 py-8 text-center">
                <div className="text-5xl">❓</div>
                <h3 className="text-xl font-black uppercase tracking-wide text-zinc-300">
                  Ticket introuvable
                </h3>
                <p className="text-sm text-zinc-400 max-w-xs leading-relaxed">
                  Aucun ticket ne correspond à ces informations.<br/>
                  Vérifie le <span className="text-white font-semibold">type de ticket</span>, le <span className="text-white font-semibold">numéro</span> et les <span className="text-white font-semibold">4 derniers chiffres</span> de ton WhatsApp.
                </p>
                <p className="text-xs text-zinc-600 max-w-xs">
                  Si le problème persiste, contacte ton vendeur.
                </p>
              </div>
            )}

            {/* ── Cas : ticket non payé ── */}
            {notPaid && (
              <div className="flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-red-500/60 bg-red-950/40 px-6 py-8 text-center">
                <div className="text-5xl">🚫</div>
                <h3 className="text-xl font-black uppercase tracking-wide text-red-400">
                  Accès refusé
                </h3>
                <p className="text-sm font-semibold text-red-300">
                  {notPaid.buyer_name}, ton ticket <span className="text-white">n'est pas soldé.</span>
                </p>
                <div className="w-full rounded-lg border border-red-500/30 bg-red-900/30 p-4 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Prix total</span>
                    <span className="font-bold text-zinc-100">{notPaid.final_price.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Déjà payé</span>
                    <span className="font-bold text-amber-400">{notPaid.total_paid.toLocaleString()} F</span>
                  </div>
                  <div className="my-1 border-t border-red-500/20" />
                  <div className="flex justify-between">
                    <span className="text-zinc-300 font-semibold">Reste à payer</span>
                    <span className="text-xl font-black text-red-400">{notPaid.remaining.toLocaleString()} F</span>
                  </div>
                </div>
                <p className="text-xs text-red-400/80 font-medium leading-relaxed max-w-xs">
                  Aucun QR ne sera généré tant que le solde n'est pas réglé.<br />
                  Contacte ton vendeur pour régulariser avant le jour J.
                </p>
              </div>
            )}

            {/* ── Cas : pas encore cherché ── */}
            {!result && !notPaid && !notFound && (
              <div className="flex min-h-[380px] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-6 text-center text-sm text-zinc-500">
                Le QR apparaît ici après recherche du ticket.
              </div>
            )}

            {/* ── Cas : ticket trouvé et payé ── */}
            {result && qrDataUrl && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/20 px-3 py-2 text-sm text-green-300">
                  <span className="text-base">✅</span>
                  <span className="font-semibold">Ticket entièrement soldé — tu es prêt(e) pour le gala !</span>
                </div>
                <div className="flex justify-center rounded-xl border border-zinc-800 bg-white p-4">
                  <img src={qrDataUrl} alt="QR Ticket GalaTrace" className="h-64 w-64" />
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
                  <p><span className="text-zinc-500">Nom:</span> <span className="font-semibold text-zinc-100">{result.buyer_name}</span></p>
                  <p><span className="text-zinc-500">Ticket:</span> <span className="font-semibold text-zinc-100">{formatTicketType(result.ticket_type_id)}</span></p>
                  <p><span className="text-zinc-500">Numéro:</span> <span className="font-semibold text-zinc-100">{result.ticket_number}</span></p>

                  {/* Place assignée */}
                  {(result.table_name || result.seat_number) ? (
                    <div className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-0.5">📍 Ta place</p>
                      <p className="text-base font-black text-white">
                        {result.table_name
                          ? `Table ${result.table_name}${result.seat_number ? ` — Place nº${result.seat_number}` : ''}`
                          : `Place nº${result.seat_number}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600 italic">Place non encore assignée — renseigne-toi à l'entrée.</p>
                  )}
                </div>
                <Button onClick={downloadQr} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger le QR
                </Button>
                <Button
                  onClick={downloadPdf}
                  disabled={generatingPdf}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  {generatingPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Télécharger l'e-ticket PDF
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
