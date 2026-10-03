"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { fieldErrors, testimonialSchema } from "@/lib/validation";
import { formatDateMedium } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAction } from "./useAction";

export type TestimonialRow = { id: string; patientName: string; context: string | null; content: string; rating: number | null; isPublished: boolean; createdAt: string };
type Form = { patientName: string; context: string; content: string; rating: string; isPublished: boolean };

export function TestimonialsManager({ items }: { items: TestimonialRow[] }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [del, setDel] = useState<TestimonialRow | null>(null);

  const open = (t?: TestimonialRow) => {
    setErrors({});
    setEditing(
      t
        ? { id: t.id, form: { patientName: t.patientName, context: t.context ?? "", content: t.content, rating: t.rating ? String(t.rating) : "", isPublished: t.isPublished } }
        : { id: null, form: { patientName: "", context: "", content: "", rating: "", isPublished: false } },
    );
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload = { ...editing.form, rating: editing.form.rating || undefined };
    const parsed = testimonialSchema.safeParse(payload);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const res = await run("save", editing.id ? `/api/admin/testimonials/${editing.id}` : "/api/admin/testimonials", { method: editing.id ? "PATCH" : "POST", json: payload }, "Testimonial saved");
    if (res.ok) setEditing(null);
    else if (res.fieldErrors) setErrors(res.fieldErrors);
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => open()} icon={<Plus className="size-4" aria-hidden="true" />}>Add testimonial</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No testimonials yet" action={<Button onClick={() => open()}>Add the first one</Button>}>
          Add feedback from real patients only, with their permission. Published testimonials appear on the home page.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((t) => (
            <li key={t.id} className="flex flex-col rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-sans text-lg font-bold text-ink">{t.patientName}</h2>
                {t.isPublished ? <Badge tone="green">Published</Badge> : <Badge>Draft</Badge>}
                {t.rating && <Badge tone="saffron">{t.rating}/5</Badge>}
              </div>
              {t.context && <p className="text-sm text-muted">{t.context}</p>}
              <p className="mt-2 line-clamp-4 flex-1">“{t.content}”</p>
              <p className="mt-2 text-xs text-muted">Added {formatDateMedium(new Date(t.createdAt))}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => open(t)} icon={<Pencil className="size-4" aria-hidden="true" />}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending === `pub-${t.id}`}
                  onClick={() => run(`pub-${t.id}`, `/api/admin/testimonials/${t.id}`, { method: "PATCH", json: { isPublished: !t.isPublished } }, t.isPublished ? "Hidden from website" : "Published on website")}
                  icon={t.isPublished ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                >
                  {t.isPublished ? "Hide" : "Publish"}
                </Button>
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setDel(t)} icon={<Trash2 className="size-4" aria-hidden="true" />}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit testimonial" : "Add testimonial"}
        description="Only add genuine feedback from real patients, with their permission."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="testimonial-form" loading={pending === "save"}>Save</Button>
          </>
        }
      >
        {editing && (
          <form id="testimonial-form" onSubmit={save} noValidate className="space-y-4">
            <TextField label="Patient name" required value={editing.form.patientName} onChange={(e) => set("patientName", e.target.value)} error={errors.patientName} hint="First name and initial is fine, e.g. “Meena S.”" />
            <TextField label="Context" optional value={editing.form.context} onChange={(e) => set("context", e.target.value)} error={errors.context} placeholder="e.g. Panchakarma patient" />
            <TextAreaField label="What they said" required rows={5} value={editing.form.content} onChange={(e) => set("content", e.target.value)} error={errors.content} />
            <SelectField label="Rating" optional value={editing.form.rating} onChange={(e) => set("rating", e.target.value)}>
              <option value="">No rating</option>
              {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} out of 5</option>)}
            </SelectField>
            <Checkbox label="Publish on the website" checked={editing.form.isPublished} onChange={(e) => set("isPublished", e.target.checked)} />
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!del}
        title="Delete this testimonial?"
        confirmLabel="Yes, delete"
        tone="danger"
        loading={pending === "delete"}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          const res = await run("delete", `/api/admin/testimonials/${del.id}`, { method: "DELETE" }, "Testimonial deleted");
          if (res.ok) setDel(null);
        }}
      >
        <p>This permanently removes the testimonial from {del?.patientName}. If you only want to take it off the website, choose “Hide” instead.</p>
      </ConfirmDialog>
    </>
  );
}
