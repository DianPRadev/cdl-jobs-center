import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Truck, Briefcase, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle, useNoIndex } from "@/hooks/usePageTitle";
import { withTimeout } from "@/lib/withTimeout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type RoleChoice = "driver" | "company";

interface DriverFields {
  firstName: string;
  lastName: string;
  phone: string;
}

interface CompanyFields {
  companyName: string;
  contactName: string;
  phone: string;
}

/**
 * One-time onboarding for social-login users.
 * Step 1: pick Driver or Company
 * Step 2: fill required profile fields
 */
const Onboarding = () => {
  usePageTitle("Welcome");
  useNoIndex();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  // Step management
  const [step, setStep] = useState<1 | 2>(1);
  const [chosenRole, setChosenRole] = useState<RoleChoice | null>(null);

  // Profile fields
  const [driverFields, setDriverFields] = useState<DriverFields>({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [companyFields, setCompanyFields] = useState<CompanyFields>({
    companyName: "",
    contactName: "",
    phone: "",
  });

  // Guard: redirect away if user already completed onboarding
  useEffect(() => {
    if (authLoading || redirecting) return;
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
          const dest = user.role === "company" ? "/dashboard" : "/driver-dashboard";
          navigate(dest, { replace: true });
        }
      } catch {
        // Profile check failed — show role cards so user isn't stuck
      }
      setChecking(false);
    };

    check();
  }, [user, authLoading, navigate, redirecting]);

  // Pre-fill contact name from OAuth metadata
  useEffect(() => {
    if (user) {
      const meta = (user as any).user_metadata ?? {};
      const name = meta.name || meta.full_name || "";
      if (name) {
        const parts = name.split(" ");
        setDriverFields((prev) => ({
          ...prev,
          firstName: prev.firstName || parts[0] || "",
          lastName: prev.lastName || parts.slice(1).join(" ") || "",
        }));
        setCompanyFields((prev) => ({
          ...prev,
          contactName: prev.contactName || name,
        }));
      }
    }
  }, [user]);

  const handleRoleSelect = (role: RoleChoice) => {
    setChosenRole(role);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setChosenRole(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !chosenRole || saving) return;

    // Validate
    if (chosenRole === "driver") {
      if (!driverFields.firstName.trim() || !driverFields.lastName.trim() || !driverFields.phone.trim()) {
        toast.error("Please fill in all required fields.");
        return;
      }
    } else {
      if (!companyFields.companyName.trim() || !companyFields.contactName.trim() || !companyFields.phone.trim()) {
        toast.error("Please fill in all required fields.");
        return;
      }
    }

    setSaving(true);
    setRedirecting(true);

    try {
      const profileData = chosenRole === "driver"
        ? {
            first_name: driverFields.firstName.trim(),
            last_name: driverFields.lastName.trim(),
            phone: driverFields.phone.trim(),
          }
        : {
            company_name: companyFields.companyName.trim(),
            contact_name: companyFields.contactName.trim(),
            phone: companyFields.phone.trim(),
          };

      const { error: rpcErr } = await withTimeout(
        supabase.rpc("complete_onboarding", {
          chosen_role: chosenRole,
          profile_data: profileData,
        }),
        30_000
      );

      if (rpcErr) throw rpcErr;

      // Fire-and-forget: DO NOT await — updateUser can hang indefinitely.
      supabase.auth.updateUser({ data: { role: chosenRole } }).catch(() => {});

      // Hard navigate forces a full page load with fresh auth state.
      const dest = chosenRole === "company" ? "/dashboard" : "/driver-dashboard";
      window.location.href = dest;
    } catch (err) {
      console.error("[Onboarding] handleSubmit failed:", err);
      const msg = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Something went wrong. Please try again.";
      toast.error(msg);
      setSaving(false);
      setRedirecting(false);
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
          {step === 1 ? (
            <>
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
                  onClick={() => handleRoleSelect("driver")}
                  className="group relative flex flex-col items-center gap-4 rounded-xl border-2 bg-card p-8 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary border-border hover:border-primary hover:shadow-md"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Truck className="h-8 w-8" />
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
                  onClick={() => handleRoleSelect("company")}
                  className="group relative flex flex-col items-center gap-4 rounded-xl border-2 bg-card p-8 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary border-border hover:border-primary hover:shadow-md"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Briefcase className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">I'm a Company</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Hire qualified CDL drivers
                    </p>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 mx-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to role selection
              </button>

              <h1 className="font-display text-2xl font-bold sm:text-3xl">
                {chosenRole === "driver" ? "Set Up Your Driver Profile" : "Set Up Your Company Profile"}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {chosenRole === "driver"
                  ? "Tell us a bit about yourself so companies can find you."
                  : "Add your company details so drivers can find your jobs."}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 text-left space-y-4 max-w-sm mx-auto">
                {chosenRole === "driver" ? (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="ob-first-name" className="text-sm font-medium">
                        First Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="ob-first-name"
                        value={driverFields.firstName}
                        onChange={(e) => setDriverFields((p) => ({ ...p, firstName: e.target.value }))}
                        placeholder="John"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="ob-last-name" className="text-sm font-medium">
                        Last Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="ob-last-name"
                        value={driverFields.lastName}
                        onChange={(e) => setDriverFields((p) => ({ ...p, lastName: e.target.value }))}
                        placeholder="Doe"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="ob-phone" className="text-sm font-medium">
                        Phone Number <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="ob-phone"
                        type="tel"
                        value={driverFields.phone}
                        onChange={(e) => setDriverFields((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="ob-company-name" className="text-sm font-medium">
                        Company Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="ob-company-name"
                        value={companyFields.companyName}
                        onChange={(e) => setCompanyFields((p) => ({ ...p, companyName: e.target.value }))}
                        placeholder="Acme Trucking LLC"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="ob-contact-name" className="text-sm font-medium">
                        Contact Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="ob-contact-name"
                        value={companyFields.contactName}
                        onChange={(e) => setCompanyFields((p) => ({ ...p, contactName: e.target.value }))}
                        placeholder="Jane Smith"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="ob-company-phone" className="text-sm font-medium">
                        Phone Number <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="ob-company-phone"
                        type="tel"
                        value={companyFields.phone}
                        onChange={(e) => setCompanyFields((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                        required
                      />
                    </div>
                  </>
                )}

                <Button type="submit" className="w-full mt-6" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating your account...
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
