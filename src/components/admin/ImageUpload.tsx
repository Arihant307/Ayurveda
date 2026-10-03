"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/Button";

export function ImageUpload({
  label,
  value,
  onChange,
  placeholder,
  aspect = "aspect-[4/3]",
}: {
  label: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  placeholder: string;
  aspect?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch<{ url: string }>("/api/admin/uploads", { method: "POST", body });
      if (res.ok) onChange(res.data.url);
      else setError(res.message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[0.95rem] font-semibold">{label}</p>
      <div className="flex items-center gap-4">
        <div className={`relative w-28 shrink-0 overflow-hidden rounded-xl border border-line bg-navy-soft ${aspect}`}>
          <Image src={value || placeholder} alt="" fill sizes="112px" className="object-cover" />
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id={`${label}-file`}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button size="sm" variant="secondary" loading={uploading} loadingText="Uploading…" onClick={() => input.current?.click()} icon={<ImagePlus className="size-4" aria-hidden="true" />}>
            {value ? "Change photo" : "Upload photo"}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)} icon={<Trash2 className="size-4" aria-hidden="true" />}>
              Remove
            </Button>
          )}
          <p className="text-xs text-muted">JPG, PNG or WebP, up to 3 MB.</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
}
