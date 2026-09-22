"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";

const notificationSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

type Notification = z.infer<typeof notificationSchema>;

export function NotificationsMenu({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase
      .from("notifications")
      .select("id, organization_id, type, title, body, read_at, created_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const parsed = z.array(notificationSchema).safeParse(data ?? []);
        if (active && parsed.success) setNotifications(parsed.data);
      });

    const channel = supabase
      .channel(`notifications:${organizationId}:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const parsed = notificationSchema.safeParse(payload.new);
          if (parsed.success && parsed.data.organization_id === organizationId) {
            setNotifications((current) => [parsed.data, ...current].slice(0, 10));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [organizationId, userId]);

  const unread = notifications.filter((notification) => !notification.read_at).length;

  async function markAsRead() {
    if (unread === 0) return;
    const readAt = new Date().toISOString();
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .is("read_at", null);
    if (!error) {
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
    }
  }

  return (
    <details className="relative" onToggle={(event) => { if (event.currentTarget.open) void markAsRead(); }}>
      <summary className="relative grid size-9 cursor-pointer list-none place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label="Уведомления">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">{Math.min(unread, 9)}</span>}
      </summary>
      <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Уведомления</p></div>
        {notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Новых уведомлений нет</p>
        ) : (
          <div className="max-h-80 divide-y overflow-y-auto">
            {notifications.map((notification) => (
              <div key={notification.id} className="px-4 py-3">
                <p className="text-sm font-semibold">{notification.title}</p>
                {notification.body && <p className="mt-1 text-xs text-[var(--muted)]">{notification.body}</p>}
                <p className="mt-1.5 text-[10px] text-[var(--muted)]">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.created_at))}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
