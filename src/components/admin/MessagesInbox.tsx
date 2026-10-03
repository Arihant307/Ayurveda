"use client";

import { useState } from "react";
import { Mail, MailOpen, Phone, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { AnchorButton, Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAction } from "./useAction";

export type MessageRow = { id: string; name: string; phone: string; email: string | null; subject: string | null; message: string; isRead: boolean; createdAt: string };

export function MessagesInbox({ messages }: { messages: MessageRow[] }) {
  const { run, pending } = useAction();
  const [del, setDel] = useState<MessageRow | null>(null);

  if (messages.length === 0) return <EmptyState title="No messages yet">Messages sent from the website’s contact form appear here.</EmptyState>;

  return (
    <>
      <ul className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={cn("rounded-[var(--radius-card)] border bg-white p-4 shadow-soft sm:p-5", m.isRead ? "border-line/70" : "border-teal ring-2 ring-teal/30")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-sans text-lg font-bold text-ink">{m.name}</h2>
              {!m.isRead && <Badge tone="accent">New</Badge>}
              <span className="ml-auto text-sm text-muted">{formatDateTime(new Date(m.createdAt))}</span>
            </div>
            {m.subject && <p className="mt-1 font-semibold">{m.subject}</p>}
            <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <AnchorButton size="sm" href={`tel:+91${m.phone}`} icon={<Phone className="size-4" aria-hidden="true" />}>{m.phone}</AnchorButton>
              {m.email && <AnchorButton size="sm" variant="outline" href={`mailto:${m.email}`} icon={<Mail className="size-4" aria-hidden="true" />}>Reply by email</AnchorButton>}
              <Button
                size="sm"
                variant="ghost"
                loading={pending === m.id}
                onClick={() => run(m.id, `/api/admin/messages/${m.id}`, { method: "PATCH", json: { isRead: !m.isRead } })}
                icon={m.isRead ? <Mail className="size-4" aria-hidden="true" /> : <MailOpen className="size-4" aria-hidden="true" />}
              >
                {m.isRead ? "Mark as new" : "Mark as read"}
              </Button>
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setDel(m)} icon={<Trash2 className="size-4" aria-hidden="true" />}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!del}
        title="Delete this message?"
        confirmLabel="Yes, delete"
        tone="danger"
        loading={pending === "delete"}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          const res = await run("delete", `/api/admin/messages/${del.id}`, { method: "DELETE" }, "Message deleted");
          if (res.ok) setDel(null);
        }}
      >
        <p>The message from {del?.name} will be permanently deleted.</p>
      </ConfirmDialog>
    </>
  );
}
