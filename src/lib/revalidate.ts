import "server-only";
import { revalidatePath } from "next/cache";

/** Refresh every cached public page after content changes in the admin. */
export function revalidatePublicSite() {
  revalidatePath("/", "layout");
}
