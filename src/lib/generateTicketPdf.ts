import { jsPDF } from 'jspdf';
import { formatTicketType } from './utils';

export interface TicketPdfData {
  buyer_name:     string;
  ticket_type_id: string;
  ticket_number:  string;
  qr_issued_at:   string | null;
  qrDataUrl:      string;
  table_name?:    string;
  seat_number?:   number;
}

// ─── Thèmes ───────────────────────────────────────────────────────────────────
const THEMES: Record<string, {
  bg:      [number,number,number];
  bgRight: [number,number,number];
  accent:  [number,number,number];
  band:    [number,number,number];
  label:   string;
}> = {
  gold_interne:     { bg:[18,14,5],  bgRight:[24,18,6],  accent:[212,165,30], band:[212,165,30], label:'GOLD'     },
  gold_externe:     { bg:[18,14,5],  bgRight:[24,18,6],  accent:[212,165,30], band:[212,165,30], label:'GOLD'     },
  platinum_interne: { bg:[10,14,20], bgRight:[14,18,26], accent:[160,175,190],band:[140,155,170],label:'PLATINUM' },
  diamond_interne:  { bg:[5,12,22],  bgRight:[8,16,28],  accent:[40,180,245], band:[40,180,245], label:'DIAMOND'  },
  diamond_externe:  { bg:[5,12,22],  bgRight:[8,16,28],  accent:[40,180,245], band:[40,180,245], label:'DIAMOND'  },
  royal:            { bg:[12,5,22],  bgRight:[16,8,28],  accent:[170,90,250], band:[170,90,250], label:'ROYAL'    },
};
const DEFAULT_THEME = {
  bg:     [12,12,18] as [number,number,number],
  bgRight:[16,16,24] as [number,number,number],
  accent: [212,165,30] as [number,number,number],
  band:   [212,165,30] as [number,number,number],
  label: 'TICKET',
};

export async function generateTicketPdf(ticket: TicketPdfData): Promise<void> {
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a5' });
  const W = 210, H = 148;
  const t = THEMES[ticket.ticket_type_id] ?? DEFAULT_THEME;
  const LX = 12;

  // ── Fonds ──────────────────────────────────────────────────────
  doc.setFillColor(...t.bg);
  doc.rect(0, 0, 138, H, 'F');
  doc.setFillColor(...t.bgRight);
  doc.rect(138, 0, W - 138, H, 'F');

  // ── Bande accent gauche ────────────────────────────────────────
  doc.setFillColor(...t.band);
  doc.rect(0, 0, 4, H, 'F');

  // ── Ligne séparation pointillée ────────────────────────────────
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 2.5], 0);
  doc.line(138, 10, 138, H - 10);
  doc.setLineDashPattern([], 0);

  // ── En-tête : nom événement (sans logo) ───────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...t.accent);
  doc.text('NUIT DES DISTINGUES 2026', LX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(150, 150, 150);
  doc.text('INSTITUT UNIVERSITAIRE LES COURS SONOU', LX, 19.5);

  // ── Ligne déco ─────────────────────────────────────────────────
  doc.setDrawColor(...t.accent);
  doc.setLineWidth(0.5);
  doc.line(LX, 24, 132, 24);
  doc.setFillColor(...t.accent);
  doc.rect(LX, 22.5, 3, 3, 'F');

  // ── Badge catégorie ────────────────────────────────────────────
  doc.setFillColor(...t.accent);
  doc.roundedRect(LX, 28, 40, 7.5, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...t.bg);
  doc.text(`BILLET ${t.label}`, LX + 4, 33.5);

  // ── Nom invité ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text("NOM DE L'INVITE", LX, 46);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  const name = doc.splitTextToSize(ticket.buyer_name.toUpperCase(), 120);
  doc.text(name[0], LX, 55);

  // ── Type ticket ────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('TYPE DE TICKET', LX, 66);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...t.accent);
  doc.text(formatTicketType(ticket.ticket_type_id).toUpperCase(), LX, 74);

  // ── Ligne fine ─────────────────────────────────────────────────
  doc.setDrawColor(45, 45, 55);
  doc.setLineWidth(0.3);
  doc.line(LX, 79, 132, 79);

  // ── N° ticket + place ──────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('N° TICKET', LX, 87);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(ticket.ticket_number, LX, 95);

  const seatLabel = ticket.table_name
    ? `Table ${ticket.table_name}${ticket.seat_number ? `  Pl. ${ticket.seat_number}` : ''}`
    : ticket.seat_number ? `Place ${ticket.seat_number}` : null;

  if (seatLabel) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text('PLACE ASSIGNEE', LX + 40, 87);
    doc.setDrawColor(...t.accent);
    doc.setLineWidth(0.5);
    doc.roundedRect(LX + 40, 89, 72, 8, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...t.accent);
    doc.text(seatLabel, LX + 44, 94.5);
  }

  // ── Lieu + Heure ───────────────────────────────────────────────
  const infoY = 108;
  doc.setFillColor(30, 30, 40);
  doc.roundedRect(LX, infoY, 56, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...t.accent);
  doc.text('LIEU', LX + 3, infoY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220);
  doc.text('QUEEN PALACE', LX + 14, infoY + 4.5);

  doc.setFillColor(30, 30, 40);
  doc.roundedRect(LX + 60, infoY, 36, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...t.accent);
  doc.text('HEURE', LX + 63, infoY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220);
  doc.text('19H00', LX + 79, infoY + 4.5);

  // ── Mention légale ─────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(55, 55, 65);
  doc.text('Billet strictement personnel et non cessible. Toute reproduction est interdite.', LX, H - 5);

  // ── QR (zone droite) ───────────────────────────────────────────
  const RX   = 142;
  const RW   = W - RX - 4;
  const qrSz = Math.min(RW - 4, 60);
  const qrX  = RX + (RW - qrSz) / 2;
  const qrY  = 14;

  doc.setFillColor(20, 20, 30);
  doc.roundedRect(qrX - 2, qrY - 2, qrSz + 8, qrSz + 8, 3, 3, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX - 1, qrY - 1, qrSz + 2, qrSz + 2, 2, 2, 'F');

  try {
    doc.addImage(ticket.qrDataUrl, 'PNG', qrX, qrY, qrSz, qrSz);
  } catch {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('QR indisponible', qrX + qrSz / 2, qrY + qrSz / 2, { align:'center' });
  }

  const qrCX = qrX + qrSz / 2;
  doc.setDrawColor(...t.accent);
  doc.setLineWidth(0.4);
  doc.line(qrX, qrY + qrSz + 5, qrX + qrSz, qrY + qrSz + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...t.accent);
  doc.text("SCANNER A L'ENTREE", qrCX, qrY + qrSz + 10, { align:'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(160, 160, 160);
  doc.text(ticket.ticket_number, qrCX, qrY + qrSz + 16, { align:'center' });

  doc.save(`galatrace-ticket-${ticket.ticket_type_id}-${ticket.ticket_number}.pdf`);
}
