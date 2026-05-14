import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Camera, CameraOff, CheckCircle2, Clock3, QrCode, ShieldAlert, XCircle } from 'lucide-react';
import { formatTicketType } from '../lib/utils';

type CheckinStatus = 'valid' | 'already_used' | 'invalid' | 'not_paid' | 'forbidden' | 'error';

type CheckinResponse = {
  status: CheckinStatus;
  error?: string;
  buyer_name?: string;
  ticket_type_id?: string;
  ticket_number?: string;
  checked_in_at?: string;
  used_at?: string;
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const scanCooldownMs = 2500;

const statusConfig: Record<CheckinStatus, { title: string; className: string; icon: React.ReactNode }> = {
  valid: {
    title: 'Accès autorisé',
    className: 'border-green-500/30 bg-green-500/10 text-green-300',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  already_used: {
    title: 'Ticket déjà utilisé',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    icon: <Clock3 className="h-4 w-4" />,
  },
  invalid: {
    title: 'QR invalide',
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
    icon: <XCircle className="h-4 w-4" />,
  },
  not_paid: {
    title: 'Ticket non éligible',
    className: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  forbidden: {
    title: 'Accès refusé',
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  error: {
    title: 'Erreur',
    className: 'border-zinc-700 bg-zinc-900 text-zinc-200',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
};

export default function TicketCheckInView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const checkingRef = useRef(false);
  const lastScanRef = useRef<{ value: string; ts: number }>({ value: '', ts: 0 });

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [lastPayload, setLastPayload] = useState('');

  const barcodeCtor = (typeof window !== 'undefined' ? (window as any).BarcodeDetector : undefined) as BarcodeDetectorCtor | undefined;
  const isNativeQrAvailable = Boolean(barcodeCtor);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }

  async function startCamera() {
    if (!isNativeQrAvailable) {
      setCameraError('Ce navigateur ne supporte pas le scan QR natif. Utilisez la saisie manuelle.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Caméra indisponible sur cet appareil.');
      return;
    }

    setCameraLoading(true);
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      streamRef.current = stream;
      detectorRef.current = new barcodeCtor!({ formats: ['qr_code'] });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current || checkingRef.current) return;

        try {
          const detections = await detectorRef.current.detect(videoRef.current);
          const code = detections[0]?.rawValue?.trim();
          if (!code) return;

          const now = Date.now();
          if (lastScanRef.current.value === code && now - lastScanRef.current.ts < scanCooldownMs) {
            return;
          }

          lastScanRef.current = { value: code, ts: now };
          await performCheckin(code);
        } catch {
          // Ignore frame-level detection errors
        }
      }, 700);

      setIsCameraActive(true);
    } catch (error: any) {
      setCameraError(error?.message || 'Impossible d’activer la caméra.');
      stopCamera();
    } finally {
      setCameraLoading(false);
    }
  }

  async function performCheckin(rawPayload: string) {
    checkingRef.current = true;
    setChecking(true);
    setResult(null);
    setLastPayload(rawPayload);

    try {
      const { data, error } = await supabase.rpc('checkin_ticket_qr', {
        p_qr_payload: rawPayload,
      });

      if (error) throw error;

      const payload = (data || { status: 'error', error: 'Réponse invalide.' }) as CheckinResponse;
      setResult(payload);

      if (payload.status === 'valid') {
        toast.success('Ticket validé. Accès autorisé.');
      } else if (payload.status === 'already_used') {
        toast.warning('Ce ticket a déjà été utilisé.');
      } else if (payload.status === 'not_paid') {
        toast.warning('Ticket non soldé ou non éligible.');
      } else if (payload.status === 'forbidden') {
        toast.error('Rôle non autorisé pour le contrôle QR.');
      } else {
        toast.error(payload.error || 'QR invalide.');
      }
    } catch (error: any) {
      const fallback: CheckinResponse = {
        status: 'error',
        error: error.message || 'Erreur lors du contrôle QR.',
      };
      setResult(fallback);
      toast.error(fallback.error);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = manualCode.trim();
    if (!payload) {
      toast.error('Saisissez un code QR ou un token.');
      return;
    }
    await performCheckin(payload);
  }

  const statusUi = result ? statusConfig[result.status] : null;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Contrôle d’accès QR</h2>
        <p className="text-zinc-400">Scannez le QR invité puis validez en temps réel l’entrée en salle.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4 text-amber-400" />
              Scan caméra
            </CardTitle>
            <CardDescription>Utilise la caméra arrière quand disponible (détection QR native navigateur).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
              <video ref={videoRef} className="h-[360px] w-full object-cover" muted playsInline />
              {!isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-sm text-zinc-400">
                  Caméra inactive
                </div>
              )}
              {isCameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-48 w-48 rounded-2xl border-2 border-amber-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!isCameraActive ? (
                <Button onClick={startCamera} disabled={cameraLoading || checking} className="bg-amber-600 hover:bg-amber-700">
                  {cameraLoading ? <Loader /> : <Camera className="mr-2 h-4 w-4" />}
                  Démarrer la caméra
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="outline" className="border-zinc-700 bg-zinc-900">
                  <CameraOff className="mr-2 h-4 w-4" />
                  Arrêter la caméra
                </Button>
              )}
              {!isNativeQrAvailable && (
                <span className="text-xs text-zinc-500">Scan natif non supporté sur ce navigateur.</span>
              )}
              {cameraError && <span className="text-xs text-red-400">{cameraError}</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-amber-400" />
              Vérification manuelle
            </CardTitle>
            <CardDescription>Collez le contenu du QR ou le token si la caméra n’est pas disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="GALATRACE:..."
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
              <Button type="submit" disabled={checking} className="w-full bg-amber-600 hover:bg-amber-700">
                Vérifier le ticket
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
        <CardHeader>
          <CardTitle className="text-base">Résultat du contrôle</CardTitle>
          <CardDescription>Affiche le dernier résultat de scan et les infos billet associées.</CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-300">Vérification en cours…</div>
          ) : !result ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-500">Aucun contrôle effectué pour le moment.</div>
          ) : (
            <div className={`space-y-3 rounded-lg border px-4 py-4 ${statusUi?.className || ''}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {statusUi?.icon}
                {statusUi?.title}
              </p>
              {result.error ? <p className="text-sm">{result.error}</p> : null}

              {(result.buyer_name || result.ticket_type_id || result.ticket_number) && (
                <div className="grid grid-cols-1 gap-1 text-sm">
                  {result.buyer_name ? <p><span className="text-zinc-400">Invité:</span> {result.buyer_name}</p> : null}
                  {result.ticket_type_id ? <p><span className="text-zinc-400">Type:</span> {formatTicketType(result.ticket_type_id)}</p> : null}
                  {result.ticket_number ? <p><span className="text-zinc-400">N° Ticket:</span> {result.ticket_number}</p> : null}
                  {result.checked_in_at ? <p><span className="text-zinc-400">Entrée:</span> {new Date(result.checked_in_at).toLocaleString('fr-FR')}</p> : null}
                  {result.used_at ? <p><span className="text-zinc-400">Déjà scanné:</span> {new Date(result.used_at).toLocaleString('fr-FR')}</p> : null}
                </div>
              )}

              {lastPayload ? (
                <p className="truncate text-xs text-zinc-500">
                  Payload: {lastPayload}
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Loader() {
  return <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />;
}
