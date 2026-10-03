import { requireAdminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { Logo } from "@/components/site/Logo";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const unread = admin.role === "OWNER" ? await db.contactMessage.count({ where: { isRead: false } }) : 0;
  return (
    <AdminShell admin={{ name: admin.name, role: admin.role }} logo={<Logo href="/admin" className="h-10 w-auto" />}
      logoOnDark={<Logo href="/admin" variant="onDark" className="h-10 w-auto" />} unreadMessages={unread}>
      {children}
    </AdminShell>
  );
}
