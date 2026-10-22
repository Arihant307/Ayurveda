"use client";

import { Lock, ShieldPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, post } from "@/lib/api";
import { Button, ErrorState, Field, inputCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/auth/login", { email, password });
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Wait a minute and try again."
        : err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-primary">
          <span className="rounded-2xl bg-primary p-2 text-white"><ShieldPlus aria-hidden className="h-7 w-7" /></span>
          <div>
            <p className="text-xl font-semibold text-ink">CareShield SOC</p>
            <p className="text-sm text-ink-muted">Hospital security operations</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-6 shadow-card">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink"><Lock aria-hidden className="h-4 w-4 text-primary" /> Sign in</h1>
          {error && <ErrorState error={error} />}
          <Field label="Work e-mail">
            <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          <p className="text-xs text-ink-muted">Access is limited to authorised security staff. Sign-ins are audited.</p>
        </form>
      </div>
    </main>
  );
}
