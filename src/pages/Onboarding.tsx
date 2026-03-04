import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Truck, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { withTimeout } from "@/lib/withTimeout";

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
  const [redirecting, setRedirecting] = useState(false);

  // Guard: redirect away if user already completed onboarding
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/signin", { replace: true });
      return;
    }

    const check = async () => {
      try {
        const { data } = await withTimeout(
          supabase
            .from("profiles")
            .select("needs_onboarding")
            .eq("id", user.id)
            .maybeSingle(),
          10_000
        );

        if (!data?.needs_onboarding) {
          navigate(user.role === "company" ? "/dashboard" : "/driver-dashboard", { replace: true });
        }
      } catch {
        // Profile check failed — show role cards so user isn't stuck
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
      const { error: rpcErr } = await withTimeout(
        supabase.rpc("complete_onboarding", { chosen_role: role }),
        15_000
      );

      if (rpcErr) throw rpcErr;

      // Update user_metadata in the background (don't await — it can hang).
      // AuthContext reads the role from profiles table anyway.
      supabase.auth.updateUser({ data: { role } }).catch(() => {});

      toast.success(role === "driver" ? "Welcome, driver!" : "Welcome aboard!");

      // Brief transition screen before navigating
      setRedirecting(true);
      await new Promise((r) => setTimeout(r, 800));

      navigate(role === "company" ? "/dashboard" : "/driver-dashboard", { replace: true });
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

  if (redirecting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium text-muted-foreground">Setting up your account...</p>
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
              className={`group relative flex flex-col items-center gap-4 rounded-xl border-2 bg-card p-8 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                saving === "driver"
                  ? "border-primary shadow-md"
                  : saving !== null
                    ? "opacity-40 cursor-not-allowed border-border"
                    : "border-border hover:border-primary hover:shadow-md"
              }`}
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
              className={`group relative flex flex-col items-center gap-4 rounded-xl border-2 bg-card p-8 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                saving === "company"
                  ? "border-primary shadow-md"
                  : saving !== null
                    ? "opacity-40 cursor-not-allowed border-border"
                    : "border-border hover:border-primary hover:shadow-md"
              }`}
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
