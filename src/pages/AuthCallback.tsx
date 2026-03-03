import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * OAuth redirect landing page.
 *
 * After Google / Facebook auth, Supabase redirects here with tokens in the
 * URL hash. The Supabase client automatically picks them up and fires
 * onAuthStateChange, which populates AuthContext.
 *
 * This page waits for the user to be loaded, then checks:
 *  - needs_onboarding → /onboarding  (new social login user, pick role)
 *  - driver           → /driver-dashboard
 *  - company          → /dashboard
 *  - admin            → /admin
 */
const AuthCallback = () => {
  usePageTitle("Signing in...");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (loading || handled.current) return;
    if (!user) {
      // No session — auth failed or was cancelled
      navigate("/signin", { replace: true });
      return;
    }

    handled.current = true;

    // Check if this user still needs onboarding (social login, no role chosen)
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("needs_onboarding")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.needs_onboarding) {
        navigate("/onboarding", { replace: true });
      } else if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (user.role === "company") {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/driver-dashboard", { replace: true });
      }
    };

    checkOnboarding();
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Spinner />
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  );
};

export default AuthCallback;
