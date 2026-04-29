import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from './ui/card';
import { Wallet, TrendingDown, ArrowDownRight } from 'lucide-react';

type FinancialSummary = {
  totalEncaisse: number;
  totalDepensesActees: number;
  pendingExpensePaymentChanges: number;
};

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
          .filter((expense: any) => expense.payment_status === 'reglee' && expense.validation_status === 'validee')
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-5 h-5 text-green-500" />
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Fonds Encaissés</span>
          </div>
          <p className="text-2xl font-bold text-green-500">
            {loading ? '…' : `${summary.totalEncaisse.toLocaleString()} F`}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Dépenses Actées</span>
          </div>
          <p className="text-2xl font-bold text-red-400">
            {loading ? '…' : `${summary.totalDepensesActees.toLocaleString()} F`}
          </p>
          <p className="text-xs text-zinc-600 mt-1">Réglées + validées uniquement</p>
        </CardContent>
      </Card>

      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-2">
            <ArrowDownRight className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Reste en Caisse</span>
          </div>
          <p className="text-2xl font-bold text-amber-500">
            {loading ? '…' : `${(summary.totalEncaisse - summary.totalDepensesActees).toLocaleString()} F`}
          </p>
          {summary.pendingExpensePaymentChanges > 0 && !loading && (
            <p className="text-xs text-zinc-300 mt-1">
              {summary.pendingExpensePaymentChanges} changement(s) de règlement en attente de double validation
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
