"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { doctorSchema, fieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { ImageUpload } from "./ImageUpload";
import { ListEditor } from "./ListEditor";
import { useAction } from "./useAction";

export type DoctorRow = {
  id: string;
  slug: string;
  name: string;
  qualification: string | null;
  specialization: string | null;
  experience: string | null;
  bio: string | null;
  expertise: string[];
  photoUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  upcoming: number;
};

type Form = Omit<DoctorRow, "id" | "upcoming" | "displayOrder"> & { displayOrder: string };

const blank: Form = { slug: "", name: "", qualification: "", specialization: "", experience: "", bio: "", expertise: [], photoUrl: null, displayOrder: "0", isActive: true };

export function DoctorsManager({ doctors }: { doctors: DoctorRow[] }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggle, setToggle] = useState<DoctorRow | null>(null);

  const open = (d?: DoctorRow) => {
    setErrors({});
    setEditing(
      d
        ? { id: d.id, form: { ...d, qualification: d.qualification ?? "", specialization: d.specialization ?? "", experience: d.experience ?? "", bio: d.bio ?? "", displayOrder: String(d.displayOrder) } }
        : { id: null, form: { ...blank, displayOrder: String(doctors.length + 1) } },
    );
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload = { ...editing.form, photoUrl: editing.form.photoUrl ?? "" };
    const parsed = doctorSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    const res = await run(
      "save",
      editing.id ? `/api/admin/doctors/${editing.id}` : "/api/admin/doctors",
      { method: editing.id ? "PATCH" : "POST", json: payload },
      editing.id ? "Doctor updated" : "Doctor added",
    );
    if (res.ok) setEditing(null);
    else if (res.fieldErrors) setErrors(res.fieldErrors);
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => open()} icon={<Plus className="size-4" aria-hidden="true" />}>
          Add doctor
        </Button>
      </div>
      {doctors.length === 0 ? (
        <EmptyState title="No doctors yet" action={<Button onClick={() => open()}>Add the first doctor</Button>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {doctors.map((d) => (
            <li key={d.id} className="flex gap-4 rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-navy-soft">
                <Image src={d.photoUrl || "/images/placeholders/doctor.svg"} alt="" fill sizes="80px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl">{d.name}</h2>
                  {d.isActive ? <Badge tone="teal">Visible</Badge> : <Badge tone="danger">Deactivated</Badge>}
                </div>
                <p className="text-sm text-muted">{d.specialization || "No specialisation yet"}</p>
                <p className="text-sm text-muted">{d.qualification || <span className="italic">Qualification not filled in yet</span>}</p>
                <p className="mt-1 text-sm">{d.upcoming} upcoming {d.upcoming === 1 ? "appointment" : "appointments"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => open(d)} icon={<Pencil className="size-4" aria-hidden="true" />}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setToggle(d)} icon={d.isActive ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}>
                    {d.isActive ? "Deactivate" : "Reactivate"}
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
        title={editing?.id ? "Edit doctor" : "Add doctor"}
        description="Empty fields are simply hidden on the website."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="doctor-form" loading={pending === "save"} loadingText="Saving…">Save</Button>
          </>
        }
      >
        {editing && (
          <form id="doctor-form" onSubmit={save} noValidate className="space-y-5">
            <ImageUpload label="Photo" value={editing.form.photoUrl} onChange={(v) => set("photoUrl", v)} placeholder="/images/placeholders/doctor.svg" aspect="aspect-[5/6]" />
            <TextField label="Full name" required value={editing.form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} placeholder="Dr. …" />
            <TextField label="Qualification" optional value={editing.form.qualification ?? ""} onChange={(e) => set("qualification", e.target.value)} error={errors.qualification} placeholder="e.g. BAMS, MD (Ayurveda)" />
            <TextField label="Specialisation" optional value={editing.form.specialization ?? ""} onChange={(e) => set("specialization", e.target.value)} error={errors.specialization} />
            <TextField label="Experience" optional value={editing.form.experience ?? ""} onChange={(e) => set("experience", e.target.value)} error={errors.experience} placeholder="e.g. 12+ years" />
            <TextAreaField label="Biography" optional rows={6} value={editing.form.bio ?? ""} onChange={(e) => set("bio", e.target.value)} error={errors.bio} hint="Leave a blank line between paragraphs." />
            <ListEditor label="Areas of expertise" items={editing.form.expertise} onChange={(v) => set("expertise", v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Display order" type="number" min={0} value={editing.form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} error={errors.displayOrder} hint="Lower numbers appear first." />
              <TextField label="Web address (slug)" optional value={editing.form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} error={errors.slug} hint={editing.id ? "Changing this breaks old links." : "Created from the name if left empty."} />
            </div>
            <Checkbox label="Show on website and allow online booking" checked={editing.form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!toggle}
        title={toggle?.isActive ? `Deactivate ${toggle?.name}?` : `Reactivate ${toggle?.name}?`}
        confirmLabel={toggle?.isActive ? "Yes, deactivate" : "Yes, reactivate"}
        tone={toggle?.isActive ? "danger" : "primary"}
        loading={pending === "toggle"}
        onClose={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          const res = await run("toggle", `/api/admin/doctors/${toggle.id}`, { method: "PATCH", json: { isActive: !toggle.isActive } }, toggle.isActive ? "Doctor deactivated" : "Doctor reactivated");
          if (res.ok) setToggle(null);
        }}
      >
        {toggle?.isActive ? (
          <p>
            They will be hidden from the website and online booking. Past and existing appointments are kept
            {toggle.upcoming > 0 && <strong> — they still have {toggle.upcoming} upcoming appointment(s) you may need to reschedule</strong>}.
          </p>
        ) : (
          <p>They will appear on the website and patients can book with them again.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
