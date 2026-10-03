"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { fieldErrors, loginSchema } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/login", { method: "POST", json: parsed.data });
      if (res.ok) {
        const next = params.get("next");
        window.location.assign(next && next.startsWith("/admin") ? next : "/admin");
        return;
      }
      setError(res.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <TextField label="Email" type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <Button type="submit" size="lg" className="w-full" loading={loading} loadingText="Signing in…" icon={<LogIn className="size-5" aria-hidden="true" />}>
        Sign in
      </Button>
    </form>
  );
}
