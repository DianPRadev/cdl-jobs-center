import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useParams, Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, CheckCircle, ExternalLink, Mail, Building2, Briefcase, MapPinned, DollarSign } from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApplyModal } from "@/components/ApplyModal";
import { SignInModal } from "@/components/SignInModal";
import EasyApplyDialog from "@/components/EasyApplyDialog";
import { Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/Spinner";

interface CompanyData {
  id: string;
  company_name: string;
  email: string;
  phone: string;
  address: string;
  about: string | null;
  website: string | null;
  logo_url: string | null;
  is_verified: boolean;
}

interface JobRow {
  id: string;
  title: string;
  location: string;
  pay: string;
  route_type: string;
  driver_type: string;
  type: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CompanyProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const validId = id && UUID_RE.test(id);
  const [applyOpen, setApplyOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  // Fetch company profile from Supabase
  const { data: company, isLoading, isError } = useQuery({
    queryKey: ["company-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_profiles")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as CompanyData | null;
    },
    enabled: !!validId,
  });

  // Check if current driver already applied to this company
  const isDriver = user?.role === "driver";
  const { data: hasApplied = false } = useQuery({
    queryKey: ["has-applied", user?.id, id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("driver_id", user!.id)
        .eq("company_id", id!);
      if (error) return false;
      return (count ?? 0) > 0;
    },
    enabled: !!isDriver && !!validId,
  });

  usePageTitle(company?.company_name ?? "Company Profile");

  // Fetch company's active jobs
  const { data: jobs = [] } = useQuery({
    queryKey: ["company-jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, location, pay, route_type, driver_type, type")
        .eq("company_id", id!)
        .eq("status", "Active")
        .order("posted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
    enabled: !!validId,
  });

  useEffect(() => {
    if (!validId) {
      toast.error("Company not found.");
      navigate("/companies", { replace: true });
      return;
    }
    if (!isLoading && !isError && !company) {
      toast.error("Company not found.");
      navigate("/companies", { replace: true });
    }
  }, [validId, isLoading, isError, company, navigate]);

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
          <p className="text-sm text-destructive mb-3">Failed to load company profile.</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/companies">Back to Companies</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (!company) return null;

  const isOwnProfile = user?.role === "company" && user.id === id;

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
        {/* Breadcrumb */}
        <p className="text-sm text-muted-foreground mb-6">
          <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
          <span className="mx-1">»</span>
          <Link to="/companies" className="text-primary underline hover:opacity-80">Companies</Link>
          <span className="mx-1">»</span>
          {company.company_name}
        </p>

        {/* Hero header */}
        <div className="border border-border bg-card mb-6">
          <div className="p-6 flex flex-col sm:flex-row items-start gap-6">
            {/* Logo */}
            <div className="shrink-0 h-24 w-24 rounded-lg bg-muted flex items-center justify-center border border-border overflow-hidden">
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.company_name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-10 w-10 text-primary" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-2xl text-foreground mb-3">
                {company.company_name}
              </h1>
              <div className="space-y-1.5">
                {company.phone && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0 text-primary" />
                    {company.phone}
                  </p>
                )}
                {company.address && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    {company.address}
                  </p>
                )}
                {company.email && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0 text-primary" />
                    {company.email}
                  </p>
                )}
                {company.website && (
                  <a
                    href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary underline hover:opacity-80"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    Visit Website
                  </a>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex flex-col items-end gap-3">
              {company.is_verified && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 text-xs font-medium rounded-full">
                  <CheckCircle className="h-3.5 w-3.5" /> VERIFIED COMPANY
                </span>
              )}
              {isOwnProfile ? (
                <Button asChild>
                  <Link to="/dashboard">Edit Profile</Link>
                </Button>
              ) : hasApplied ? (
                <Button variant="outline" disabled>
                  Already Applied
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button onClick={handleApplyClick}>
                    Submit an Application
                  </Button>
                  {user?.role === "driver" && (
                    <EasyApplyDialog
                      companyName={company.company_name}
                      trigger={
                        <Button variant="outline" size="sm" className="w-full">
                          <Zap className="h-3.5 w-3.5 mr-1.5" />
                          Easy Apply
                        </Button>
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* About */}
        {company.about && (
          <div className="border border-border bg-card p-6 mb-6">
            <h2 className="font-display font-semibold text-base border-l-4 border-primary pl-3 mb-4">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {company.about}
            </p>
          </div>
        )}

        {/* Active Jobs */}
        <div className="border border-border bg-card mb-6">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <h2 className="font-display font-semibold text-base border-l-4 border-primary pl-3">
              Active Jobs
              <span className="text-muted-foreground font-normal text-sm ml-2">({jobs.length})</span>
            </h2>
          </div>
          {jobs.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">
              <Briefcase className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              No active jobs posted yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{job.title}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPinned className="h-3 w-3" />{job.location}
                        </span>
                      )}
                      {job.pay && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />{job.pay}
                        </span>
                      )}
                      {job.route_type && <span>{job.route_type}</span>}
                      {job.driver_type && <span>{job.driver_type}</span>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0">View Job</Button>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Info panel for guests */}
        {!user && (
          <div className="border border-border bg-blue-50/50 dark:bg-blue-950/20 p-5">
            <h2 className="font-semibold text-sm mb-2">Information</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Sign in as a driver to submit an application to this company.
            </p>
            <Button size="sm" onClick={() => setSignInOpen(true)}>Sign In</Button>
          </div>
        )}
      </main>
      <Footer />

      {applyOpen && (
        <ApplyModal companyName={company.company_name} companyId={id} onClose={() => setApplyOpen(false)} />
      )}
      {signInOpen && (
        <SignInModal onClose={() => setSignInOpen(false)} />
      )}
    </div>
  );
};

export default CompanyProfile;
