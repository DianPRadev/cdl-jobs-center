import { useParams, Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, ExternalLink, Truck, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useJobById } from "@/hooks/useJobs";
import { useAuth } from "@/context/auth";
import { useDriverJobMatchScore, useMatchingRollout } from "@/hooks/useMatchScores";
import { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ApplyModal } from "@/components/ApplyModal";
import { SignInModal } from "@/components/SignInModal";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui/Spinner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const validId = id && UUID_RE.test(id);
  const { job, isLoading, isError } = useJobById(validId ? id : undefined);
  const [applyOpen, setApplyOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { data: matchScore } = useDriverJobMatchScore(user?.role === "driver" ? user.id : undefined, id);
  const { data: rollout } = useMatchingRollout();
  usePageTitle(job ? `${job.title} at ${job.company}` : "Job Details");

  // Fetch company profile (phone, address, website, logo)
  const { data: companyProfile } = useQuery({
    queryKey: ["company_profile_detail", job?.companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("company_profiles")
        .select("phone, address, website, logo_url")
        .eq("id", job!.companyId!)
        .maybeSingle();
      return data;
    },
    enabled: !!job?.companyId,
  });

  // Check if current driver already applied to this job
  const isDriver = user?.role === "driver";
  const { data: hasApplied = false } = useQuery({
    queryKey: ["has-applied-job", user?.id, id],
    refetchOnMount: "always",
    queryFn: async () => {
      const { count, error } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("driver_id", user!.id)
        .eq("job_id", id!);
      if (error) return false;
      return (count ?? 0) > 0;
    },
    enabled: !!isDriver && !!id,
  });

  useEffect(() => {
    if (!validId) {
      toast.error("Job not found.");
      navigate("/jobs", { replace: true });
      return;
    }
    if (!isLoading && !isError && !job) {
      toast.error("Job not found.");
      navigate("/jobs", { replace: true });
    }
  }, [validId, job, isLoading, isError, navigate]);

  if (isLoading && !isError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-4xl">
          <div className="flex justify-center py-20"><Spinner /></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-4xl text-center">
          <p className="text-sm text-destructive mb-3">Failed to load job details.</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/jobs">Back to Jobs</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (!job) return null;

  const companyLogo = job.logoUrl ?? companyProfile?.logo_url;

  const handleApplyClick = () => {
    if (!user) {
      setSignInOpen(true);
    } else if (user.role === "company") {
      toast.info("Company accounts cannot submit driver applications.");
    } else {
      setApplyOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8 max-w-4xl">
        {/* Breadcrumb + Back */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
            <span className="mx-1">»</span>
            <Link to="/jobs" className="text-primary underline hover:opacity-80">jobs</Link>
            <span className="mx-1">»</span>
            {job.title}
          </p>
          <button
            type="button"
            onClick={() => { window.history.length > 1 ? navigate(-1) : navigate("/jobs"); }}
            className="inline-flex items-center gap-1.5 text-primary hover:text-primary/70 transition-colors shrink-0 text-sm font-medium"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
        </div>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4 border-l-4 border-primary pl-3">
          <h1 className="font-display text-2xl font-bold">{job.title}</h1>
        </div>

        {/* Header card */}
        <div className="border border-border bg-card p-5 mb-4">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Logo */}
            <div className="shrink-0 h-20 w-20 bg-muted flex items-center justify-center font-display text-3xl font-bold text-primary border border-border overflow-hidden">
              {companyLogo ? (
                <img src={companyLogo} alt={job.company} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span>{job.company.charAt(0)}</span>
              )}
            </div>

            {/* Company info */}
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-primary text-lg mb-2 truncate">
                {job.company}
              </h2>
              {companyProfile?.phone && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {companyProfile.phone}
                </p>
              )}
              {companyProfile?.address && (
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground mb-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                  {companyProfile.address}
                </p>
              )}
              {companyProfile?.website && companyProfile.website.startsWith("http") && (
                <a
                  href={companyProfile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary underline hover:opacity-80"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Visit Company Website
                </a>
              )}
            </div>

            {/* Apply button */}
            <div className="shrink-0">
              {hasApplied ? (
                <Button variant="outline" size="lg" disabled>
                  Already Applied
                </Button>
              ) : (
                <Button onClick={handleApplyClick} size="lg">
                  Submit an Application
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Job details bar */}
        <div className="border border-border bg-card p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Driver Type</span>
            <span className="font-medium text-primary">{job.driverType || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Freight Type</span>
            <span className="font-medium text-primary">{job.type || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Route Type</span>
            <span className="font-medium text-primary">{job.routeType || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Team Driving</span>
            <span className="font-medium text-primary">{job.teamDriving || "—"}</span>
          </div>
        </div>

        {/* Pay + location bar */}
        <div className="border border-border bg-card p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Location</span>
            <span className="font-medium">{job.location || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Pay</span>
            <span className="font-medium text-green-600 dark:text-green-400">{job.pay || "—"}</span>
          </div>
        </div>

        {/* Why This Matches You */}
        {rollout?.driverUiEnabled && !rollout.shadowMode && matchScore && user?.role === "driver" && (() => {
          const scorePct = Math.round(matchScore.overallScore);
          const scoreColor =
            scorePct >= 70
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : scorePct >= 40
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
          const barColor =
            scorePct >= 70
              ? "bg-green-500"
              : scorePct >= 40
              ? "bg-amber-500"
              : "bg-red-500";
          return (
            <div className="border border-border bg-card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-base">Why This Matches You</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scoreColor}`}>
                  {scorePct}% Match
                </span>
              </div>
              {matchScore.topReasons.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {matchScore.topReasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span>{reason.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {matchScore.cautions.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {matchScore.cautions.map((caution, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>{caution.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${scorePct}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Description */}
        <div className="border border-border bg-card p-5 mb-4">
          <h3 className="font-display font-semibold text-base mb-3">Job Description</h3>
          <hr className="border-primary/20 mb-4" />
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{job.description}</p>
        </div>

        {/* Info panel for guests / company users */}
        {(!user || user.role !== "driver") && (
          <div className="border border-border bg-blue-50/50 dark:bg-blue-950/20 p-5">
            <h3 className="font-semibold text-sm mb-2">Information</h3>
            {!user ? (
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong className="text-foreground">Guests</strong> are not allowed to submit applications.
                </p>
                <Button size="sm" onClick={() => setSignInOpen(true)}>Sign in</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Company accounts cannot submit driver applications.</p>
            )}
          </div>
        )}
      </main>
      <Footer />

      {applyOpen && (
        <ApplyModal
          companyName={job.company}
          companyId={job.companyId}
          jobId={job.id}
          jobTitle={job.title}
          onClose={() => setApplyOpen(false)}
        />
      )}
      {signInOpen && (
        <SignInModal onClose={() => setSignInOpen(false)} />
      )}
    </div>
  );
};

export default JobDetail;
