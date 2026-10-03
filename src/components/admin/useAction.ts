"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { apiFetch, type ApiResult } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";

/** Run an admin API call with loading state, a toast, and a page refresh on success. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      key: string,
      url: string,
      init: RequestInit & { json?: unknown },
      success?: string,
    ): Promise<ApiResult<T>> => {
      setPending(key);
      try {
        const res = await apiFetch<T>(url, init);
        if (res.ok) {
          if (success) toast("success", success);
          router.refresh();
        } else if (!res.fieldErrors) {
          toast("error", res.message);
        }
        return res;
      } finally {
        setPending(null);
      }
    },
    [router, toast],
  );

  return { run, pending };
}
