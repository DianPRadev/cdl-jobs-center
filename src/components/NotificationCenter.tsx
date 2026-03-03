import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, FileText, MessageSquare, Users, Zap, CreditCard, UserCircle, BarChart, PartyPopper, Settings, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationsRead,
  useMarkAllNotificationsRead,
  useClearAllNotifications,
  type Notification,
} from "@/hooks/useNotifications";
import { timeAgo } from "@/lib/dateUtils";

interface NotificationCenterProps {
  userId: string;
  role?: "driver" | "company";
}

const typeIcons: Record<string, typeof Bell> = {
  new_application: FileText,
  stage_change: BarChart,
  new_message: MessageSquare,
  new_match: Zap,
  new_lead: Users,
  subscription_event: CreditCard,
  profile_reminder: UserCircle,
  weekly_digest: BarChart,
  welcome: PartyPopper,
  verification_update: ShieldCheck,
};

function getNotificationLink(notif: Notification): string | undefined {
  const rawLink = notif.metadata?.link as string | undefined;
  if (!rawLink) return undefined;

  const metadata = notif.metadata as Record<string, unknown>;
  const applicationId =
    (metadata.application_id as string | undefined) ??
    (metadata.applicationId as string | undefined);

  if (!applicationId) return rawLink;

  try {
    const url = new URL(rawLink, window.location.origin);
    const tab = url.searchParams.get("tab");
    const canCarryApplication = tab === "applications" || tab === "messages";

    if (canCarryApplication && !url.searchParams.get("app")) {
      url.searchParams.set("app", applicationId);
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawLink;
  }
}

export function NotificationCenter({ userId, role }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: notifications = [] } = useNotifications(userId);
  const { data: unreadCount = 0 } = useUnreadNotificationCount(userId);
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();
  const clearAll = useClearAllNotifications();

  const handleClick = (notif: Notification) => {
    if (!notif.read) {
      markRead.mutate([notif.id]);
    }
    const link = getNotificationLink(notif);
    if (link) {
      navigate(link);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-96 p-0"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-semibold text-sm">Notifications</p>
          <div className="flex items-center gap-1.5">
            {notifications.length > 0 && (
              <>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending || clearAll.isPending}
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    Mark all read
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      disabled={clearAll.isPending || markAllRead.isPending}
                    >
                      {clearAll.isPending ? "Clearing..." : "Clear all"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove all your notifications. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => clearAll.mutate()}>
                        Clear all
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            <button
              onClick={() => {
                const path = role === "driver" ? "/driver-dashboard" : "/dashboard";
                navigate(`${path}?tab=profile&section=notifications`);
                setOpen(false);
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label="Notification settings"
              title="Email preferences"
            >
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <ScrollArea className="h-[420px]">
          {notifications.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p>No notifications yet</p>
              <p className="text-xs mt-1">We'll let you know when something happens.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <NotificationRow
                key={notif.id}
                notif={notif}
                onClick={() => handleClick(notif)}
              />
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  notif,
  onClick,
}: {
  notif: Notification;
  onClick: () => void;
}) {
  const Icon = typeIcons[notif.type] || Bell;
  const isUnread = !notif.read;

  return (
    <button
      onClick={onClick}
      className={`relative w-full min-w-0 overflow-hidden text-left flex items-start gap-3 px-4 py-3 border-b border-border transition-colors ${
        isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
      }`}
      aria-label={`${notif.title}${isUnread ? ", unread" : ""}`}
    >
      {isUnread && (
        <span className="absolute left-0 top-0 h-full w-1 bg-primary" aria-hidden />
      )}

      <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${
        isUnread ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className={`truncate text-sm ${isUnread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
              {notif.title}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-[10px] font-medium ${isUnread ? "text-primary" : "text-muted-foreground"}`}>
              {isUnread ? "Unread" : "Read"}
            </p>
            <p className="text-[10px] text-muted-foreground">{timeAgo(notif.createdAt)}</p>
          </div>
        </div>
        {notif.body && (
          <p className={`mt-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs ${
            isUnread ? "font-medium text-foreground/80" : "text-muted-foreground"
          }`}>
            {notif.body}
          </p>
        )}
      </div>
    </button>
  );
}
