import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/withTimeout";

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToNotification(row: Record<string, any>): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: row.metadata ?? {},
    read: row.read,
    createdAt: row.created_at,
  };
}

/** Recent notifications for the current user */
export function useNotifications(userId: string | undefined, limit = 30) {
  return useQuery({
    queryKey: ["notifications", userId, limit],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(rowToNotification);
    },
    enabled: !!userId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Unread notification count for badge */
export function useUnreadNotificationCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["unread-notification-count", userId],
    refetchOnMount: "always",
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("read", false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Mark specific notification IDs as read */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (notifIds: string[]) => {
      const { error } = await withTimeout(supabase
        .from("notifications")
        .update({ read: true })
        .in("id", notifIds), 15_000);
      if (error) throw error;
    },
    onMutate: async (notifIds) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      await qc.cancelQueries({ queryKey: ["unread-notification-count"] });

      // Optimistic: mark notifications read in cache immediately
      const prevNotifications = qc.getQueriesData<Notification[]>({
        queryKey: ["notifications"],
      });
      const prevCounts = qc.getQueriesData<number>({
        queryKey: ["unread-notification-count"],
      });

      const idSet = new Set(notifIds);
      qc.setQueriesData<Notification[]>({ queryKey: ["notifications"] }, (old) =>
        old?.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n)),
      );
      qc.setQueriesData<number>({ queryKey: ["unread-notification-count"] }, (old) =>
        Math.max(0, (old ?? 0) - notifIds.length),
      );

      return { prevNotifications, prevCounts };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      for (const [key, data] of context.prevNotifications) qc.setQueryData(key, data);
      for (const [key, data] of context.prevCounts) qc.setQueryData(key, data);
      console.warn("[Notifications] Failed to mark as read:", _err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

/** Mark all notifications as read */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 10_000);
      if (!user) throw new Error("Not authenticated");
      const { error } = await withTimeout(supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false), 15_000);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      await qc.cancelQueries({ queryKey: ["unread-notification-count"] });

      const prevNotifications = qc.getQueriesData<Notification[]>({
        queryKey: ["notifications"],
      });
      const prevCounts = qc.getQueriesData<number>({
        queryKey: ["unread-notification-count"],
      });

      qc.setQueriesData<Notification[]>({ queryKey: ["notifications"] }, (old) =>
        old?.map((n) => ({ ...n, read: true })),
      );
      qc.setQueriesData<number>({ queryKey: ["unread-notification-count"] }, () => 0);

      return { prevNotifications, prevCounts };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      for (const [key, data] of context.prevNotifications) qc.setQueryData(key, data);
      for (const [key, data] of context.prevCounts) qc.setQueryData(key, data);
      console.warn("[Notifications] Failed to mark all as read:", _err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

/** Delete all notifications for current user */
export function useClearAllNotifications() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 10_000);
      if (!user) throw new Error("Not authenticated");
      const { error } = await withTimeout(supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id), 15_000);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      await qc.cancelQueries({ queryKey: ["unread-notification-count"] });

      const previousNotifications = qc.getQueriesData<Notification[]>({
        queryKey: ["notifications"],
      });
      const previousUnreadCounts = qc.getQueriesData<number>({
        queryKey: ["unread-notification-count"],
      });

      qc.setQueriesData<Notification[]>({ queryKey: ["notifications"] }, []);
      qc.setQueriesData<number>({ queryKey: ["unread-notification-count"] }, 0);

      return { previousNotifications, previousUnreadCounts };
    },
    onError: (_error, _vars, context) => {
      if (!context) return;

      for (const [queryKey, data] of context.previousNotifications) {
        qc.setQueryData(queryKey, data);
      }

      for (const [queryKey, data] of context.previousUnreadCounts) {
        qc.setQueryData(queryKey, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}
