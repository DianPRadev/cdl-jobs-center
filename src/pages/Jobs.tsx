import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useSearchParams } from "react-router-dom";
import { Truck, Bookmark, BookmarkCheck, Search, MapPin, DollarSign } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useActiveJobs } from "@/hooks/useJobs";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useAuth } from "@/context/auth";
import { useDriverAllJobMatches, useMatchingRollout } from "@/hooks/useMatchScores";
import { useDriverProfile, type DriverProfile } from "@/hooks/useDriverProfile";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { Job } from "@/data/jobs";
import { toast } from "sonner";

const urlTypeMap: Record<string, string> = {
  "dry-van": "Dry Van",
  "flatbed": "Flatbed",
  "dry-bulk": "Dry Bulk",
  "refrigerated": "Refrigerated",
  "tanker": "Tanker",
  "teams": "Teams",
  "owner-operator": "Owner Operator",
  "students": "Students",
};

const PAGE_SIZE = 10;

const INTEREST_MATCH: Record<string, (j: Job) => boolean> = {
  "Lease purchase": (j) => j.driverType?.toLowerCase().includes("lease") ?? false,
  "Company driver": (j) => j.driverType === "Company Driver",
  "Owner operator": (j) => j.driverType === "Owner Operator",
  "Team driving": (j) => j.teamDriving === "Team" || j.teamDriving === "Both",
  "Local routes": (j) => j.routeType === "Local",
  "Regional routes": (j) => j.routeType === "Regional",
  "OTR (Over the road)": (j) => j.routeType === "OTR",
};

function isPreferenceMatch(job: Job, profile: DriverProfile | null): boolean {
  if (!profile) return false;
  if (profile.interestedIn && INTEREST_MATCH[profile.interestedIn]) {
    return INTEREST_MATCH[profile.interestedIn](job);
  }
  return false;
}

const Jobs = () => {
  usePageTitle("Browse Jobs");
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { jobs: allActiveJobs, error: jobsError, refetch: refetchJobs } = useActiveJobs();
  const driverId = user?.role === "driver" ? user.id : "";
  const { savedIds, isSaved, toggle } = useSavedJobs(driverId);
  const { data: matchScoreMap } = useDriverAllJobMatches(user?.role === "driver" ? user.id : undefined);
  const { data: rollout } = useMatchingRollout();
  const { profile: driverProfile } = useDriverProfile(driverId);

  // Initialize all filters from URL params on first render
  const initialFreight = (() => {
    const type = searchParams.get("type");
    const freight = searchParams.get("freight");
    return (type && urlTypeMap[type]) ? urlTypeMap[type] : (freight ?? "all");
  })();

  const [freightType, setFreightType] = useState(initialFreight);
  const [driverType, setDriverType] = useState(searchParams.get("driver") ?? "all");
  const [routeType, setRouteType] = useState(searchParams.get("route") ?? "all");
  const [teamDriving, setTeamDriving] = useState(searchParams.get("team") ?? "all");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(0);

  // Sync URL params → filter state (e.g. when Navbar job-type links change the URL)
  useEffect(() => {
    const type = searchParams.get("type");
    const freight = searchParams.get("freight");
    const nextFreight = (type && urlTypeMap[type]) ? urlTypeMap[type] : (freight ?? "all");
    if (nextFreight !== freightType) {
      setFreightType(nextFreight);
      setPage(0);
    }
  }, [searchParams, freightType]);

  // Sync a filter change to URL
  const updateParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete("type"); // clean up old slug format from nav links
      if (value === "all" || value === "") p.delete(key);
      else p.set(key, value);
      return p;
    }, { replace: true });
  };

  const setFreight = (v: string) => { setFreightType(v); setPage(0); updateParam("freight", v); };
  const setDriver = (v: string) => { setDriverType(v); setPage(0); updateParam("driver", v); };
  const setRoute = (v: string) => { setRouteType(v); setPage(0); updateParam("route", v); };
  const setTeam = (v: string) => { setTeamDriving(v); setPage(0); updateParam("team", v); };
  const setSearch = (v: string) => { setSearchQuery(v); setPage(0); updateParam("q", v); };

  const resetFilters = () => {
    setFreightType("all");
    setDriverType("all");
    setRouteType("all");
    setTeamDriving("all");
    setSearchQuery("");
    setSortBy("newest");
    setPage(0);
    setSearchParams({}, { replace: true });
  };

  const filtered = useMemo(() => {
    let result = allActiveJobs.filter((j) => {
      const matchesFreight = freightType === "all" || j.type === freightType;
      const matchesDriver = driverType === "all" || j.driverType === driverType;
      const matchesRoute = routeType === "all" || j.routeType === routeType;
      const matchesTeam = teamDriving === "all" || j.teamDriving === teamDriving;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || [j.title, j.company, j.location, j.description, j.type]
        .some((f) => f?.toLowerCase().includes(q));
      return matchesFreight && matchesDriver && matchesRoute && matchesTeam && matchesSearch;
    });

    if (sortBy === "company-az") result = [...result].sort((a, b) => a.company.localeCompare(b.company));
    else if (sortBy === "company-za") result = [...result].sort((a, b) => b.company.localeCompare(a.company));
    else if (sortBy === "title-az") result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "best-match" && matchScoreMap) {
      result = [...result].sort((a, b) => {
        const scoreA = matchScoreMap.get(a.id) ?? -1;
        const scoreB = matchScoreMap.get(b.id) ?? -1;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [allActiveJobs, freightType, driverType, routeType, teamDriving, searchQuery, sortBy, matchScoreMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleToggleSave = async (id: string, company: string) => {
    if (!user || user.role !== "driver") {
      toast.error("Sign in as a driver to save jobs.");
      return;
    }
    const wasSaved = isSaved(id);
    await toggle(id);
    toast.success(wasSaved ? `Removed from saved jobs` : `Saved ${company}`);
  };

  const pageTitle = freightType !== "all" ? freightType : "All Jobs";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto py-6">
        {/* Breadcrumb */}
        <p className="text-sm text-muted-foreground mb-4">
          <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
          <span className="mx-1">»</span>
          <Link to="/jobs" className="text-primary underline hover:opacity-80">jobs</Link>
          {freightType !== "all" && (
            <>
              <span className="mx-1">»</span>
              <span>{freightType}</span>
            </>
          )}
        </p>

        {/* Page title + sort */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 border-l-4 border-primary pl-3">
            <h1 className="font-display text-2xl font-bold">{pageTitle}</h1>
            <span className="text-sm text-muted-foreground">({filtered.length} jobs)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">Sort:</span>
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(0); }} name="sortBy">
              <SelectTrigger id="jobs-sortBy" aria-label="Sort jobs" className="w-44 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Default</SelectItem>
                {user?.role === "driver" && rollout?.driverUiEnabled && (
                  <SelectItem value="best-match">Best Match</SelectItem>
                )}
                <SelectItem value="company-az">Company A–Z</SelectItem>
                <SelectItem value="company-za">Company Z–A</SelectItem>
                <SelectItem value="title-az">Title A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Sidebar filter */}
          <div className="w-full lg:w-72 shrink-0 border border-border">
            <div className="bg-foreground text-background dark:bg-muted dark:text-foreground px-4 py-3 border-l-4 border-primary">
              <p className="font-semibold text-sm">Filter jobs</p>
            </div>
            <div className="p-4 space-y-4">

              {/* Keyword search */}
              <div>
                <label htmlFor="jobs-search" className="text-sm text-foreground font-medium block mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="jobs-search"
                    name="search"
                    placeholder="Company, title, location..."
                    value={searchQuery}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Driver Type */}
              <div>
                <label htmlFor="jobs-driverType" className="text-sm text-foreground font-medium block mb-1">Driver Type</label>
                <Select value={driverType} onValueChange={setDriver} name="driverType">
                  <SelectTrigger id="jobs-driverType" className="w-full">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Owner Operator">Owner Operator</SelectItem>
                    <SelectItem value="Company Driver">Company Driver</SelectItem>
                    <SelectItem value="Student">Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Freight Type */}
              <div>
                <label htmlFor="jobs-freightType" className="text-sm text-foreground font-medium block mb-1">Freight Type</label>
                <Select value={freightType} onValueChange={setFreight} name="freightType">
                  <SelectTrigger id="jobs-freightType" className="w-full">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Box">Box</SelectItem>
                    <SelectItem value="Car Hauler">Car Hauler</SelectItem>
                    <SelectItem value="Drop and Hook">Drop and Hook</SelectItem>
                    <SelectItem value="Dry Bulk">Dry Bulk</SelectItem>
                    <SelectItem value="Dry Van">Dry Van</SelectItem>
                    <SelectItem value="Flatbed">Flatbed</SelectItem>
                    <SelectItem value="Hopper Bottom">Hopper Bottom</SelectItem>
                    <SelectItem value="Intermodal">Intermodal</SelectItem>
                    <SelectItem value="Oil Field">Oil Field</SelectItem>
                    <SelectItem value="Oversize Load">Oversize Load</SelectItem>
                    <SelectItem value="Refrigerated">Refrigerated</SelectItem>
                    <SelectItem value="Tanker">Tanker</SelectItem>
                    <SelectItem value="Yard Spotter">Yard Spotter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Route Type */}
              <div>
                <label htmlFor="jobs-routeType" className="text-sm text-foreground font-medium block mb-1">Route Type</label>
                <Select value={routeType} onValueChange={setRoute} name="routeType">
                  <SelectTrigger id="jobs-routeType" className="w-full">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Dedicated">Dedicated</SelectItem>
                    <SelectItem value="Local">Local</SelectItem>
                    <SelectItem value="LTL">LTL</SelectItem>
                    <SelectItem value="OTR">OTR</SelectItem>
                    <SelectItem value="Regional">Regional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Team Driving */}
              <div>
                <label htmlFor="jobs-teamDriving" className="text-sm text-foreground font-medium block mb-1">Team Driving</label>
                <Select value={teamDriving} onValueChange={setTeam} name="teamDriving">
                  <SelectTrigger id="jobs-teamDriving" className="w-full">
                    <SelectValue placeholder="Choose an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Solo">Solo</SelectItem>
                    <SelectItem value="Team">Team</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset button */}
              <div className="pt-2">
                <Button
                  onClick={resetFilters}
                  variant="outline"
                  className="w-full"
                >
                  Reset Filters
                </Button>
              </div>
            </div>
          </div>

          {/* Job listings */}
          <div className="flex-1 space-y-4">
            {paginated.length > 0 ? (
              <>
                {paginated.map((job) => {
                  const saved = savedIds.includes(job.id);
                  return (
                    <div key={job.id} className="border border-border bg-card p-5 flex flex-col sm:flex-row gap-4 transition-shadow hover:shadow-md hover:border-primary/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <h2 className="font-display font-semibold text-lg text-foreground truncate">{job.title}</h2>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <span className="text-sm text-primary font-medium">{job.company}</span>
                              {user?.role === "driver" && rollout?.driverUiEnabled && matchScoreMap?.has(job.id) ? (() => {
                                const score = Math.round(matchScoreMap.get(job.id)!);
                                const badgeColor =
                                  score >= 70
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : score >= 40
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                    : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
                                return (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
                                    {score}% Match
                                  </span>
                                );
                              })() : user?.role === "driver" && isPreferenceMatch(job, driverProfile) && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                  Matches your preferences
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleSave(job.id, job.company)}
                            aria-label={saved ? "Remove from saved" : "Save job"}
                            className={`shrink-0 p-1 transition-colors ${saved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                          >
                            {saved ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                          </button>
                        </div>
                        {(job.location || job.pay) && (
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2 flex-wrap">
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                {job.location}
                              </span>
                            )}
                            {job.pay && (
                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                                {job.pay}
                              </span>
                            )}
                          </div>
                        )}
                        <hr className="border-border mb-2" />
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{job.description}</p>
                      </div>
                      <div className="flex flex-col items-stretch gap-3 shrink-0 w-36">
                        <Button asChild className="w-full">
                          <Link to={`/jobs/${job.id}`}>View Job</Link>
                        </Button>
                        <div className="h-14 w-full border border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                          {job.logoUrl ? (
                            <img src={job.logoUrl} alt={job.company} loading="lazy" className="h-full w-full object-contain p-1" />
                          ) : (
                            <Truck className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination */}
                {totalPages > 1 && (() => {
                  const pages: (number | "...")[] = [];
                  if (totalPages <= 7) {
                    for (let i = 0; i < totalPages; i++) pages.push(i);
                  } else {
                    pages.push(0);
                    if (page > 2) pages.push("...");
                    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i);
                    if (page < totalPages - 3) pages.push("...");
                    pages.push(totalPages - 1);
                  }
                  return (
                    <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
                      <span className="text-sm text-muted-foreground">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(page - 1)}
                          disabled={page === 0}
                        >
                          Previous
                        </Button>
                        {pages.map((p, idx) =>
                          p === "..." ? (
                            <span key={`ellipsis-${idx}`} className="w-9 flex items-center justify-center text-sm text-muted-foreground">...</span>
                          ) : (
                            <Button
                              key={p}
                              variant={p === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => goToPage(p)}
                              className="w-9"
                              aria-label={`Page ${p + 1}`}
                              aria-current={p === page ? "page" : undefined}
                            >
                              {p + 1}
                            </Button>
                          )
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(page + 1)}
                          disabled={page >= totalPages - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : jobsError ? (
              <div className="border border-destructive/30 bg-destructive/5 p-12 text-center rounded-lg">
                <p className="text-destructive font-medium mb-3">Failed to load jobs. Please try again later.</p>
                <Button variant="outline" size="sm" onClick={() => refetchJobs()}>Try again</Button>
              </div>
            ) : (
              <div className="border border-border bg-card p-12 text-center">
                <Truck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No jobs match your filters.</p>
                <button onClick={resetFilters} className="mt-3 text-primary text-sm underline hover:opacity-80">
                  Reset all filters
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Jobs;
