import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Truck, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle } from "@/hooks/usePageTitle";

type RoleChoice = "driver" | "company";

/**
 * One-time onboarding for social-login users.
 * They pick Driver or Company, we persist the role, and redirect.
 */
const Onboarding = () => {
  usePageTitle("Welcome");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState<RoleChoice | null>(null);
  const [checking, setChecking] = useState(true);

  // Guard: redirect away if user already completed onboarding
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/signin", { replace: true });
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("needs_onboarding")
        .eq("id", user.id)
        .maybeSingle();

      if (!data?.needs_onboarding) {
        // Already onboarded — go to dashboard
        navigate(user.role === "company" ? "/dashboard" : "/driver-dashboard", { replace: true });
      }
      setChecking(false);
    };

    check();
  }, [user, authLoading, navigate]);

  const handleChoice = async (role: RoleChoice) => {
    if (!user || saving) return;
    setSaving(role);

    try {
      // Use SECURITY DEFINER RPC to bypass RLS — updates profiles, creates
      // extended profile row, all in one transaction.
      const { error: rpcErr } = await supabase.rpc("complete_onboarding", {
        chosen_role: role,
      });

      if (rpcErr) throw rpcErr;

      // Update user_metadata in the background (don't await — it can hang).
      // AuthContext reads the role from profiles table anyway.
      supabase.auth.updateUser({ data: { role } }).catch(() => {});

      toast.success(role === "driver" ? "Welcome, driver!" : "Welcome aboard!");

      // Force a page reload so AuthContext re-fetches the updated profile
      window.location.href = role === "company" ? "/dashboard" : "/driver-dashboard";
    } catch (err) {
      console.error("[Onboarding] handleChoice failed:", err);
      const msg = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Something went wrong. Please try again.";
      toast.error(msg);
      setSaving(null);
    }
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border">
        <div className="container mx-auto py-4">
          <Link to="/" className="flex items-center gap-3 w-fit">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Truck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="font-display">
              <span className="text-xl font-bold">CDL</span>
              <span className="text-xl font-bold text-primary"> Jobs</span>
              <span className="text-xl font-light">Center</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-lg text-center">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            Welcome to CDL Jobs Center
          </h1>
          <p className="mt-2 text-muted-foreground">
            Tell us who you are so we can personalize your experience.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {/* Driver card */}
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => handleChoice("driver")}
              className="group relative flex flex-col items-center gap-4 rounded-xl border-2 border-border bg-card p-8 shadow-sm transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                {saving === "driver" ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <Truck className="h-8 w-8" />
                )}
              </div>
              <div>
                <p className="text-lg font-bold">I'm a Driver</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Find CDL jobs that match your skills
                </p>
              </div>
            </button>

            {/* Company card */}
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => handleChoice("company")}
              className="group relative flex flex-col items-center gap-4 rounded-xl border-2 border-border bg-card p-8 shadow-sm transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                {saving === "company" ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <Briefcase className="h-8 w-8" />
                )}
              </div>
              <div>
                <p className="text-lg font-bold">I'm a Company</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hire qualified CDL drivers
                </p>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
