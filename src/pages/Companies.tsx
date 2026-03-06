import { useState } from "react";
import { usePageTitle, useMetaDescription, useCanonical } from "@/hooks/usePageTitle";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";
import { PageBreadcrumb } from "@/components/ui/PageBreadcrumb";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, MapPin, CheckCircle, Building2, ExternalLink, Search, Filter, ShieldCheck, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/ListPagination";

interface CompanyRow {
  id: string;
  company_name: string;
  phone: string;
  address: string;
  email: string;
  website: string | null;
  about: string | null;
  logo_url: string | null;
  is_verified: boolean;
}

const COMPANY_STATES = [
  "All",
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

const PAGE_SIZE = 12;

const Companies = () => {
  usePageTitle("Trucking Companies Hiring CDL Drivers");
  useMetaDescription("Browse verified trucking companies hiring CDL drivers. Find carriers by state, read company details, and apply directly through CDL Jobs Center.");
  useCanonical("/companies");
  const [stateFilter, setStateFilter] = useState("All");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  const {
    data: companies = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["companies-directory-v2"],
    retry: 1,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_profiles")
        .select("id, company_name, phone, address, email, website, about, logo_url, is_verified")
        .eq("is_verified", true)
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const hasActiveFilters = stateFilter !== "All" || verifiedOnly || searchQuery.trim() !== "";

  const handleClear = () => {
    setStateFilter("All");
    setVerifiedOnly(false);
    setSearchQuery("");
    setPage(0);
  };

  // Filter companies by state, verified, and search query — verified first
  const filtered = companies.filter((c) => {
    // Hide companies that haven't set up their profile yet
    if (!c.company_name || !c.company_name.trim()) return false;
    if (stateFilter !== "All" && !c.address?.includes(stateFilter)) return false;
    if (verifiedOnly && !c.is_verified) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = c.company_name?.toLowerCase().includes(q);
      const matchesAddress = c.address?.toLowerCase().includes(q);
      if (!matchesName && !matchesAddress) return false;
    }
    return true;
  }).sort((a, b) => {
    // Verified companies always show first
    if (a.is_verified && !b.is_verified) return -1;
    if (!a.is_verified && b.is_verified) return 1;
    return (a.company_name ?? "").localeCompare(b.company_name ?? "");
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8">
        {/* Breadcrumb */}
        <PageBreadcrumb items={[{ label: "Main", to: "/" }, { label: "Companies" }]} />

        {/* Page heading */}
        <div className="flex items-center gap-3 border-l-4 border-primary pl-3 mb-6">
          <h1 className="font-display text-2xl font-bold">Company Directory</h1>
        </div>

        {/* Filter bar */}
        <div className="border border-border bg-card mb-6">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display font-bold text-base">Filter Companies</h2>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              {/* Search */}
              <div className="w-full sm:w-64 space-y-1">
                <label htmlFor="companies-search" className="text-xs font-medium text-muted-foreground">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="companies-search"
                    placeholder="Company name or location..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* State */}
              <div className="w-full sm:w-48 space-y-1">
                <label htmlFor="companies-state" className="text-xs font-medium text-muted-foreground">State</label>
                <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(0); }} name="stateFilter">
                  <SelectTrigger id="companies-state">
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_STATES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o === "All" ? "All states" : o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Verified toggle */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground block">Verified</span>
                <Button
                  variant={verifiedOnly ? "default" : "outline"}
                  onClick={() => { setVerifiedOnly((v) => !v); setPage(0); }}
                  className={verifiedOnly
                    ? "gap-1.5 h-10 bg-green-600 hover:bg-green-700 text-white"
                    : "gap-1.5 h-10"
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  Verified only
                </Button>
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1 text-muted-foreground hover:text-foreground sm:self-end">
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="border border-border bg-card">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <div className="w-1 h-5 bg-primary shrink-0" />
            <h2 className="font-display font-bold text-base">
              Companies{" "}
              {!isLoading && (
                <span className="text-muted-foreground font-normal text-sm ml-1">
                  ({filtered.length} found)
                </span>
              )}
            </h2>
          </div>

          {isLoading ? (
            <div className="px-5 py-12 flex justify-center">
              <Spinner />
            </div>
          ) : isError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-destructive mb-3">
                {error instanceof Error ? error.message : "Failed to load companies."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Building2} heading="No companies match the selected filters." />
          ) : (() => {
            const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            return (
            <>
            <div className="divide-y divide-border">
              {pageItems.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-5 px-5 py-5 border-l-2 border-l-primary hover:bg-muted/20 transition-colors"
                >
                  {/* Logo */}
                  <div className="shrink-0 flex flex-col items-center gap-2 w-24">
                    {c.logo_url ? (
                      <img
                        src={c.logo_url}
                        alt={c.company_name}
                        loading="lazy"
                        width={80}
                        height={80}
                        className="h-20 w-20 object-cover border border-border"
                      />
                    ) : (
                      <div className="h-20 w-20 bg-muted flex items-center justify-center font-display text-3xl font-bold text-primary border border-border">
                        {c.company_name?.charAt(0) || <Building2 className="h-8 w-8" />}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/companies/${c.id}`}
                      className="font-display font-semibold text-primary underline hover:opacity-80 text-left mb-1.5 block truncate"
                    >
                      {c.company_name}
                    </Link>
                    {c.phone && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {c.phone}
                      </p>
                    )}
                    {c.address && (
                      <p className="flex items-start gap-1.5 text-sm text-muted-foreground mb-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="line-clamp-1">{c.address}</span>
                      </p>
                    )}
                    {c.website && (
                      <a
                        href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-primary underline hover:opacity-80 mb-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {c.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                    {c.is_verified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" aria-hidden="true" />{" "}
                        VERIFIED COMPANY
                      </span>
                    )}
                  </div>

                  {/* Action */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    asChild
                  >
                    <Link to={`/companies/${c.id}`}>View Profile</Link>
                  </Button>
                </div>
              ))}
            </div>
            <ListPagination
              page={page}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
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

export default Companies;
