import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Camera, CameraOff, CheckCircle2, Clock3, QrCode, ShieldAlert, XCircle } from 'lucide-react';
import { formatTicketType } from '../lib/utils';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { playScanFeedback } from '../lib/scanFeedback';
import {
  loadOfflineCache,
  checkinOffline,
  syncPendingCheckins,
  getPendingCount,
  getCacheSize,
} from '../lib/offlineCheckin';

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckinStatus = 'valid' | 'already_used' | 'invalid' | 'not_paid' | 'forbidden' | 'error';

type CheckinResponse = {
  status: CheckinStatus;
  error?: string;
  buyer_name?: string;
  ticket_type_id?: string;
  ticket_number?: string;
  checked_in_at?: string;
  used_at?: string;
  // Place assignée
  table_name?: string;
  seat_number?: number;
  // Agent du premier scan (cas already_used)
  scanner_name?: string;
};

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

// ─── Constantes ───────────────────────────────────────────────────────────────

const SCAN_COOLDOWN_MS = 2500;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNativeBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as any).BarcodeDetector as BarcodeDetectorCtor | undefined;
  return ctor ?? null;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TicketCheckInView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Refs scan natif (BarcodeDetector)
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const nativeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);

  // Ref scan ZXing (fallback)
  const zxingControlsRef = useRef<IScannerControls | null>(null);

  // Cooldown commun aux deux moteurs
  const checkingRef = useRef(false);
  const lastScanRef = useRef<{ value: string; ts: number }>({ value: '', ts: 0 });

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanEngine, setScanEngine] = useState<'native' | 'zxing' | null>(null);

  const [manualCode, setManualCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [lastPayload, setLastPayload] = useState('');

  // Cooldown visuel : 0 = prêt, 100 = vient de scanner
  const [cooldownPct, setCooldownPct] = useState(0);
  const cooldownRafRef = useRef<number | null>(null);

  // Offline
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [cacheSize, setCacheSize] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cacheLoading, setCacheLoading] = useState(false);

  // Auto-effacement du résultat
  const [resultSecondsLeft, setResultSecondsLeft] = useState(0);
  const resultTimerRef = useRef<number | null>(null);
  const resultRafRef   = useRef<number | null>(null);
  const RESULT_DISPLAY_MS = 6000; // 6 secondes

  useEffect(() => {
    return () => {
      stopCamera();
      if (cooldownRafRef.current) cancelAnimationFrame(cooldownRafRef.current);
      if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
      if (resultRafRef.current)   cancelAnimationFrame(resultRafRef.current);
    };
  }, []);

  // ── Countdown auto-effacement ───────────────────────────────────────────────
  function startResultTimer() {
    // Annuler tout timer précédent
    if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
    if (resultRafRef.current)   cancelAnimationFrame(resultRafRef.current);

    setResultSecondsLeft(Math.ceil(RESULT_DISPLAY_MS / 1000));

    // Décompte en secondes via rAF
    const startTs = performance.now();
    function tick(now: number) {
      const elapsed  = now - startTs;
      const remaining = Math.max(0, RESULT_DISPLAY_MS - elapsed);
      setResultSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining > 0) {
        resultRafRef.current = requestAnimationFrame(tick);
      }
    }
    resultRafRef.current = requestAnimationFrame(tick);

    // Effacement du résultat
    resultTimerRef.current = window.setTimeout(() => {
      setResult(null);
      setLastPayload('');
      setResultSecondsLeft(0);
    }, RESULT_DISPLAY_MS);
  }

  // ── Chargement du cache offline + listeners réseau ──────────────────────────
  useEffect(() => {
    initOfflineCache();

    function handleOnline() {
      setIsOnline(true);
      // Dès que le réseau revient, on sync les entrées en attente
      syncPendingCheckins().then(({ synced, failed }) => {
        setPendingCount(getPendingCount());
        if (synced > 0) toast.success(`${synced} entrée(s) synchronisée(s) avec le serveur.`);
        if (failed > 0)  toast.warning(`${failed} entrée(s) non synchronisée(s) — réessai au prochain retour réseau.`);
      });
    }
    function handleOffline() { setIsOnline(false); }

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function initOfflineCache() {
    setCacheLoading(true);
    try {
      const { count, fromNetwork } = await loadOfflineCache();
      setCacheSize(count);
      setPendingCount(getPendingCount());
      if (!fromNetwork) {
        toast.warning(`Hors ligne — cache local chargé (${count} tickets).`);
      }
    } catch {
      toast.error('Impossible de charger le cache offline.');
    } finally {
      setCacheLoading(false);
    }
  }

  // ── Arrêt caméra (commun aux deux moteurs) ──────────────────────────────────
  function stopCamera() {
    // Arrêt scan natif
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Arrêt ZXing
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch { /* ignoré */ }
      zxingControlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    nativeDetectorRef.current = null;
    setIsCameraActive(false);
    setScanEngine(null);
  }

  // ── Démarrage caméra : essaie natif, sinon ZXing ────────────────────────────
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Caméra indisponible sur cet appareil.');
      return;
    }

    setCameraLoading(true);
    setCameraError('');

    const nativeCtor = getNativeBarcodeDetector();

    if (nativeCtor) {
      await startNativeScanner(nativeCtor);
    } else {
      await startZxingScanner();
    }

    setCameraLoading(false);
  }

  // ── Moteur 1 : BarcodeDetector natif (Chrome, Edge, Android) ────────────────
  async function startNativeScanner(ctor: BarcodeDetectorCtor) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      nativeDetectorRef.current = new ctor({ formats: ['qr_code'] });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !nativeDetectorRef.current || checkingRef.current) return;
        try {
          const detections = await nativeDetectorRef.current.detect(videoRef.current);
          const code = detections[0]?.rawValue?.trim();
          if (!code) return;
          throttledCheckin(code);
        } catch { /* erreur de frame, on ignore */ }
      }, 700);

      setScanEngine('native');
      setIsCameraActive(true);
    } catch (err: any) {
      // BarcodeDetector a échoué → on tente ZXing
      cleanupNativeRefs();
      await startZxingScanner();
    }
  }

  function cleanupNativeRefs() {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    nativeDetectorRef.current = null;
  }

  // ── Moteur 2 : ZXing (Safari iOS, Firefox, tout le reste) ───────────────────
  async function startZxingScanner() {
    try {
      const reader = new BrowserQRCodeReader();

      if (!videoRef.current) throw new Error('Élément vidéo introuvable.');

      // ZXing gère lui-même l'accès caméra et le flux
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        videoRef.current,
        (result, error) => {
          if (!result) return;
          const code = result.getText().trim();
          if (!code) return;
          throttledCheckin(code);
        }
      );

      zxingControlsRef.current = controls;
      setScanEngine('zxing');
      setIsCameraActive(true);
    } catch (err: any) {
      setCameraError(err?.message || 'Impossible d\'activer la caméra.');
      stopCamera();
    }
  }

  // ── Cooldown commun ──────────────────────────────────────────────────────────
  function throttledCheckin(code: string) {
    if (checkingRef.current) return;
    const now = Date.now();
    if (lastScanRef.current.value === code && now - lastScanRef.current.ts < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = { value: code, ts: now };
    startCooldownBar();
    performCheckin(code);
  }

  function startCooldownBar() {
    if (cooldownRafRef.current) cancelAnimationFrame(cooldownRafRef.current);
    const start = performance.now();
    setCooldownPct(100);

    function tick(now: number) {
      const elapsed = now - start;
      const remaining = Math.max(0, 100 - (elapsed / SCAN_COOLDOWN_MS) * 100);
      setCooldownPct(remaining);
      if (remaining > 0) {
        cooldownRafRef.current = requestAnimationFrame(tick);
      }
    }
    cooldownRafRef.current = requestAnimationFrame(tick);
  }

  // ── Appel Supabase ───────────────────────────────────────────────────────────
  async function performCheckin(rawPayload: string) {
    checkingRef.current = true;
    setChecking(true);
    setResult(null);
    setLastPayload(rawPayload);

    // ── Mode hors ligne ──
    if (!navigator.onLine) {
      const offlineResult = checkinOffline(rawPayload);
      setPendingCount(getPendingCount());

      if (offlineResult.status === 'not_in_cache') {
        const r: CheckinResponse = { status: 'invalid', error: 'Token inconnu dans le cache local.' };
        setResult(r); startResultTimer();
        toast.error('QR introuvable (hors ligne).');
        playScanFeedback('error');
      } else if (offlineResult.status === 'invalid') {
        const r: CheckinResponse = { status: 'invalid', error: 'QR invalide.' };
        setResult(r); startResultTimer();
        toast.error('QR invalide.');
        playScanFeedback('error');
      } else if (offlineResult.status === 'already_used') {
        const r: CheckinResponse = {
          status: 'already_used',
          buyer_name:     offlineResult.buyer_name,
          ticket_type_id: offlineResult.ticket_type_id,
          ticket_number:  offlineResult.ticket_number,
          used_at:        offlineResult.used_at,
          error: 'Ticket déjà utilisé',
        };
        setResult(r); startResultTimer();
        toast.warning('Ce ticket a déjà été utilisé.');
        playScanFeedback('warning');
      } else {
        // valid
        const r: CheckinResponse = {
          status: 'valid',
          buyer_name:     offlineResult.buyer_name,
          ticket_type_id: offlineResult.ticket_type_id,
          ticket_number:  offlineResult.ticket_number,
          checked_in_at:  offlineResult.checked_in_at,
        };
        setResult(r); startResultTimer();
        toast.success('✅ Accès autorisé (hors ligne — sera synchronisé).');
        playScanFeedback('valid');
      }

      checkingRef.current = false;
      setChecking(false);
      return;    }

    // ── Mode en ligne (comportement normal) ──
    try {
      const { data, error } = await supabase.rpc('checkin_ticket_qr', {
        p_qr_payload: rawPayload,
      });

      if (error) throw error;

      const payload = (data || { status: 'error', error: 'Réponse invalide.' }) as CheckinResponse;
      setResult(payload);
      startResultTimer();

      if (payload.status === 'valid') {
        toast.success('Ticket validé. Accès autorisé.');
        playScanFeedback('valid');
      } else if (payload.status === 'already_used') {
        toast.warning('Ce ticket a déjà été utilisé.');
        playScanFeedback('warning');
      } else if (payload.status === 'not_paid') {
        toast.warning('Ticket non soldé ou non éligible.');
        playScanFeedback('warning');
      } else if (payload.status === 'forbidden') {
        toast.error('Rôle non autorisé pour le contrôle QR.');
        playScanFeedback('error');
      } else {
        toast.error(payload.error || 'QR invalide.');
        playScanFeedback('error');
      }
    } catch (err: any) {
      const fallback: CheckinResponse = {
        status: 'error',
        error: err.message || 'Erreur lors du contrôle QR.',
      };
      setResult(fallback);
      startResultTimer();
      toast.error(fallback.error);
      playScanFeedback('error');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = manualCode.trim();
    if (!payload) { toast.error('Saisissez un code QR ou un token.'); return; }
    await performCheckin(payload);
  }

  const statusUi = result ? statusConfig[result.status] : null;

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Contrôle d'accès QR</h2>
        <p className="text-zinc-400">Scannez le QR invité puis validez en temps réel l'entrée en salle.</p>
      </header>

      {/* ── Bannière statut réseau + cache ── */}
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm ${
        isOnline
          ? 'border-green-500/20 bg-green-500/5 text-green-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
          <span className="font-medium">
            {isOnline ? 'En ligne' : 'Hors ligne — mode local actif'}
          </span>
          {cacheLoading && <span className="text-xs opacity-60">Chargement du cache…</span>}
          {!cacheLoading && (
            <span className="text-xs opacity-60">
              {cacheSize} ticket{cacheSize !== 1 ? 's' : ''} en cache
            </span>
          )}
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
            {pendingCount} entrée{pendingCount !== 1 ? 's' : ''} en attente de sync
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* ── Scan caméra ── */}
        <Card className="xl:col-span-2 border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4 text-amber-400" />
              Scan caméra
            </CardTitle>
            <CardDescription>
              {scanEngine === 'native' && 'Moteur natif navigateur actif.'}
              {scanEngine === 'zxing' && 'Moteur ZXing actif (compatible Safari / Firefox).'}
              {!scanEngine && 'Compatible tous navigateurs — Safari, Firefox, Chrome, Android.'}
            </CardDescription>
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
              {/* Barre de cooldown — visible uniquement pendant le cooldown */}
              {isCameraActive && cooldownPct > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                  <div
                    className="h-full bg-amber-400 transition-none"
                    style={{ width: `${cooldownPct}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!isCameraActive ? (
                <Button
                  onClick={startCamera}
                  disabled={cameraLoading || checking}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {cameraLoading ? <Spinner /> : <Camera className="mr-2 h-4 w-4" />}
                  Démarrer la caméra
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="outline" className="border-zinc-700 bg-zinc-900">
                  <CameraOff className="mr-2 h-4 w-4" />
                  Arrêter la caméra
                </Button>
              )}
              {cameraError && <span className="text-xs text-red-400">{cameraError}</span>}
            </div>
          </CardContent>
        </Card>

        {/* ── Vérification manuelle ── */}
        <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-amber-400" />
              Vérification manuelle
            </CardTitle>
            <CardDescription>Collez le contenu du QR ou le token si la caméra n'est pas disponible.</CardDescription>
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

      {/* ── Résultat ── */}
      <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Résultat du contrôle</span>
            {result && resultSecondsLeft > 0 && (
              <span className="text-xs font-normal text-zinc-500">
                Effacement dans {resultSecondsLeft}s
              </span>
            )}
          </CardTitle>
          <CardDescription>Affiche le dernier résultat de scan et les infos billet associées.</CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-300">
              Vérification en cours…
            </div>
          ) : !result ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-500">
              Aucun contrôle effectué pour le moment.
            </div>
          ) : (
            <div className={`space-y-3 rounded-lg border px-4 py-4 ${statusUi?.className || ''}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {statusUi?.icon}
                {statusUi?.title}
              </p>
              {result.error && <p className="text-sm">{result.error}</p>}

              {(result.buyer_name || result.ticket_type_id || result.ticket_number) && (
                <div className="grid grid-cols-1 gap-1 text-sm">
                  {result.buyer_name && (
                    <p><span className="text-zinc-400">Invité:</span> {result.buyer_name}</p>
                  )}
                  {result.ticket_type_id && (
                    <p><span className="text-zinc-400">Type:</span> {formatTicketType(result.ticket_type_id)}</p>
                  )}
                  {result.ticket_number && (
                    <p><span className="text-zinc-400">N° Ticket:</span> {result.ticket_number}</p>
                  )}

                  {/* ── Place assignée ── */}
                  {(result.table_name || result.seat_number) && (
                    <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                        📍 Place assignée
                      </p>
                      <p className="text-base font-bold text-white">
                        {result.table_name
                          ? `Table ${result.table_name}${result.seat_number ? ` — Place ${result.seat_number}` : ''}`
                          : `Place ${result.seat_number}`}
                      </p>
                    </div>
                  )}
                  {!result.table_name && !result.seat_number && result.status === 'valid' && (
                    <p className="text-xs text-zinc-500 italic mt-1">Aucune place assignée pour ce ticket.</p>
                  )}

                  {result.checked_in_at && (
                    <p className="mt-1"><span className="text-zinc-400">Entrée:</span> {new Date(result.checked_in_at).toLocaleString('fr-FR')}</p>
                  )}

                  {/* ── Cas already_used : infos pour débusquer l'intrus ── */}
                  {result.status === 'already_used' && (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
                        ⚠️ Déjà scanné — Infos du premier passage
                      </p>
                      {result.used_at && (
                        <p className="text-sm">
                          <span className="text-zinc-400">Heure du 1er scan:</span>{' '}
                          <span className="font-bold text-amber-300">
                            {new Date(result.used_at).toLocaleString('fr-FR')}
                          </span>
                        </p>
                      )}
                      {result.scanner_name && (
                        <p className="text-sm">
                          <span className="text-zinc-400">Scanné par:</span>{' '}
                          <span className="font-bold text-amber-300">{result.scanner_name}</span>
                        </p>
                      )}
                      {(result.table_name || result.seat_number) && (
                        <p className="text-sm">
                          <span className="text-zinc-400">Place:</span>{' '}
                          <span className="font-bold text-amber-300">
                            {result.table_name
                              ? `Table ${result.table_name}${result.seat_number ? ` — Place ${result.seat_number}` : ''}`
                              : `Place ${result.seat_number}`}
                          </span>
                          <span className="ml-2 text-xs text-zinc-500">→ aller vérifier sur place</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {lastPayload && (
                <p className="truncate text-xs text-zinc-500">Payload: {lastPayload}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Spinner() {
  return (
    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
  );
}
