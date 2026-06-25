import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from './ui/card';
import { Wallet, TrendingDown, ArrowDownRight } from 'lucide-react';

type FinancialSummary = {
  totalEncaisse: number;
  totalDepensesActees: number;
  pendingExpensePaymentChanges: number;
};

const normalizeStatus = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// Dépense actée = validée par la comptable ET marquée comme réglée
const isExpenseActee = (expense: any) =>
  normalizeStatus(expense.payment_status) === 'reglee' &&
  normalizeStatus(expense.validation_status) === 'validee';

const initialSummary: FinancialSummary = {
  totalEncaisse: 0,
  totalDepensesActees: 0,
  pendingExpensePaymentChanges: 0,
};

export default function FinancialSummaryCards() {
  const [summary, setSummary] = useState<FinancialSummary>(initialSummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchSummary() {
      setLoading(true);
      try {
        const [paymentsRes, expensesRes] = await Promise.all([
          supabase.from('payments').select('amount'),
          supabase.from('expenses').select('amount, payment_status, validation_status, payment_status_pending, payment_status_requested_by'),
        ]);

        if (!active) return;

        const totalEncaisse = (paymentsRes.data || []).reduce((acc: number, payment: any) => acc + (payment.amount || 0), 0);
        const totalDepensesActees = (expensesRes.data || [])
          .filter(isExpenseActee)
          .reduce((acc: number, expense: any) => acc + (expense.amount || 0), 0);
        const pendingExpensePaymentChanges = (expensesRes.data || [])
          .filter((expense: any) => expense.payment_status_pending && expense.payment_status_requested_by)
          .length;

        setSummary({ totalEncaisse, totalDepensesActees, pendingExpensePaymentChanges });
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSummary();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-500/20 bg-green-500/10 text-green-400">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Fonds encaissés</span>
            </div>
            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-green-400">
              Entrées
            </span>
          </div>
          <p className="text-3xl font-bold text-green-400">
            {loading ? '…' : `${summary.totalEncaisse.toLocaleString()} F`}
          </p>
          <p className="mt-2 text-xs text-zinc-500">Somme cumulée des encaissements</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/90 shadow-sm shadow-black/10">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400">
                <TrendingDown className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Dépenses actées</span>
            </div>
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
              Sorties
            </span>
          </div>
          <p className="text-3xl font-bold text-red-400">
            {loading ? '…' : `${summary.totalDepensesActees.toLocaleString()} F`}
          </p>
          <p className="mt-2 text-xs text-zinc-500">Dépenses enregistrées comme réglées</p>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/10 shadow-sm shadow-amber-950/20">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/15 text-amber-400">
                <ArrowDownRight className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Reste en caisse</span>
            </div>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              Solde
            </span>
          </div>
          <p className="text-3xl font-bold text-amber-400">
            {loading ? '…' : `${(summary.totalEncaisse - summary.totalDepensesActees).toLocaleString()} F`}
          </p>
          {summary.pendingExpensePaymentChanges > 0 && !loading ? (
            <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
              {summary.pendingExpensePaymentChanges} changement(s) de règlement en attente de double validation
            </p>
          ) : (
            <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-400">Solde disponible après dépenses actées</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
