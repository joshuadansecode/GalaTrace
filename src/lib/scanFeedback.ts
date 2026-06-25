/**
 * Feedback sensoriel au scan QR (son + vibration)
 * - valid      → bip court aigu + vibration courte
 * - already_used / not_paid → bip grave double + vibration longue
 * - invalid / error → bip grave long + vibration triple
 */

type FeedbackType = 'valid' | 'warning' | 'error';

// ── Vibration ────────────────────────────────────────────────────────────────

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// ── Son via Web Audio API ─────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function beep(frequency: number, duration: number, gain = 0.4, delay = 0): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    if (!ctx) { resolve(); return; }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

    gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);

    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
    osc.onended = () => resolve();
  });
}

// ── API publique ──────────────────────────────────────────────────────────────

export async function playScanFeedback(type: FeedbackType): Promise<void> {
  switch (type) {
    case 'valid':
      // Bip aigu court → succès
      vibrate(80);
      await beep(1050, 0.12);
      break;

    case 'warning':
      // Double bip grave → attention (déjà utilisé, non payé)
      vibrate([120, 80, 120]);
      await beep(440, 0.15);
      await beep(340, 0.15, 0.4, 0.2);
      break;

    case 'error':
      // Bip grave long → rejet franc
      vibrate([200, 100, 200, 100, 200]);
      await beep(280, 0.4, 0.5);
      break;
  }
}
