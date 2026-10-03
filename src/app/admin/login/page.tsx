import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { Logo } from "@/components/site/Logo";
import { LoginForm } from "@/components/admin/LoginForm";
import { PlusMark } from "@/components/site/Botanical";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  return (
    <main id="main" className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <PlusMark variant="outline" className="absolute -right-32 -top-32 size-[30rem] text-teal/30" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo href={null} priority className="h-24 w-auto" />
        </div>
        <div className="rounded-[var(--radius-card)] border border-line/70 bg-white p-6 shadow-lift sm:p-8">
          <h1 className="text-4xl">Clinic admin</h1>
          <p className="mt-1 text-muted">Sign in to manage appointments.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm text-muted">Forgotten your password? Ask the clinic owner to reset it.</p>
      </div>
    </main>
  );
}
