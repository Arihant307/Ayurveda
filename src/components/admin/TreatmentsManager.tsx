"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Pencil, Plus, Star } from "lucide-react";
import { fieldErrors, treatmentSchema } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { ImageUpload } from "./ImageUpload";
import { ListEditor } from "./ListEditor";
import { useAction } from "./useAction";

export type TreatmentRow = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  benefits: string[];
  duration: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isVisible: boolean;
  displayOrder: number;
};
type Form = Omit<TreatmentRow, "id" | "displayOrder" | "duration"> & { displayOrder: string; duration: string };

export function TreatmentsManager({ treatments }: { treatments: TreatmentRow[] }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggle, setToggle] = useState<TreatmentRow | null>(null);

  const open = (t?: TreatmentRow) => {
    setErrors({});
    setEditing(
      t
        ? { id: t.id, form: { ...t, duration: t.duration ?? "", displayOrder: String(t.displayOrder) } }
        : {
            id: null,
            form: { slug: "", name: "", shortDescription: "", description: "", benefits: [], duration: "", imageUrl: null, isFeatured: false, isVisible: true, displayOrder: String(treatments.length + 1) },
          },
    );
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload = { ...editing.form, imageUrl: editing.form.imageUrl ?? "" };
    const parsed = treatmentSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    const res = await run("save", editing.id ? `/api/admin/treatments/${editing.id}` : "/api/admin/treatments", { method: editing.id ? "PATCH" : "POST", json: payload }, editing.id ? "Treatment updated" : "Treatment added");
    if (res.ok) setEditing(null);
    else if (res.fieldErrors) setErrors(res.fieldErrors);
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => open()} icon={<Plus className="size-4" aria-hidden="true" />}>Add treatment</Button>
      </div>
      {treatments.length === 0 ? (
        <EmptyState title="No treatments yet" action={<Button onClick={() => open()}>Add a treatment</Button>} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {treatments.map((t) => (
            <li key={t.id} className="flex gap-4 rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft">
              <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-xl bg-navy-soft">
                <Image src={t.imageUrl || "/images/placeholders/treatment-1.svg"} alt="" fill sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl">{t.name}</h2>
                  {t.isVisible ? <Badge tone="teal">Visible</Badge> : <Badge tone="danger">Hidden</Badge>}
                  {t.isFeatured && <Badge tone="accent"><Star className="size-3" aria-hidden="true" /> Featured</Badge>}
                </div>
                <p className="line-clamp-2 text-sm text-muted">{t.shortDescription}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => open(t)} icon={<Pencil className="size-4" aria-hidden="true" />}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setToggle(t)} icon={t.isVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}>
                    {t.isVisible ? "Hide" : "Show"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        variant="drawer"
        title={editing?.id ? "Edit treatment" : "Add treatment"}
        description="Describe traditional uses and general wellbeing support only — avoid promising cures or results."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="treatment-form" loading={pending === "save"} loadingText="Saving…">Save</Button>
          </>
        }
      >
        {editing && (
          <form id="treatment-form" onSubmit={save} noValidate className="space-y-5">
            <ImageUpload label="Image" value={editing.form.imageUrl} onChange={(v) => set("imageUrl", v)} placeholder="/images/placeholders/treatment-1.svg" />
            <TextField label="Name" required value={editing.form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
            <TextAreaField label="Short description" required rows={2} value={editing.form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} error={errors.shortDescription} hint="One or two sentences shown on cards." />
            <TextAreaField label="Detailed description" required rows={8} value={editing.form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} hint="Leave a blank line between paragraphs." />
            <ListEditor label="Traditionally used for (benefits)" items={editing.form.benefits} onChange={(v) => set("benefits", v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Duration" optional value={editing.form.duration} onChange={(e) => set("duration", e.target.value)} error={errors.duration} placeholder="e.g. 45–60 minutes" />
              <TextField label="Display order" type="number" min={0} value={editing.form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} error={errors.displayOrder} />
            </div>
            <TextField label="Web address (slug)" optional value={editing.form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} error={errors.slug} hint={editing.id ? "Changing this breaks old links." : "Created from the name if left empty."} />
            <div className="flex flex-col">
              <Checkbox label="Show on website" checked={editing.form.isVisible} onChange={(e) => set("isVisible", e.target.checked)} />
              <Checkbox label="Feature on the home page" checked={editing.form.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} />
            </div>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!toggle}
        title={toggle?.isVisible ? `Hide ${toggle?.name}?` : `Show ${toggle?.name}?`}
        confirmLabel={toggle?.isVisible ? "Yes, hide" : "Yes, show"}
        tone={toggle?.isVisible ? "danger" : "primary"}
        loading={pending === "toggle"}
        onClose={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          const res = await run("toggle", `/api/admin/treatments/${toggle.id}`, { method: "PATCH", json: { isVisible: !toggle.isVisible } }, toggle.isVisible ? "Treatment hidden" : "Treatment visible");
          if (res.ok) setToggle(null);
        }}
      >
        <p>{toggle?.isVisible ? "It will be removed from the website. You can show it again at any time." : "It will appear on the website again."}</p>
      </ConfirmDialog>
    </>
  );
}
