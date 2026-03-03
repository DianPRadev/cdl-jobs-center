import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface NotificationPreferencesProps {
  userId: string;
  role: "driver" | "company";
}

interface PrefItem {
  key: string;
  label: string;
  description: string;
}

const COMPANY_PREFS: PrefItem[] = [
  { key: "new_application", label: "New Applications", description: "When a driver applies to one of your jobs" },
  { key: "new_message", label: "New Messages", description: "When you receive a new message" },
  { key: "new_match", label: "AI Matches", description: "When a new candidate match is found" },
  { key: "new_lead", label: "New Leads", description: "When a new lead is captured" },
  { key: "verification_update", label: "Verification Updates", description: "When your verification request is approved or rejected" },
  { key: "subscription_event", label: "Subscription Updates", description: "Plan changes and billing events" },
  { key: "weekly_digest", label: "Weekly Digest", description: "Weekly summary of activity" },
];

const DRIVER_PREFS: PrefItem[] = [
  { key: "stage_change", label: "Application Status", description: "When your application status changes" },
  { key: "new_message", label: "New Messages", description: "When you receive a new message" },
  { key: "new_match", label: "AI Matches", description: "When a new job match is found" },
  { key: "profile_reminder", label: "Profile Reminders", description: "Reminders to complete your profile" },
  { key: "weekly_digest", label: "Weekly Digest", description: "Weekly summary of activity" },
];

export function NotificationPreferences({ userId, role }: NotificationPreferencesProps) {
  const prefs = role === "company" ? COMPANY_PREFS : DRIVER_PREFS;
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", userId)
        .single();
      if (data?.notification_preferences) {
        setValues(data.notification_preferences as Record<string, boolean>);
      }
      setLoaded(true);
    })();
  }, [userId]);

  const handleToggle = async (key: string, checked: boolean) => {
    const next = { ...values, [key]: checked };
    setValues(next);

    const { error } = await supabase
      .from("profiles")
      .update({ notification_preferences: next })
      .eq("id", userId);

    if (error) {
      setValues(values); // revert
      toast.error("Failed to update notification preference.");
    }
  };

  const sectionRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (loaded && searchParams.get("section") === "notifications" && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      sectionRef.current.classList.add("ring-2", "ring-primary", "ring-offset-2");
      const timer = setTimeout(() => {
        sectionRef.current?.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loaded, searchParams]);

  if (!loaded) return (
    <div className="border border-border bg-card p-5 mt-6 rounded-lg animate-pulse">
      <div className="h-4 w-36 bg-muted rounded mb-3" />
      <div className="h-3 w-64 bg-muted rounded mb-4" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="h-3.5 w-28 bg-muted rounded" />
              <div className="h-2.5 w-48 bg-muted rounded" />
            </div>
            <div className="h-5 w-9 bg-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={sectionRef} id="notification-preferences" className="border border-border bg-card p-5 mt-6 rounded-lg transition-all">
      <h3 className="font-semibold text-sm mb-1">Email Notifications</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Choose which notifications you receive by email. In-app notifications are always enabled.
      </p>
      <div className="space-y-4">
        {prefs.map((pref) => (
          <div key={pref.key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor={`pref-${pref.key}`} className="text-sm font-medium cursor-pointer">
                {pref.label}
              </Label>
              <p className="text-xs text-muted-foreground">{pref.description}</p>
            </div>
            <Switch
              id={`pref-${pref.key}`}
              checked={values[pref.key] !== false}
              onCheckedChange={(checked) => handleToggle(pref.key, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
