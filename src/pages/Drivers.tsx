import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Heart, Lock, Users } from "lucide-react";
import { useAuth } from "@/context/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListPagination } from "@/components/ListPagination";

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
};

type DriverRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  license_class: string | null;
  years_exp: string | null;
  license_state: string | null;
  about: string | null;
};

const DRIVER_PAGE_SIZE = 12;

const Drivers = () => {
  usePageTitle("Browse CDL Drivers");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [classFilter, setClassFilter] = useState("All");
  const [expFilter, setExpFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [page, setPage] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoritesKey = user ? `company-driver-favorites-${user.id}` : "";

  useEffect(() => {
    if (!favoritesKey) return;
    try {
      const raw = localStorage.getItem(favoritesKey);
      if (!raw) {
        setFavorites([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavorites(parsed.filter((id): id is string => typeof id === "string"));
      } else {
        setFavorites([]);
      }
    } catch {
      setFavorites([]);
    }
  }, [favoritesKey]);

  useEffect(() => {
    if (!favoritesKey) return;
    localStorage.setItem(favoritesKey, JSON.stringify(favorites));
  }, [favorites, favoritesKey]);

  const { data: drivers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["driver-directory", user?.id],
    enabled: !!user && (user.role === "company" || user.role === "admin"),
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_profiles_safe")
        .select("id, first_name, last_name, license_class, years_exp, license_state, about, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;

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
    setPage(0);
  };

  const toggleFavorite = (id: string) => {
    const isSaved = favorites.includes(id);
    setFavorites((prev) => (isSaved ? prev.filter((f) => f !== id) : [...prev, id]));
    toast.success(isSaved ? "Removed from saved drivers" : "Saved driver");
  };

  const filtered = drivers.filter((driver) => {
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

  if (!user || (user.role !== "company" && user.role !== "admin")) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl">
          <p className="text-sm text-muted-foreground mb-6">
            <Link to="/" className="text-primary underline hover:opacity-80">
              Main
            </Link>
            <span className="mx-1">»</span>
            Drivers
          </p>
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
                <p className="font-display font-semibold text-lg">Company Access Only</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {user?.role === "driver"
                    ? "The driver directory is available to company and admin accounts only. Your driver account does not have access to this section."
                    : "The driver directory is available to company and admin accounts. Sign in or register as a company to browse driver profiles."}
                </p>
              </div>
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
              {user?.role === "driver" && (
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
        <p className="text-sm text-muted-foreground mb-4">
          <Link to="/" className="text-primary underline hover:opacity-80">
            Main
          </Link>
          <span className="mx-1">»</span>
          Drivers
        </p>

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
            <div className="flex gap-3">
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
              Drivers {!isLoading && <span className="text-muted-foreground font-normal text-sm ml-1">({filtered.length} found)</span>}
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
                      onClick={() => toggleFavorite(driver.id)}
                      type="button"
                      aria-pressed={favorites.includes(driver.id)}
                      aria-label={favorites.includes(driver.id) ? "Remove from favorites" : "Add to favorites"}
                      className={`p-1 transition-colors ${
                        favorites.includes(driver.id)
                          ? "text-accent"
                          : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      <Heart className="h-5 w-5" fill={favorites.includes(driver.id) ? "currentColor" : "none"} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-sm mb-4">
                    <p className="text-muted-foreground">
                      License Class: <span className="text-primary font-medium">{driver.licenseClass}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Years Experience: <span className="text-primary font-medium">{driver.experience}</span>
                    </p>
                    <p className="text-muted-foreground">
                      License State: <span className="text-primary font-medium">{driver.state}</span>
                    </p>
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
