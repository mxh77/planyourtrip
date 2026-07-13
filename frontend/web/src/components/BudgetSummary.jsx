import React, { useMemo, useState } from 'react';

function formatPrice(amount, currency) {
  if (amount == null || isNaN(amount) || amount === 0) return null;
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0 });
}

function nbNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const diff = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  return diff > 0 ? diff : null;
}

/**
 * Panneau de résumé budgétaire du roadtrip.
 * Peut être affiché en version compacte (inline) ou complète.
 */
export default function BudgetSummary({ steps, compact = false }) {
  const [open, setOpen] = useState(!compact);

  const stepBudgets = useMemo(() => {
    return steps.map((step) => {
      let accomTotal = 0;
      let accomNights = 0;
      let activityTotal = 0;
      const currency = step.accommodations?.[0]?.currency ||
        step.activities?.[0]?.currency || 'EUR';

      (step.accommodations ?? []).forEach((a) => {
        const nights = nbNights(a.checkIn, a.checkOut) ?? 0;
        const price = parseFloat(a.pricePerNight);
        if (!isNaN(price) && nights > 0) {
          accomTotal += price * nights;
          accomNights += nights;
        }
      });
      (step.activities ?? []).forEach((act) => {
        const c = parseFloat(act.cost);
        if (!isNaN(c) && c > 0) activityTotal += c;
      });

      return {
        stepId: step.id,
        stepName: step.name,
        accomTotal,
        accomNights,
        activityTotal,
        total: accomTotal + activityTotal,
        currency,
      };
    });
  }, [steps]);

  const grand = useMemo(() => {
    let accom = 0; let activity = 0; let nights = 0; let currency = 'EUR';
    stepBudgets.forEach((b) => {
      accom += b.accomTotal;
      activity += b.activityTotal;
      nights += b.accomNights;
      currency = b.currency;
    });
    return { accom, activity, nights, total: accom + activity, currency };
  }, [stepBudgets]);

  if (compact) {
    return (
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <span className="font-semibold text-gray-800 text-sm">Budget estimé</span>
          </div>
          <div className="flex items-center gap-3">
            {grand.total > 0 && (
              <span className="font-bold text-indigo-700">
                {formatPrice(grand.total, grand.currency)}
              </span>
            )}
            <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
          </div>
        </button>

        {open && (
          <div className="mt-3 space-y-1 border-t border-indigo-100 pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
              <span>🏨 Hébergement</span>
              <span className="text-right font-medium">
                {grand.accom > 0 ? formatPrice(grand.accom, grand.currency) : '—'}
                {grand.nights > 0 && <span className="text-gray-400 ml-1">({grand.nights} nuits)</span>}
              </span>
              <span>🎯 Activités</span>
              <span className="text-right font-medium">
                {grand.activity > 0 ? formatPrice(grand.activity, grand.currency) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-indigo-200 mt-2">
              <span className="text-sm font-bold text-gray-800">Total estimé</span>
              <span className="text-sm font-bold text-indigo-700">
                {grand.total > 0 ? formatPrice(grand.total, grand.currency) : '—'}
              </span>
            </div>

            {/* Détail par étape */}
            {stepBudgets.filter(b => b.total > 0).length > 0 && (
              <div className="mt-3 pt-2 border-t border-indigo-100 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Détail par étape</p>
                {stepBudgets.map((b) => b.total > 0 && (
                  <div key={b.stepId} className="flex items-center justify-between text-xs text-gray-600">
                    <span className="truncate max-w-[140px]">{b.stepName}</span>
                    <span className="font-medium text-gray-800 shrink-0">
                      {formatPrice(b.total, b.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Version complète (tableau)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <span>💰</span> Budget estimé
        </h3>
        <span className="text-lg font-bold text-indigo-700">
          {grand.total > 0 ? formatPrice(grand.total, grand.currency) : '—'}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <th className="px-4 py-2 text-left">Étape</th>
            <th className="px-4 py-2 text-right">Hébergement</th>
            <th className="px-4 py-2 text-right">Activités</th>
            <th className="px-4 py-2 text-right font-bold text-indigo-500">Total</th>
          </tr>
        </thead>
        <tbody>
          {stepBudgets.map((b, i) => (
            <tr key={b.stepId} className={`border-t border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
              <td className="px-4 py-2 text-gray-800 font-medium truncate max-w-[160px]">{b.stepName}</td>
              <td className="px-4 py-2 text-right text-gray-600">
                {b.accomTotal > 0 ? (
                  <>
                    {formatPrice(b.accomTotal, b.currency)}
                    {b.accomNights > 0 && <span className="text-gray-400 text-xs ml-1">({b.accomNights}n)</span>}
                  </>
                ) : '—'}
              </td>
              <td className="px-4 py-2 text-right text-gray-600">
                {b.activityTotal > 0 ? formatPrice(b.activityTotal, b.currency) : '—'}
              </td>
              <td className="px-4 py-2 text-right font-bold text-indigo-700">
                {b.total > 0 ? formatPrice(b.total, b.currency) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-indigo-200 bg-indigo-50">
            <td className="px-4 py-2.5 font-bold text-gray-800">TOTAL</td>
            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
              {grand.accom > 0 ? (
                <>
                  {formatPrice(grand.accom, grand.currency)}
                  {grand.nights > 0 && <span className="text-gray-400 text-xs ml-1">({grand.nights}n)</span>}
                </>
              ) : '—'}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
              {grand.activity > 0 ? formatPrice(grand.activity, grand.currency) : '—'}
            </td>
            <td className="px-4 py-2.5 text-right font-bold text-indigo-700 text-base">
              {grand.total > 0 ? formatPrice(grand.total, grand.currency) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
