"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

/** Edit a short list of text items (e.g. benefits, areas of expertise). */
export function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <p className="mb-1.5 text-[0.95rem] font-semibold">{label}</p>
      {items.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {items.map((item, i) => (
            <li key={item} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[0.95rem] ring-1 ring-line">
              <span className="flex-1">{item}</span>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove “${item}”`}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? "Type and press Add"}
          aria-label={`Add to ${label}`}
          className="min-h-11 flex-1 rounded-xl border border-line bg-white px-3 focus:border-teal-deep focus:outline-none focus:ring-4 focus:ring-teal-soft"
        />
        <button type="button" onClick={add} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-teal-soft px-4 font-semibold text-green-deep hover:bg-green-soft">
          <Plus className="size-4" aria-hidden="true" /> Add
        </button>
      </div>
    </div>
  );
}
