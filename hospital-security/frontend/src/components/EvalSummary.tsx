"use client";

import { categoryColor, ConfusionMatrix } from "./charts";
import { label, num, pct } from "@/lib/format";
import type { MulticlassReport } from "@/lib/types";

export function EvalSummary({ e }: { e: MulticlassReport }) {
  const ab = e.attack_vs_benign;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Macro F1", pct(e.macro_f1)], ["Attack precision", pct(ab.precision)], ["Attack recall", pct(ab.recall)],
          ["Benign FPR", pct(ab.false_positive_rate, 2)], ["Attack PR-AUC", ab.pr_auc !== undefined ? pct(ab.pr_auc) : "—"]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">{k}</p><p className="tabular text-lg font-semibold text-ink">{v}</p></div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-muted">
            <th className="py-1.5 font-medium">Category</th><th className="font-medium">Precision</th><th className="font-medium">Recall</th><th className="font-medium">F1</th><th className="font-medium">Support</th></tr></thead>
          <tbody>
            {Object.entries(e.per_class).map(([k, m]) => (
              <tr key={k} className="border-b border-line-soft">
                <td className="py-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: categoryColor(k) }} />{label(k)}</td>
                <td className="tabular">{pct(m.precision)}</td><td className="tabular">{pct(m.recall)}</td>
                <td className="tabular">{pct(m["f1-score"])}</td><td className="tabular">{num(m.support)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfusionMatrix labels={e.confusion_matrix.labels} matrix={e.confusion_matrix.matrix} />
    </div>
  );
}

