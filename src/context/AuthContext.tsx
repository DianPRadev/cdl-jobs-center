import { useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { AuthContext, User } from "./auth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllApplicationDrafts } from "@/hooks/useApplication";

const ROLE_CACHE_KEY = "cdl-cached-role";

const parseUserRole = (value: unknown): User["role"] | null => {
  if (value === "driver" || value === "company" || value === "admin") return value;
  return null;
};

const fallbackDisplayName = (email: string, preferred?: string) => {
  if (preferred && preferred.trim()) return preferred.trim();
  const localPart = email.split("@")[0]?.trim();
  return localPart || "User";
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const loadProfile = useCallback(async (sessionUser: SupabaseUser) => {
    const userId = sessionUser.id;
    const userEmail = sessionUser.email ?? "";
    const fallbackRole = parseUserRole(sessionUser.user_metadata?.role);
    const fallbackName = typeof sessionUser.user_metadata?.name === "string"
      ? sessionUser.user_metadata.name
      : undefined;

    // Retry up to 4 times with 600ms delay. The DB trigger that creates the
    // profiles row runs asynchronously and may not be committed yet on the
    // first attempt (especially right after signUp).
    let data: { id: string; name: string | null; role: string | null } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: row } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("id", userId)
        .maybeSingle();

      if (row) {
        data = {
          id: row.id as string,
          name: (row.name as string | null) ?? null,
          role: (row.role as string | null) ?? null,
        };
        break;
      }

      if (attempt < 3) await new Promise((r) => setTimeout(r, 600));
    }

    if (data) {
      const role = parseUserRole(data.role) ?? fallbackRole ?? "driver";
      setUser({
        id: data.id,
        name: data.name ?? fallbackDisplayName(userEmail, fallbackName),
        email: userEmail,
        role,
      });
      localStorage.setItem(ROLE_CACHE_KEY, role);

      // Deferred profile population: on first sign-in after email confirmation,
      // persist registration fields stored in user_metadata to the profile table.
      const meta = sessionUser.user_metadata;
      if (meta) {
        try {
          if (role === "driver" && (meta.first_name || meta.phone || meta.cdl_number || meta.home_address)) {
            const { data: existing } = await supabase
              .from("driver_profiles")
              .select("id")
              .eq("id", userId)
              .maybeSingle();
            if (!existing) {
              const { error: upsertErr } = await supabase.from("driver_profiles").upsert({
                id: userId,
                first_name: meta.first_name || "",
                last_name: meta.last_name || "",
                phone: meta.phone || "",
                cdl_number: meta.cdl_number || "",
                zip_code: meta.zip_code || "",
                home_address: meta.home_address || "",
                interested_in: meta.interested_in || "",
                next_job_want: meta.next_job_want || "",
                has_accidents: meta.has_accidents || "",
                wants_contact: meta.wants_contact || "",
              });
              // Fallback: if new columns don't exist yet, retry with base columns
              if (upsertErr) {
                await supabase.from("driver_profiles").upsert({
                  id: userId,
                  first_name: meta.first_name || "",
                  last_name: meta.last_name || "",
                  phone: meta.phone || "",
                  cdl_number: meta.cdl_number || "",
                  zip_code: meta.zip_code || "",
                });
              }
            }
          } else if (role === "company" && (meta.company_name || meta.contact_name)) {
            const { data: existing } = await supabase
              .from("company_profiles")
              .select("id")
              .eq("id", userId)
              .maybeSingle();
            if (!existing) {
              const { error: upsertErr } = await supabase.from("company_profiles").upsert({
                id: userId,
                company_name: meta.company_name || meta.name || "",
                phone: meta.company_phone || "",
                address: meta.company_address || "",
                email: meta.company_email || userEmail,
                contact_name: meta.contact_name || "",
                contact_title: meta.contact_title || "",
                company_goal: meta.company_goal || "",
              });
              // Fallback: if new columns don't exist yet, retry with base columns
              if (upsertErr) {
                await supabase.from("company_profiles").upsert({
                  id: userId,
                  company_name: meta.company_name || meta.name || "",
                  phone: meta.company_phone || "",
                  address: meta.company_address || "",
                  email: meta.company_email || userEmail,
                });
              }
            }
          }
        } catch (e) {
          // Non-fatal: profile fields can be filled in later from the dashboard.
          // Log for debugging (e.g. missing columns if migration not applied).
          console.warn("[AuthContext] deferred profile population failed:", e);
        }
      }
    } else if (fallbackRole) {
      // If profile row creation lags behind auth, keep the session usable.
      setUser({
        id: userId,
        name: fallbackDisplayName(userEmail, fallbackName),
        email: userEmail,
        role: fallbackRole,
      });
      localStorage.setItem(ROLE_CACHE_KEY, fallbackRole);
    } else {
      setUser(null);
      localStorage.removeItem(ROLE_CACHE_KEY);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    // Keep in sync with Supabase auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await loadProfile(session.user);
        } else {
          setUser(null);
          localStorage.removeItem(ROLE_CACHE_KEY);
          setLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
    role: "driver" | "company",
    profileFields?: Record<string, string>,
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role, ...profileFields } },
    });
    if (error) throw error;
    // Supabase returns a "fake" user with empty identities when the email
    // is already registered (to prevent email enumeration). Detect this.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error("This email is already registered. Please sign in instead.");
    }
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    // Clear local state first so the UI updates immediately
    setUser(null);
    localStorage.removeItem(ROLE_CACHE_KEY);
    queryClient.clear();
    clearAllApplicationDrafts();
    // Then sign out from Supabase (fire-and-forget — local state is already cleared)
    supabase.auth.signOut().catch(() => {});
  }, [queryClient]);

  const authValue = useMemo(
    () => ({ user, loading, signIn, register, signOut }),
    [user, loading, signIn, register, signOut],
  );

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}