import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * OAuth redirect landing page.
 *
 * After Google / Facebook auth, Supabase redirects here with tokens in the
 * URL hash (#access_token=...). We must wait for the Supabase client to
 * exchange those tokens before checking AuthContext, otherwise getSession()
 * returns null and we'd wrongly redirect to /signin.
 *
 * Flow:
 *  1. Wait for onAuthStateChange to fire with a SIGNED_IN event
 *  2. Once AuthContext has the user, check needs_onboarding
 *  3. Route to /onboarding or the appropriate dashboard
 */
const AuthCallback = () => {
  usePageTitle("Signing in...");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Listen for the auth event that confirms tokens have been exchanged.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setSessionReady(true);
      }
    });

    // Also check if a session already exists (e.g. returning user, page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    // Safety timeout — if nothing happens in 10s, redirect to signin
    const timeout = setTimeout(() => {
      if (!handled.current) {
        navigate("/signin", { replace: true });
      }
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  // Once the session is confirmed and AuthContext has loaded, route the user.
  useEffect(() => {
    if (!sessionReady || loading || handled.current) return;
    if (!user) return; // Still waiting for AuthContext to populate

    handled.current = true;

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
  }, [sessionReady, user, loading, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Spinner />
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  );
};

export default AuthCallback;
