import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHeader } from "@/components/admin/AdminShell";
import { MessagesInbox } from "@/components/admin/MessagesInbox";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireAdminPage("OWNER");
  const messages = await db.contactMessage.findMany({ orderBy: [{ isRead: "asc" }, { createdAt: "desc" }], take: 200 });
  const unread = messages.filter((m) => !m.isRead).length;
  return (
    <>
      <PageHeader title="Messages" description={unread ? `${unread} new ${unread === 1 ? "message" : "messages"}` : "All caught up"} />
      <MessagesInbox messages={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />
    </>
  );
}
