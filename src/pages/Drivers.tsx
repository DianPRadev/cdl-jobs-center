import { useEffect, useMemo, useState } from "react";
import { usePageTitle, useMetaDescription, useCanonical } from "@/hooks/usePageTitle";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Heart, Lock, Users, Phone, Mail, MapPin, Bookmark } from "lucide-react";
import { PageBreadcrumb } from "@/components/ui/PageBreadcrumb";
import { useAuth } from "@/context/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListPagination } from "@/components/ListPagination";
import { useSubscription } from "@/hooks/useSubscription";

const LICENSE_CLASSES = ["All", "Class A", "Class B", "Class C", "Permit Only"];
const EXPERIENCE_OPTIONS = ["All", "None", "Less than 1 year", "1-3 years", "3-5 years", "5+ years"];

const LICENSE_CLASS_LABELS: Record<string, string> = {
  a: "Class A",
  b: "Class B",
  c: "Class C",
  permit: "Permit Only",
};

const YEARS_EXP_LABELS: Record<string, string> = {
  none: "None",
  "less-1": "Less than 1 year",
  "1-2": "1-3 years",
  "1-3": "1-3 years",
  "2-5": "3-5 years",
  "3-5": "3-5 years",
  "5-10": "5+ years",
  "5+": "5+ years",
  "10+": "5+ years",
};

type Driver = {
  id: string;
  name: string;
  licenseClass: string;
  experience: string;
  state: string;
  about: string;
  phone: string;
  email: string;
  driverType: string;
  cdlNumber: string;
  zipCode: string;
  homeAddress: string;
  dateOfBirth: string;
  hasAccidents: boolean | null;
  wantsContact: boolean | null;
};

type DriverRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  license_class: string | null;
  years_exp: string | null;
  license_state: string | null;
  about: string | null;
  phone?: string | null;
  driver_type?: string | null;
  cdl_number?: string | null;
  zip_code?: string | null;
  home_address?: string | null;
  date_of_birth?: string | null;
  has_accidents?: boolean | null;
  wants_contact?: boolean | null;
};

const DRIVER_PAGE_SIZE = 12;

const Drivers = () => {
  usePageTitle("Browse CDL Drivers — Hire Qualified Truck Drivers");
  useMetaDescription("Access a directory of qualified CDL drivers looking for work. Filter by license class, experience, and state to find your next hire.");
  useCanonical("/drivers");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const isCompany = user?.role === "company";
  const { data: subscription, isLoading: loadingSub } = useSubscription(isCompany ? user?.id : undefined);
  const hasUnlimited = isAdmin || subscription?.plan === "unlimited";

  const { data: companyProfile, isLoading: loadingProfile } = useQuery({
    queryKey: ["company-profile-verified", user?.id],
    enabled: !!user?.id && isCompany,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_profiles")
        .select("is_verified, decline_reason")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const companyDataLoading = isCompany && (loadingSub || loadingProfile);
  const isVerifiedCompany = isCompany && (companyProfile?.is_verified === true) && !companyProfile?.decline_reason;

  const [classFilter, setClassFilter] = useState("All");
  const [expFilter, setExpFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  // Fetch saved drivers from DB
  const { data: savedDriverIds = [] } = useQuery({
    queryKey: ["saved-drivers", user?.id],
    enabled: !!user && hasUnlimited,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_drivers")
        .select("driver_id")
        .eq("company_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.driver_id);
    },
  });

  // Migrate localStorage favorites to DB on first load
  useEffect(() => {
    if (!user || !hasUnlimited) return;
    const lsKey = `company-driver-favorites-${user.id}`;
    const raw = localStorage.getItem(lsKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const ids = parsed.filter((id): id is string => typeof id === "string");
      if (ids.length === 0) return;
      // Upsert to DB then clear localStorage
      const rows = ids.map((driver_id) => ({ company_id: user.id, driver_id }));
      supabase.from("saved_drivers").upsert(rows, { onConflict: "company_id,driver_id" }).then(() => {
        localStorage.removeItem(lsKey);
        queryClient.invalidateQueries({ queryKey: ["saved-drivers", user.id] });
      });
    } catch { /* ignore */ }
  }, [user, hasUnlimited, queryClient]);

  const toggleSaved = useMutation({
    mutationFn: async (driverId: string) => {
      const isSaved = savedDriverIds.includes(driverId);
      if (isSaved) {
        const { error } = await supabase
          .from("saved_drivers")
          .delete()
          .eq("company_id", user!.id)
          .eq("driver_id", driverId);
        if (error) throw error;
        return { driverId, action: "removed" as const };
      } else {
        const { error } = await supabase
          .from("saved_drivers")
          .insert({ company_id: user!.id, driver_id: driverId });
        if (error) throw error;
        return { driverId, action: "saved" as const };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["saved-drivers", user!.id] });
      toast.success(result.action === "saved" ? "Driver saved" : "Removed from saved drivers");
    },
    onError: () => toast.error("Failed to update saved drivers"),
  });

  const { data: drivers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["driver-directory", user?.id, hasUnlimited],
    enabled: !!user && hasUnlimited,
    refetchOnMount: "always",
    queryFn: async () => {
      // Admins and unlimited companies query full driver_profiles
      // to show phone/email contact info (RLS policy grants access)
      const { data, error } = await supabase
        .from("driver_profiles")
        .select("id, first_name, last_name, license_class, years_exp, license_state, about, phone, driver_type, cdl_number, zip_code, home_address, date_of_birth, has_accidents, wants_contact, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // For unlimited companies, also fetch email from profiles table
      const profileEmails = new Map<string, string>();
      if (data && data.length > 0) {
        const ids = data.map((d: DriverRow) => d.id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", ids);
        for (const p of profiles ?? []) {
          if (p.email) profileEmails.set(p.id, p.email);
        }
      }

      return (((data as DriverRow[] | null) ?? []).map((row) => {
        const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
        const normalizedState = (row.license_state ?? "").trim();
        return {
          id: row.id,
          name: fullName || "Unnamed Driver",
          licenseClass: LICENSE_CLASS_LABELS[row.license_class ?? ""] ?? "Not specified",
          experience: YEARS_EXP_LABELS[row.years_exp ?? ""] ?? "Not specified",
          state: normalizedState || "Not specified",
          about: row.about ?? "",
          phone: row.phone ?? "",
          email: profileEmails.get(row.id) ?? "",
          driverType: row.driver_type ?? "",
          cdlNumber: row.cdl_number ?? "",
          zipCode: row.zip_code ?? "",
          homeAddress: row.home_address ?? "",
          dateOfBirth: row.date_of_birth ?? "",
          hasAccidents: row.has_accidents ?? null,
          wantsContact: row.wants_contact ?? null,
        };
      })) as Driver[];
    },
  });

  const licenseStates = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          drivers
            .map((driver) => driver.state.trim())
            .filter((s): s is string => !!s && s !== "Not specified"),
        ),
      ).sort(),
    ],
    [drivers],
  );

  const handleClear = () => {
    setClassFilter("All");
    setExpFilter("All");
    setStateFilter("All");
    setShowSavedOnly(false);
    setPage(0);
  };

  const filtered = drivers.filter((driver) => {
    if (showSavedOnly && !savedDriverIds.includes(driver.id)) return false;
    if (classFilter !== "All" && driver.licenseClass !== classFilter) return false;
    if (expFilter !== "All" && driver.experience !== expFilter) return false;
    if (stateFilter !== "All" && driver.state !== stateFilter) return false;
    return true;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl">
          <div className="flex justify-center py-20"><Spinner /></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (companyDataLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl flex justify-center pt-32">
          <Spinner />
        </main>
        <Footer />
      </div>
    );
  }

  if (!user || !hasUnlimited || (isCompany && !isVerifiedCompany)) {
    const isDriverUser = user?.role === "driver";
    const isCompanyNoUnlimited = isCompany && !hasUnlimited;
    const isCompanyNotVerified = isCompany && hasUnlimited && !isVerifiedCompany;
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl">
          <PageBreadcrumb items={[{ label: "Main", to: "/" }, { label: "Drivers" }]} />
          <div className="border border-border bg-card">
            <div className="border-l-4 border-l-primary border-b border-b-border px-5 py-4">
              <h1 className="font-display font-bold text-xl">Driver Directory</h1>
              <p className="text-sm text-muted-foreground mt-1">Browse CDL driver profiles</p>
            </div>
            <div className="px-5 py-12 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Lock className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-display font-semibold text-lg">
                  {isCompanyNotVerified ? "Verification Required" : isCompanyNoUnlimited ? "Unlimited Plan Required" : "Company Access Only"}
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {isCompanyNotVerified
                    ? "Your company account must be verified before you can access the driver directory. Please wait for admin approval."
                    : isCompanyNoUnlimited
                      ? "The driver directory is exclusively available to companies on the Unlimited plan. Upgrade your subscription to browse driver profiles with full contact information."
                      : isDriverUser
                        ? "The driver directory is available to company accounts only. Your driver account does not have access to this section."
                        : "The driver directory is available to company accounts with an Unlimited plan. Sign in or register as a company to get started."}
                </p>
              </div>
              {isCompanyNoUnlimited && (
                <Button asChild className="mt-2">
                  <Link to="/pricing">Upgrade to Unlimited</Link>
                </Button>
              )}
              {!user && (
                <div className="flex gap-3 mt-2">
                  <Button asChild>
                    <Link to="/signin">Sign In as Company</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/apply">Apply as Driver</Link>
                  </Button>
                </div>
              )}
              {isDriverUser && (
                <Button asChild className="mt-2">
                  <Link to="/driver-dashboard">Go to My Dashboard</Link>
                </Button>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8">
        <PageBreadcrumb items={[{ label: "Main", to: "/" }, { label: "Drivers" }]} />

        <div className="flex items-center gap-3 border-l-4 border-primary pl-3 mb-6">
          <h1 className="font-display text-2xl font-bold">Driver Directory</h1>
        </div>

        <div className="bg-foreground text-background dark:bg-muted dark:text-foreground border border-border mb-6">
          <div className="px-5 py-3 border-b border-white/10 dark:border-border">
            <h2 className="font-display font-bold text-base">Filter drivers</h2>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide opacity-70 block mb-1.5">License Class:</label>
                <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(0); }}>
                  <SelectTrigger className="bg-background/10 border-white/20 dark:bg-background dark:border-border text-inherit">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LICENSE_CLASSES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "All" ? "All" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide opacity-70 block mb-1.5">Years Experience:</label>
                <Select value={expFilter} onValueChange={(v) => { setExpFilter(v); setPage(0); }}>
                  <SelectTrigger className="bg-background/10 border-white/20 dark:bg-background dark:border-border text-inherit">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "All" ? "All" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide opacity-70 block mb-1.5">License State:</label>
                <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(0); }}>
                  <SelectTrigger className="bg-background/10 border-white/20 dark:bg-background dark:border-border text-inherit">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    {licenseStates.filter(Boolean).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "All" ? "All" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 items-center">
              <Button
                variant={showSavedOnly ? "default" : "outline"}
                onClick={() => { setShowSavedOnly((v) => !v); setPage(0); }}
                className={showSavedOnly ? "" : "border-border"}
              >
                <Bookmark className="h-4 w-4 mr-1.5" fill={showSavedOnly ? "currentColor" : "none"} />
                Saved Drivers{savedDriverIds.length > 0 && ` (${savedDriverIds.length})`}
              </Button>
              <Button
                variant="outline"
                onClick={handleClear}
                className="border-border"
              >
                Clear filter
              </Button>
            </div>
          </div>
        </div>

        <div className="border border-border bg-card">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <div className="w-1 h-5 bg-primary shrink-0" />
            <h2 className="font-display font-bold text-base">
              {showSavedOnly ? "Saved Drivers" : "Drivers"} {!isLoading && <span className="text-muted-foreground font-normal text-sm ml-1">({filtered.length} found)</span>}
            </h2>
          </div>

          {isLoading ? (
            <div className="px-5 py-12 flex justify-center"><Spinner /></div>
          ) : isError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-destructive mb-3">
                {(error as Error).message || "Failed to load drivers."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              heading={drivers.length === 0 ? "No registered drivers yet." : "No drivers match the selected filters."}
            />
          ) : (() => {
            const pageItems = filtered.slice(page * DRIVER_PAGE_SIZE, (page + 1) * DRIVER_PAGE_SIZE);
            return (
            <>
            <div className="divide-y divide-border">
              {pageItems.map((driver) => (
                <div key={driver.id} className="px-5 py-5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <button
                      className="font-display font-semibold text-primary underline hover:opacity-80 text-left truncate max-w-xs"
                      onClick={() => navigate(`/drivers/${driver.id}`)}
                    >
                      {driver.name}
                    </button>
                    <button
                      onClick={() => toggleSaved.mutate(driver.id)}
                      type="button"
                      disabled={toggleSaved.isPending}
                      aria-pressed={savedDriverIds.includes(driver.id)}
                      aria-label={savedDriverIds.includes(driver.id) ? "Remove from saved" : "Save driver"}
                      className={`p-1 transition-colors ${
                        savedDriverIds.includes(driver.id)
                          ? "text-accent"
                          : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      <Heart className="h-5 w-5" fill={savedDriverIds.includes(driver.id) ? "currentColor" : "none"} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-sm mb-3">
                    {driver.driverType && (
                      <p className="text-muted-foreground">
                        Type: <span className="text-primary font-medium">{driver.driverType}</span>
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      License Class: <span className="text-primary font-medium">{driver.licenseClass}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Years Exp: <span className="text-primary font-medium">{driver.experience}</span>
                    </p>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-primary font-medium">{driver.state}</span>
                    </p>
                    {driver.cdlNumber && (
                      <p className="text-muted-foreground">
                        CDL#: <span className="text-primary font-medium">{driver.cdlNumber}</span>
                      </p>
                    )}
                    {driver.zipCode && (
                      <p className="text-muted-foreground">
                        Zip: <span className="text-primary font-medium">{driver.zipCode}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
                    {driver.phone && (
                      <a href={`tel:${driver.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {driver.phone}
                      </a>
                    )}
                    {driver.email && (
                      <a href={`mailto:${driver.email}`} className="flex items-center gap-1 text-primary hover:underline">
                        <Mail className="h-3.5 w-3.5" />
                        {driver.email}
                      </a>
                    )}
                    {driver.homeAddress && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {driver.homeAddress}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {driver.about || "No profile summary provided yet."}
                  </p>

                  <Button
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2 text-xs"
                    onClick={() => navigate(`/drivers/${driver.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View profile
                  </Button>
                </div>
              ))}
            </div>
            <ListPagination
              page={page}
              totalItems={filtered.length}
              pageSize={DRIVER_PAGE_SIZE}
              onPageChange={setPage}
            />
            </>
            );
          })()}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Drivers;
