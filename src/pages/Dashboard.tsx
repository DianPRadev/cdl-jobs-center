import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, type User as AuthUser } from "@/context/auth";
import { useJobs } from "@/hooks/useJobs";
import { Job } from "@/data/jobs";
import { COMPANY_GOALS } from "@/data/constants";
import { toast } from "sonner";
import { Pencil, Trash2, ChevronDown, ChevronUp, Plus, X, Upload, Bell, MessageSquare, Users, Phone as PhoneIcon, Mail as MailIcon, MapPin, Truck as TruckIcon, Lock, RefreshCw, CreditCard, Send, Briefcase, Check, Sparkles, CheckCircle, ShieldCheck, FileText, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { ChatPanel } from "@/components/ChatPanel";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { useUnreadCount } from "@/hooks/useMessages";
import { useLeads, useUpdateLeadStatus, useSyncLeads } from "@/hooks/useLeads";
import { useSubscription, useCancelSubscription, PLANS, type Plan } from "@/hooks/useSubscription";
import { useCompanyDriverMatches, useMatchingRollout } from "@/hooks/useMatchScores";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/dateUtils";
import { withTimeout } from "@/lib/withTimeout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { useVerificationRequest } from "@/hooks/useVerification";
import { ListPagination } from "@/components/ListPagination";

const FREIGHT_TYPES = [
  "Box", "Car Hauler", "Drop and Hook", "Dry Bulk", "Dry Van", "Flatbed",
  "Hopper Bottom", "Intermodal", "Oil Field", "Oversize Load",
  "Refrigerated", "Tanker", "Yard Spotter", "Owner Operator", "Students", "Teams",
];

const DRIVER_TYPES = ["Owner Operator", "Company Driver", "Student"];
const ROUTE_TYPES = ["OTR", "Local", "Regional", "Dedicated", "LTL"];
const TEAM_OPTIONS = ["Solo", "Team", "Both"];
const JOB_STATUSES = ["Draft", "Active", "Paused", "Closed"] as const;

type PipelineStage = "New" | "Reviewing" | "Interview" | "Hired" | "Rejected";
type SaveStatus = "idle" | "saving" | "saved";

type CompanyProfileForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  about: string;
  website: string;
  logo: string;
  contactName: string;
  contactTitle: string;
  companyGoal: string;
};

const snapshotCompanyProfile = (p: CompanyProfileForm) =>
  JSON.stringify({
    name: p.name,
    email: p.email,
    phone: p.phone,
    address: p.address,
    about: p.about,
    website: p.website,
    logo: p.logo,
    contactName: p.contactName,
    contactTitle: p.contactTitle,
    companyGoal: p.companyGoal,
  });

const PIPELINE_STAGES: Array<{ label: PipelineStage; headerClass: string }> = [
  { label: "New",       headerClass: "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600" },
  { label: "Reviewing", headerClass: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" },
  { label: "Interview", headerClass: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" },
  { label: "Hired",     headerClass: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" },
  { label: "Rejected",  headerClass: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" },
];

const JOB_STATUS_BADGE: Record<string, string> = {
  Draft:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Paused: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  Closed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
};

interface ReceivedApplication {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  driverType: string;
  yearsExp: string;
  licenseClass: string;
  licenseState: string;
  cdlNumber: string;
  soloTeam: string;
  notes: string;
  prefs: Record<string, boolean>;
  endorse: Record<string, boolean>;
  hauler: Record<string, boolean>;
  route: Record<string, boolean>;
  extra: Record<string, boolean>;
  companyName: string;
  submittedAt: string;
  availableDate: string;
  pipeline_stage: PipelineStage;
}

// Map Supabase row → ReceivedApplication
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToApp(row: Record<string, any>): ReceivedApplication {
  return {
    id: row.id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    driverType: row.driver_type ?? "",
    yearsExp: row.years_exp ?? "",
    licenseClass: row.license_class ?? "",
    licenseState: row.license_state ?? "",
    cdlNumber: row.cdl_number ?? "",
    soloTeam: row.solo_team ?? "Solo",
    notes: row.notes ?? "",
    prefs: row.prefs ?? {},
    endorse: row.endorse ?? {},
    hauler: row.hauler ?? {},
    route: row.route ?? {},
    extra: row.extra ?? {},
    companyName: row.company_name ?? "",
    submittedAt: row.submitted_at ?? "",
    availableDate: row.available_date ?? "",
    pipeline_stage: (row.pipeline_stage ?? "New") as PipelineStage,
  };
}

const EMPTY_FORM = {
  title: "",
  driverType: "",
  type: "",
  routeType: "",
  teamDriving: "Solo",
  location: "",
  pay: "",
  description: "",
  status: "Active" as "Active" | "Draft" | "Paused" | "Closed",
};

type Tab = "jobs" | "applications" | "pipeline" | "profile" | "analytics" | "messages" | "leads" | "hired" | "subscription" | "ai-matches";
const isCompanyTab = (value: string | null): value is Tab =>
  value === "jobs" ||
  value === "applications" ||
  value === "pipeline" ||
  value === "profile" ||
  value === "analytics" ||
  value === "messages" ||
  value === "leads" ||
  value === "hired" ||
  value === "subscription" ||
  value === "ai-matches";

// ── Application card with expand/collapse ────────────────────────────────────
const AppCard = ({
  app,
  isHighlighted = false,
  autoOpenToken,
}: {
  app: ReceivedApplication;
  isHighlighted?: boolean;
  autoOpenToken?: number;
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpenToken !== undefined) {
      setOpen(true);
    }
  }, [autoOpenToken]);

  const flaggedToggles = (map: Record<string, boolean>) =>
    Object.entries(map)
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/([A-Z])/g, " $1").trim())
      .join(", ") || "None";

  return (
    <div
      id={`company-application-${app.id}`}
      className={`border bg-card transition-colors ${isHighlighted ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">
            {app.firstName} {app.lastName}
          </p>
          <p className="text-sm text-muted-foreground">
            {app.email} · {app.phone}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Driver Type: {app.driverType || "—"} · Experience: {app.yearsExp || "—"} · License: {app.licenseClass || "—"} ({app.licenseState || "—"})
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">
            {app.submittedAt ? formatDate(app.submittedAt) : "—"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="flex items-center gap-1.5">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Collapse" : "View Details"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3 text-sm">
          <div className="grid sm:grid-cols-2 gap-2">
            <p><span className="text-muted-foreground">Solo/Team:</span> {app.soloTeam}</p>
            <p><span className="text-muted-foreground">CDL #:</span> {app.cdlNumber || "—"}</p>
            {app.availableDate && (
              <p><span className="text-muted-foreground">Available:</span> {formatDate(app.availableDate)}</p>
            )}
          </div>
          <p><span className="text-muted-foreground">Job Preferences:</span> {flaggedToggles(app.prefs ?? {})}</p>
          <p><span className="text-muted-foreground">Endorsements:</span> {flaggedToggles(app.endorse ?? {})}</p>
          <p><span className="text-muted-foreground">Hauler Experience:</span> {flaggedToggles(app.hauler ?? {})}</p>
          <p><span className="text-muted-foreground">Route Preference:</span> {flaggedToggles(app.route ?? {})}</p>
          {app.notes && (
            <p><span className="text-muted-foreground">Notes:</span> {app.notes}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Pipeline draggable card ───────────────────────────────────────────────────
const PipelineCard = ({
  app,
  stage,
  onStageChange,
  isDragOverlay = false,
}: {
  app: ReceivedApplication;
  stage: PipelineStage;
  onStageChange: (s: PipelineStage) => void;
  isDragOverlay?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(!isDragOverlay ? listeners : {})}
      {...(!isDragOverlay ? attributes : {})}
      className={`border border-border bg-card p-3 space-y-2 select-none transition-opacity touch-none ${
        isDragging ? "opacity-30" : "opacity-100"
      } ${isDragOverlay ? "shadow-2xl -rotate-1 opacity-95 cursor-grabbing" : "cursor-grab active:cursor-grabbing"}`}
    >
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground leading-tight">
            {app.firstName} {app.lastName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {app.driverType || "Driver"}{app.yearsExp ? ` · ${app.yearsExp} exp` : ""}
          </p>
          {app.submittedAt && (
            <p className="text-xs text-muted-foreground">
              Applied {formatDate(app.submittedAt)}
            </p>
          )}
          {app.availableDate && (
            <p className="text-xs text-muted-foreground">
              Available {formatDate(app.availableDate)}
            </p>
          )}
        </div>
      </div>
      {!isDragOverlay && (
        <Select value={stage} onValueChange={(v) => onStageChange(v as PipelineStage)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["New", "Reviewing", "Interview", "Hired", "Rejected"] as PipelineStage[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

// ── Pipeline droppable column ─────────────────────────────────────────────────
const PipelineColumn = ({
  label,
  headerClass,
  apps,
  onStageChange,
}: {
  label: PipelineStage;
  headerClass: string;
  apps: ReceivedApplication[];
  onStageChange: (appId: string, s: PipelineStage) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: label });
  return (
    <div className="flex-1" style={{ minWidth: "200px" }}>
      <div className={`border ${headerClass} px-3 py-2 flex items-center justify-between mb-2`}>
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs bg-foreground/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full font-medium">
          {apps.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`scrollbar-thin space-y-2 min-h-[120px] max-h-[540px] overflow-y-auto p-1 rounded-sm transition-colors ${
          isOver ? "bg-primary/5 ring-1 ring-primary/30" : ""
        }`}
      >
        {apps.length === 0 ? (
          <div className={`border border-dashed p-4 text-center text-xs text-muted-foreground transition-colors ${
            isOver ? "border-primary/50 text-primary" : "border-border"
          }`}>
            {isOver ? "Drop here" : "Empty"}
          </div>
        ) : (
          apps.map((app) => (
            <PipelineCard
              key={app.id}
              app={app}
              stage={app.pipeline_stage}
              onStageChange={(s) => onStageChange(app.id, s)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ── AI Matches content (extracted so hook is only called when tab is active) ──
const AI_MATCH_PAGE_SIZE = 10;

const AiMatchesContent = ({
  userId,
  activeJobs,
  aiJobFilter,
  setAiJobFilter,
  aiSourceFilter,
  setAiSourceFilter,
  matchLimit,
  currentPlan,
  switchTab,
}: {
  userId: string;
  activeJobs: Job[];
  aiJobFilter: string;
  setAiJobFilter: (v: string) => void;
  aiSourceFilter: string;
  setAiSourceFilter: (v: string) => void;
  matchLimit: number;
  currentPlan: string;
  switchTab: (tab: Tab) => void;
}) => {
  const [aiPage, setAiPage] = useState(0);
  const [aiSearch, setAiSearch] = useState("");
  const {
    data: matches = [],
    isLoading: matchesLoading,
    isError: matchesError,
  } = useCompanyDriverMatches(userId, {
    jobId: aiJobFilter !== "all" ? aiJobFilter : undefined,
    source: aiSourceFilter !== "all" ? (aiSourceFilter as "application" | "lead") : undefined,
    limit: matchLimit,
  });

  // Client-side search filter
  const filteredMatches = aiSearch.trim()
    ? matches.filter((m) => {
        const q = aiSearch.toLowerCase();
        return (
          m.candidateName?.toLowerCase().includes(q) ||
          m.candidateEmail?.toLowerCase().includes(q) ||
          m.candidatePhone?.toLowerCase().includes(q) ||
          m.candidateState?.toLowerCase().includes(q) ||
          m.candidateDriverType?.toLowerCase().includes(q) ||
          m.candidateLicenseClass?.toLowerCase().includes(q)
        );
      })
    : matches;

  const scoreBadgeClass = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (score >= 60) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (score >= 40) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  };

  return (
    <div>
      <h2 className="font-display font-semibold text-base mb-4">
        AI-Matched Candidates
      </h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Select value={aiJobFilter} onValueChange={(v) => { setAiJobFilter(v); setAiPage(0); }}>
          <SelectTrigger className="w-[220px] h-9 text-sm">
            <SelectValue placeholder="All Jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {activeJobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={aiSourceFilter} onValueChange={(v) => { setAiSourceFilter(v); setAiPage(0); }}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="application">Applications</SelectItem>
            <SelectItem value="lead">Leads</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search candidates..."
            value={aiSearch}
            onChange={(e) => { setAiSearch(e.target.value); setAiPage(0); }}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Results */}
      {matchesLoading && !matchesError ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : matchesError ? (
        <div className="border border-border bg-card p-8 text-center">
          <p className="text-sm text-destructive mb-1">Failed to load matches.</p>
          <p className="text-xs text-muted-foreground">Please refresh the page to try again.</p>
        </div>
      ) : filteredMatches.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          heading={aiSearch.trim() ? "No candidates match your search." : "No matches found"}
          description={aiSearch.trim() ? undefined : "Post a job to start getting AI-matched candidates."}
        />
      ) : (() => {
        const pageMatches = filteredMatches.slice(aiPage * AI_MATCH_PAGE_SIZE, (aiPage + 1) * AI_MATCH_PAGE_SIZE);
        return (
        <>
        <div className="space-y-3">
          {pageMatches.map((m) => (
            <div key={`${m.candidateId}-${m.candidateSource}`} className="border border-border bg-card px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-full ${scoreBadgeClass(m.overallScore)}`}>
                      {m.overallScore}%
                    </span>
                    <p className="font-semibold text-foreground">{m.candidateName || "Unknown"}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      m.candidateSource === "application"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>
                      {m.candidateSource === "application" ? "Application" : "Lead"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[
                      m.candidateDriverType && `${m.candidateDriverType}`,
                      m.candidateLicenseClass && `CDL ${m.candidateLicenseClass}`,
                      m.candidateYearsExp && `${m.candidateYearsExp} exp`,
                      m.candidateState && m.candidateState,
                    ].filter(Boolean).join(" · ") || "No details available"}
                  </p>
                  {m.topReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.topReasons.slice(0, 2).map((r, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                          r.positive
                            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                        }`}>
                          {r.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.candidateSource === "application" ? (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => switchTab("applications")}>
                      View
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => switchTab("leads")}>
                      View
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => switchTab("messages")}>
                    <MessageSquare className="h-3 w-3 mr-1" /> Message
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <ListPagination
          page={aiPage}
          totalItems={filteredMatches.length}
          pageSize={AI_MATCH_PAGE_SIZE}
          onPageChange={setAiPage}
        />
        </>
        );
      })()}

      {/* Plan gating banner */}
      {(currentPlan === "free" || currentPlan === "starter") && filteredMatches.length > 0 && (
        <div className="mt-4 border border-border bg-amber-50 dark:bg-amber-950/30 px-5 py-3 flex items-center justify-between">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Showing top {filteredMatches.length} of available matches.{" "}
            <Link to="/pricing" className="font-medium underline hover:no-underline">
              Upgrade to see all candidates.
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  usePageTitle("Company Dashboard");
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || user.role !== "company")) {
      toast.error("Dashboard is available for company accounts only.");
      navigate("/");
    }
  }, [loading, user, navigate]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner />
    </div>
  );
  if (!user || user.role !== "company") return null;

  return <DashboardInner user={user} />;
};

// Inner component (only renders after auth is resolved and user is a company)
const DashboardInner = ({ user }: { user: AuthUser }) => {
  const qc = useQueryClient();
  const { jobs, addJob, updateJob, removeJob } = useJobs(user!.id);
  const { data: unreadMsgCount = 0 } = useUnreadCount(user!.id, "company");
  const {
    data: leads = [],
    isLoading: leadsLoading,
    isError: leadsIsError,
    error: leadsError,
    refetch: refetchLeads,
  } = useLeads(user!.id);
  const updateLeadStatus = useUpdateLeadStatus();
  const syncLeads = useSyncLeads();
  const { data: subscription } = useSubscription(user!.id);
  const cancelSubscription = useCancelSubscription();
  const rollout = useMatchingRollout();
  const [portalLoading, setPortalLoading] = useState(false);
  const [resubscribeOpen, setResubscribeOpen] = useState(false);
  const [selectedResub, setSelectedResub] = useState<Plan | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);

  const handleCheckout = async (plan: Plan) => {
    const planInfo = PLANS[plan];
    if (!planInfo.priceId) {
      toast.error("This plan is not available for purchase.");
      return;
    }
    try {
      setCheckoutLoading(plan);
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), 10_000);
      if (!session) { navigate("/signin"); return; }

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `Checkout failed (${res.status})`);
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "AbortError"
        ? "Request timed out. Please try again."
        : err instanceof Error ? err.message : "Failed to start checkout";
      toast.error(msg);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const leadLimit = subscription ? PLANS[subscription.plan].leads : 3;

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    if (isCompanyTab(t)) return t;
    return "jobs";
  });
  const [focusedApplicationId, setFocusedApplicationId] = useState<string | null>(() => {
    const tab = searchParams.get("tab");
    if (tab === "applications") {
      return searchParams.get("app");
    }
    return null;
  });
  const [autoOpenApplicationToken, setAutoOpenApplicationToken] = useState(0);
  const lastAutoScrollAppIdRef = useRef<string | null>(null);
  const [initialChatAppId, setInitialChatAppId] = useState<string | null>(() => searchParams.get("app"));
  const [initialChatDriverId, setInitialChatDriverId] = useState<string | null>(() => searchParams.get("driver"));
  const [appPage, setAppPage] = useState(0);
  const [leadPage, setLeadPage] = useState(0);
  const [jobPage, setJobPage] = useState(0);
  const [leadStateFilter, setLeadStateFilter] = useState("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState<"all" | "owner-op" | "company">("all");
  const [contactLeadId, setContactLeadId] = useState<string | null>(null);
  const [sendApplyLeadId, setSendApplyLeadId] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissedSearch, setDismissedSearch] = useState("");
  const [dismissedPage, setDismissedPage] = useState(0);
  const APP_PAGE_SIZE = 10;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [savingJob, setSavingJob] = useState(false);
  const [aiJobFilter, setAiJobFilter] = useState<string>("all");
  const [aiSourceFilter, setAiSourceFilter] = useState<string>("all");

  // Lightweight count query that runs regardless of active tab so the tab badge always shows
  const MATCH_LIMITS: Record<string, number> = { free: 3, starter: 25, growth: 100, unlimited: 9999 };
  const aiMatchLimit = MATCH_LIMITS[subscription?.plan ?? "free"] ?? 3;
  const { data: aiMatchCount = null } = useQuery({
    queryKey: ["company-match-count", user!.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_driver_match_scores")
        .select("candidate_driver_id, candidate_id, candidate_source")
        .eq("company_id", user!.id);
      if (!data || data.length === 0) return 0;
      // Deduplicate by person identity (same logic as useCompanyDriverMatches)
      const seen = new Set<string>();
      for (const row of data) {
        seen.add(`${row.candidate_driver_id ?? row.candidate_id}:${row.candidate_source}`);
      }
      return Math.min(seen.size, aiMatchLimit);
    },
  });

  // Consume deep-link app/driver params from URL so navbar notification links work.
  // Keep ?tab= in the URL so refresh stays on the same tab.
  // When navigating to /dashboard with no ?tab=, reset to "jobs".
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (!tabFromUrl) {
      setActiveTab("jobs");
      return;
    }
    if (!isCompanyTab(tabFromUrl)) return;
    const appFromUrl = searchParams.get("app");
    const driverFromUrl = searchParams.get("driver");

    setActiveTab(tabFromUrl);
    if (tabFromUrl === "messages") {
      // Preserve one-time deep-link IDs after we strip query params from URL.
      // If we overwrite with null on the follow-up render, ChatPanel can't
      // preselect the target conversation.
      if (appFromUrl) setInitialChatAppId(appFromUrl);
      if (driverFromUrl) setInitialChatDriverId(driverFromUrl);
    } else if (tabFromUrl === "applications") {
      setFocusedApplicationId(appFromUrl);
      if (appFromUrl) {
        setAutoOpenApplicationToken((prev) => prev + 1);
        lastAutoScrollAppIdRef.current = null;
      }
    }

    // Only strip the one-time deep-link params (app, driver), keep ?tab=
    if (appFromUrl || driverFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.delete("app");
      next.delete("driver");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Company profile state
  const [profileName, setProfileName] = useState(user!.name);
  const [profileEmail, setProfileEmail] = useState(user!.email ?? "");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileLogo, setProfileLogo] = useState("");
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const currentProfileSnapshot = snapshotCompanyProfile({
    name: profileName,
    email: profileEmail,
    phone: profilePhone,
    address: profileAddress,
    about: profileAbout,
    website: profileWebsite,
    logo: profileLogo,
    contactName,
    contactTitle,
    companyGoal,
  });
  const hasUnsavedChanges = lastSavedSnapshot !== null && currentProfileSnapshot !== lastSavedSnapshot;
  const isProfileSaved = profileSaveStatus === "saved" && !hasUnsavedChanges;

  // Verification request state (status only — form is on /verification page)
  const { data: verificationRequest, isLoading: verificationLoading } = useVerificationRequest(user!.id);

  // Fetch applications for this company
  const appsKey = ["company-applications", user!.id];
  const { data: applications = [], refetch: refetchApps } = useQuery({
    queryKey: appsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("company_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToApp);
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (activeTab !== "applications" || !focusedApplicationId || applications.length === 0) return;

    const targetIndex = applications.findIndex((app) => app.id === focusedApplicationId);
    if (targetIndex < 0) return;

    const targetPage = Math.floor(targetIndex / APP_PAGE_SIZE);
    if (targetPage !== appPage) {
      setAppPage(targetPage);
      return;
    }

    if (lastAutoScrollAppIdRef.current === focusedApplicationId) return;

    const targetEl = document.getElementById(`company-application-${focusedApplicationId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      lastAutoScrollAppIdRef.current = focusedApplicationId;
    }
  }, [activeTab, focusedApplicationId, applications, appPage]);

  // Load company profile on mount
  useEffect(() => {
    Promise.resolve(
      supabase
        .from("company_profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle()
    ).then(({ data }) => {
        const loadedProfile: CompanyProfileForm = {
          name: data?.company_name ?? user!.name,
          email: data?.email ?? user!.email ?? "",
          phone: data?.phone ?? "",
          address: data?.address ?? "",
          about: data?.about ?? "",
          website: data?.website ?? "",
          logo: data?.logo_url ?? "",
          contactName: data?.contact_name ?? "",
          contactTitle: data?.contact_title ?? "",
          companyGoal: data?.company_goal ?? "",
        };
        setProfileName(loadedProfile.name);
        setProfileEmail(loadedProfile.email);
        setProfilePhone(loadedProfile.phone);
        setProfileAddress(loadedProfile.address);
        setProfileAbout(loadedProfile.about);
        setProfileWebsite(loadedProfile.website);
        setProfileLogo(loadedProfile.logo);
        setContactName(loadedProfile.contactName);
        setContactTitle(loadedProfile.contactTitle);
        setCompanyGoal(loadedProfile.companyGoal);
        setLastSavedSnapshot(snapshotCompanyProfile(loadedProfile));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (profileSaveStatus === "saved" && hasUnsavedChanges) {
      setProfileSaveStatus("idle");
    }
  }, [profileSaveStatus, hasUnsavedChanges]);

  // Post-checkout success handling
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      toast.success("Payment successful! Your subscription is now active.");
      const next = new URLSearchParams(searchParams);
      next.delete("session_id");
      setSearchParams(next, { replace: true });
      qc.invalidateQueries({ queryKey: ["subscription"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormChange = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const openNewForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (job: Job) => {
    setForm({
      title: job.title,
      driverType: job.driverType,
      type: job.type,
      routeType: job.routeType,
      teamDriving: job.teamDriving,
      location: job.location,
      pay: job.pay,
      description: job.description,
      status: job.status ?? "Active",
    });
    setEditingId(job.id);
    setShowForm(true);
  };

  const handleSaveJob = async () => {
    if (!form.title.trim()) { toast.error("Job title is required."); return; }
    setSavingJob(true);
    try {
      if (editingId) {
        await updateJob(editingId, { ...form });
        toast.success("Job updated.");
      } else {
        await addJob({ ...form, company: user!.name, companyName: user!.name });
        toast.success("Job posted successfully.");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? "Failed to save job.";
      toast.error(msg);
    } finally {
      setSavingJob(false);
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this job posting? This cannot be undone.")) return;
    try {
      await removeJob(id);
      toast.success("Job removed.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete job.");
    }
  };

  const handleQuickStatus = async (jobId: string, status: string) => {
    await updateJob(jobId, { status: status as Job["status"] });
  };

  const updateAppStage = async (appId: string, stage: PipelineStage) => {
    // Cancel in-flight queries to avoid stale data overwriting optimistic update
    await qc.cancelQueries({ queryKey: appsKey });
    // Optimistic local update
    qc.setQueryData<ReceivedApplication[]>(appsKey, (prev) =>
      (prev ?? []).map((a) => a.id === appId ? { ...a, pipeline_stage: stage } : a)
    );
    // Persist to DB
    const { error } = await supabase
      .from("applications")
      .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
      .eq("id", appId);
    if (error) {
      toast.error("Failed to update stage.");
      refetchApps();
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) { toast.error("Only image files are allowed (JPEG, PNG, WebP, GIF)."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB."); return; }
    const objectUrl = URL.createObjectURL(file);
    setCropImageSrc(objectUrl);
    e.target.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    setCropImageSrc(null);
    const path = `${user!.id}/logo.webp`;
    const { error } = await supabase.storage.from("company-logos").upload(path, blob, {
      upsert: true,
      contentType: "image/webp",
    });
    if (error) { toast.error("Upload failed: " + error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("company-logos").getPublicUrl(path);
    const newUrl = publicUrl + "?t=" + Date.now();
    setProfileLogo(newUrl);
    // Persist to DB immediately so navbar + public profile update without clicking Save
    await supabase.from("company_profiles").upsert({ id: user!.id, logo_url: newUrl, updated_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ["company-logo", user!.id] });
    toast.success("Logo updated.");
  };

  const handleRemoveLogo = async () => {
    setProfileLogo("");
    await supabase.from("company_profiles").upsert({ id: user!.id, logo_url: "", updated_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ["company-logo", user!.id] });
  };

  const handleSaveProfile = async () => {
    if (profileSaveStatus === "saving" || !hasUnsavedChanges) return;
    setProfileSaveStatus("saving");
    try {
      const payload = {
        id: user!.id,
        company_name: profileName,
        email: profileEmail,
        phone: profilePhone,
        address: profileAddress,
        about: profileAbout,
        website: profileWebsite,
        logo_url: profileLogo || "",
        contact_name: contactName,
        contact_title: contactTitle,
        company_goal: companyGoal,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("company_profiles").upsert(payload);
      if (error) throw error;
      setLastSavedSnapshot(currentProfileSnapshot);
      setProfileSaveStatus("saved");
      toast.success("Profile saved.");
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? "Failed to save profile.";
      setProfileSaveStatus("idle");
      toast.error(msg);
    }
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    // Persist tab in URL so a refresh stays on the same tab
    setSearchParams(tab === "jobs" ? {} : { tab }, { replace: true });
    if (tab !== "messages") {
      setInitialChatDriverId(null);
    }
    if (tab === "applications" || tab === "pipeline") {
      setAppPage(0);
      // Mark all current applications as "seen" so the navbar badge clears
      localStorage.setItem(`cdl-apps-seen-${user!.id}`, new Date().toISOString());
      qc.invalidateQueries({ queryKey: ["new-app-count", user!.id] });
    }
  };

  const tabClass = (tab: Tab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      activeTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
    }`;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8 max-w-[1400px]">
        {/* Breadcrumb */}
        <p className="text-sm text-muted-foreground mb-6">
          <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
          <span className="mx-1">»</span>
          Dashboard
        </p>

        {/* Welcome header */}
        <div className="bg-foreground text-background dark:bg-muted dark:text-foreground border border-border px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg">Welcome, {user!.name}</h1>
            <p className="text-sm opacity-70 mt-0.5">Company Dashboard</p>
          </div>
          {subscription && (
            <div className="text-right">
              <span className={`text-xs px-2 py-1 font-semibold rounded-full ${
                subscription.plan === "unlimited"
                  ? "bg-purple-500/20 text-purple-200"
                  : subscription.plan === "growth"
                  ? "bg-blue-500/20 text-blue-200"
                  : subscription.plan === "starter"
                  ? "bg-green-500/20 text-green-200"
                  : "bg-white/10 text-white/70 dark:bg-white/10 dark:text-white/70"
              }`}>
                {PLANS[subscription.plan].label} Plan
              </span>
              <p className="text-xs opacity-60 mt-1">
                {PLANS[subscription.plan].leads === 9999
                  ? "Unlimited leads"
                  : `${PLANS[subscription.plan].leads - subscription.leadsUsed}/${PLANS[subscription.plan].leads} leads remaining`}
              </p>
            </div>
          )}
        </div>

        {/* Verification status banner */}
        {!verificationLoading && verificationRequest?.status === "approved" && (
          <div className="flex items-center gap-4 px-5 py-3.5 mb-6 bg-green-500/10 border border-green-500/30">
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-green-700 dark:text-green-400">Your company is verified</p>
              <p className="text-xs text-muted-foreground">Drivers can see the verified badge on your profile and job listings.</p>
            </div>
          </div>
        )}
        {!verificationLoading && verificationRequest?.status === "pending" && (
          <div className="flex items-center gap-4 px-5 py-3.5 mb-6 bg-amber-500/10 border border-amber-500/30">
            <ShieldCheck className="h-6 w-6 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-amber-700 dark:text-amber-400">Verification under review</p>
              <p className="text-xs text-muted-foreground">Your request is being reviewed. We'll notify you once a decision is made.</p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/verification">View Details</Link>
            </Button>
          </div>
        )}
        {!verificationLoading && verificationRequest?.status !== "approved" && verificationRequest?.status !== "pending" && (
          <div className="flex items-center gap-4 px-5 py-3.5 mb-6 bg-amber-500/10 border border-amber-500/30">
            <ShieldCheck className="h-6 w-6 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Get your company verified</p>
              <p className="text-xs text-muted-foreground">
                {verificationRequest?.status === "rejected"
                  ? "Your previous request was not approved. You can submit a new one with updated information."
                  : "A verified badge builds trust with drivers and helps you stand out."}
              </p>
            </div>
            <Button size="sm" asChild>
              <Link to="/verification">{verificationRequest?.status === "rejected" ? "Resubmit" : "Request Verification"}</Link>
            </Button>
          </div>
        )}

        {/* New applications banner */}
        {(() => {
          const lastSeen = localStorage.getItem(`cdl-apps-seen-${user!.id}`) ?? "1970-01-01T00:00:00Z";
          const unseenCount = applications.filter((a) => a.submittedAt > lastSeen).length;
          if (unseenCount === 0) return null;
          return (
            <button
              onClick={() => switchTab("applications")}
              className="w-full flex items-center gap-3 px-5 py-3 mb-6 bg-primary/10 border border-primary/30 hover:bg-primary/15 transition-colors text-left"
            >
              <Bell className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">
                You have {unseenCount} new application{unseenCount > 1 ? "s" : ""} waiting for review
              </span>
              <span className="ml-auto text-xs text-primary font-medium">View &rarr;</span>
            </button>
          );
        })()}

        {/* Tab bar */}
        <div className="border-b border-border mb-6 flex overflow-x-auto scrollbar-hide relative" role="tablist" style={{ scrollbarWidth: "none" }}>
          <button className={tabClass("jobs")} onClick={() => switchTab("jobs")} role="tab" aria-selected={activeTab === "jobs"}>
            My Jobs ({jobs.length})
          </button>
          <button className={tabClass("applications")} onClick={() => switchTab("applications")} role="tab" aria-selected={activeTab === "applications"}>
            Applications ({applications.length})
            {(() => {
              const lastSeen = localStorage.getItem(`cdl-apps-seen-${user!.id}`) ?? "1970-01-01T00:00:00Z";
              const unseen = applications.filter((a) => a.submittedAt > lastSeen).length;
              if (unseen === 0) return null;
              return (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                  {unseen}
                </span>
              );
            })()}
          </button>
          <button className={tabClass("pipeline")} onClick={() => switchTab("pipeline")} role="tab" aria-selected={activeTab === "pipeline"}>
            Pipeline ({applications.length})
          </button>
          <button className={tabClass("ai-matches")} onClick={() => switchTab("ai-matches")} role="tab" aria-selected={activeTab === "ai-matches"}>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> AI Matches{aiMatchCount !== null ? ` (${aiMatchCount})` : ""}
            </span>
          </button>
          <button className={tabClass("messages")} onClick={() => switchTab("messages")} role="tab" aria-selected={activeTab === "messages"}>
            Messages
            {unreadMsgCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                {unreadMsgCount}
              </span>
            )}
          </button>
          <button className={tabClass("leads")} onClick={() => switchTab("leads")} role="tab" aria-selected={activeTab === "leads"}>
            Leads ({leads.filter((l) => l.status !== "dismissed" && l.status !== "hired").length})
            {(() => {
              const newCount = leads.filter((l) => l.status === "new").length;
              if (newCount === 0) return null;
              return (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white px-1">
                  {newCount}
                </span>
              );
            })()}
          </button>
          <button className={tabClass("hired")} onClick={() => switchTab("hired")} role="tab" aria-selected={activeTab === "hired"}>
            Hired ({leads.filter((l) => l.status === "hired").length})
          </button>
          <button className={tabClass("profile")} onClick={() => switchTab("profile")} role="tab" aria-selected={activeTab === "profile"}>
            Company Profile
          </button>
          <button className={tabClass("analytics")} onClick={() => switchTab("analytics")} role="tab" aria-selected={activeTab === "analytics"}>
            Analytics
          </button>
          <button className={tabClass("subscription")} onClick={() => switchTab("subscription")} role="tab" aria-selected={activeTab === "subscription"}>
            <span className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Subscription
            </span>
          </button>
        </div>

        {/* ── Tab: My Jobs ─────────────────────────────────────────────────── */}
        {activeTab === "jobs" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-base">
                My Job Postings
                <span className="text-muted-foreground font-normal text-sm ml-2">({jobs.length})</span>
              </h2>
              <Button size="sm" onClick={openNewForm} className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Post New Job
              </Button>
            </div>

            {/* Inline form */}
            {showForm && (
              <div className="border border-border bg-card p-5 mb-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">{editingId ? "Edit Job" : "New Job Posting"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1 hover:text-primary transition-colors" aria-label="Close">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="job-title" className="text-xs text-muted-foreground">Job Title *</Label>
                    <Input id="job-title" name="title" placeholder="e.g. OTR Dry Van Driver" value={form.title}
                      onChange={(e) => handleFormChange("title", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-driverType" className="text-xs text-muted-foreground">Driver Type</Label>
                    <Select value={form.driverType} onValueChange={(v) => handleFormChange("driverType", v)} name="driverType">
                      <SelectTrigger id="job-driverType"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{DRIVER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-freightType" className="text-xs text-muted-foreground">Freight Type</Label>
                    <Select value={form.type} onValueChange={(v) => handleFormChange("type", v)} name="freightType">
                      <SelectTrigger id="job-freightType"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{FREIGHT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-routeType" className="text-xs text-muted-foreground">Route Type</Label>
                    <Select value={form.routeType} onValueChange={(v) => handleFormChange("routeType", v)} name="routeType">
                      <SelectTrigger id="job-routeType"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{ROUTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-teamDriving" className="text-xs text-muted-foreground">Team Driving</Label>
                    <Select value={form.teamDriving} onValueChange={(v) => handleFormChange("teamDriving", v)} name="teamDriving">
                      <SelectTrigger id="job-teamDriving"><SelectValue /></SelectTrigger>
                      <SelectContent>{TEAM_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-location" className="text-xs text-muted-foreground">Location</Label>
                    <Input id="job-location" name="location" placeholder="e.g. Illinois or Nationwide" value={form.location}
                      onChange={(e) => handleFormChange("location", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-pay" className="text-xs text-muted-foreground">Pay</Label>
                    <Input id="job-pay" name="pay" placeholder="e.g. $0.65/mile or $1,500/week" value={form.pay}
                      onChange={(e) => handleFormChange("pay", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="job-status" className="text-xs text-muted-foreground">Status</Label>
                    <Select value={form.status} onValueChange={(v) => handleFormChange("status", v)} name="status">
                      <SelectTrigger id="job-status"><SelectValue /></SelectTrigger>
                      <SelectContent>{JOB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="job-description" className="text-xs text-muted-foreground">Description</Label>
                    <Textarea id="job-description" name="description" placeholder="Describe the position, requirements, and benefits..."
                      value={form.description} onChange={(e) => handleFormChange("description", e.target.value)}
                      rows={3} className="resize-none" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleSaveJob} size="sm" className="px-6" disabled={savingJob}>
                    {savingJob ? "Saving…" : editingId ? "Update Job" : "Save Job"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Job list */}
            {jobs.length === 0 ? (
              <div className="border border-border bg-card">
                <EmptyState
                  icon={Briefcase}
                  heading="No job postings yet"
                  description='Click "Post New Job" to get started.'
                />
              </div>
            ) : (() => {
              const JOB_PAGE_SIZE = 10;
              const pageJobs = jobs.slice(jobPage * JOB_PAGE_SIZE, (jobPage + 1) * JOB_PAGE_SIZE);
              return (
              <>
              <div className="border border-border bg-card divide-y divide-border">
                {pageJobs.map((job) => (
                  <div key={job.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-semibold text-foreground">{job.title}</p>
                        <span className={`text-xs px-1.5 py-0.5 font-medium ${JOB_STATUS_BADGE[job.status ?? "Active"]}`}>
                          {job.status ?? "Active"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.driverType || "—"} · {job.routeType || "—"} · {job.location || "—"} · {job.pay || "—"}
                      </p>
                      {job.postedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Posted {formatDate(job.postedAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Select value={job.status ?? "Active"} onValueChange={(v) => handleQuickStatus(job.id, v)} name="jobStatus">
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => openEditForm(job)} className="flex items-center gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteJob(job.id)}
                        className="flex items-center gap-1.5 border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <ListPagination
                page={jobPage}
                totalItems={jobs.length}
                pageSize={JOB_PAGE_SIZE}
                onPageChange={setJobPage}
              />
              </>
              );
            })()}
          </div>
        )}

        {/* ── Tab: Applications ──────────────────────────────────────────────── */}
        {activeTab === "applications" && (
          <div>
            <h2 className="font-display font-semibold text-base mb-4">
              Received Applications
              <span className="text-muted-foreground font-normal text-sm ml-2">({applications.length})</span>
            </h2>
            {applications.length === 0 ? (
              <div className="border border-border bg-card px-5 py-12 text-center text-muted-foreground text-sm">
                <p>No applications received yet. Applications will appear here when drivers apply to your company.</p>
              </div>
            ) : (() => {
              const totalPages = Math.ceil(applications.length / APP_PAGE_SIZE);
              const pageApps = applications.slice(appPage * APP_PAGE_SIZE, (appPage + 1) * APP_PAGE_SIZE);
              return (
                <>
                  <div className="space-y-3">
                    {pageApps.map((app) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        isHighlighted={focusedApplicationId === app.id}
                        autoOpenToken={focusedApplicationId === app.id ? autoOpenApplicationToken : undefined}
                      />
                    ))}
                  </div>
                  <ListPagination
                    page={appPage}
                    totalItems={applications.length}
                    pageSize={APP_PAGE_SIZE}
                    onPageChange={setAppPage}
                  />
                </>
              );
            })()}
          </div>
        )}

        {/* ── Tab: Pipeline ──────────────────────────────────────────────────── */}
        {activeTab === "pipeline" && (
          <div>
            <div className="flex items-start justify-between mb-5 gap-3">
              <div>
                <h2 className="font-display font-semibold text-base">Recruitment Pipeline</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Move applicants through hiring stages using the dropdown on each card.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {applications.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to clear ALL applications? This cannot be undone.")) return;
                      const { error } = await supabase
                        .from("applications")
                        .delete()
                        .eq("company_id", user!.id);
                      if (!error) {
                        qc.setQueryData(appsKey, []);
                        qc.invalidateQueries({ queryKey: appsKey });
                        toast.success("All applications cleared.");
                      } else {
                        toast.error("Failed to clear applications.");
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {applications.length === 0 ? (
              <div className="border border-border bg-card px-5 py-12 text-center text-muted-foreground text-sm">
                <p>No applications received yet. The pipeline will show applicants as they apply.</p>
              </div>
            ) : (
              <DndContext
                collisionDetection={pointerWithin}
                onDragStart={(e) => setDragActiveId(e.active.id as string)}
                onDragEnd={(e) => {
                  setDragActiveId(null);
                  const { active, over } = e;
                  if (!over) return;
                  const targetStage = over.id as PipelineStage;
                  if (PIPELINE_STAGES.some((s) => s.label === targetStage)) {
                    updateAppStage(active.id as string, targetStage);
                  }
                }}
                onDragCancel={() => setDragActiveId(null)}
              >
                <div className="overflow-x-auto pb-4">
                  <div className="flex gap-3" style={{ minWidth: `${PIPELINE_STAGES.length * 210}px` }}>
                    {PIPELINE_STAGES.map(({ label, headerClass }) => {
                      const stageApps = applications.filter((app) => app.pipeline_stage === label);
                      return (
                        <PipelineColumn
                          key={label}
                          label={label}
                          headerClass={headerClass}
                          apps={stageApps}
                          onStageChange={updateAppStage}
                        />
                      );
                    })}
                  </div>
                </div>

                <DragOverlay dropAnimation={null}>
                  {dragActiveId ? (() => {
                    const activeApp = applications.find((a) => a.id === dragActiveId);
                    if (!activeApp) return null;
                    return (
                      <PipelineCard
                        app={activeApp}
                        stage={activeApp.pipeline_stage}
                        onStageChange={() => {}}
                        isDragOverlay
                      />
                    );
                  })() : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        )}

        {/* ── Tab: Profile Settings ──────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <div>
            <h2 className="font-display font-semibold text-base mb-4">Company Profile Settings</h2>
            <div className="border border-border bg-card p-5">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                {/* Logo upload */}
                <div className="sm:col-span-2 space-y-2">
                  <Label className="text-xs text-muted-foreground">Company Logo</Label>
                  <div className="flex items-center gap-5">
                    <div className="h-20 w-20 border border-border rounded-lg flex items-center justify-center bg-muted shrink-0 overflow-hidden">
                      {profileLogo ? (
                        <img src={profileLogo} alt="Company logo" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-display text-3xl font-bold text-primary">{user!.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="cursor-pointer inline-block">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border hover:bg-muted transition-colors rounded-sm">
                          <Upload className="h-3.5 w-3.5" />
                          {profileLogo ? "Change Logo" : "Upload Logo"}
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                      </label>
                      {profileLogo && (
                        <button type="button" onClick={handleRemoveLogo} className="block text-xs text-red-500 hover:underline">
                          Remove logo
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="company-name" className="text-xs text-muted-foreground">Company Name</Label>
                  <Input id="company-name" name="companyName" autoComplete="organization" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company-email" className="text-xs text-muted-foreground">Company Email</Label>
                  <Input id="company-email" name="email" type="email" autoComplete="email" placeholder="contact@yourcompany.com" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company-phone" className="text-xs text-muted-foreground">Phone</Label>
                  <Input id="company-phone" name="phone" autoComplete="tel" placeholder="(555) 000-0000" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company-contactName" className="text-xs text-muted-foreground">Contact Name</Label>
                  <Input id="company-contactName" name="contactName" autoComplete="name" placeholder="John Doe" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company-contactTitle" className="text-xs text-muted-foreground">Contact Title</Label>
                  <Input id="company-contactTitle" name="contactTitle" autoComplete="organization-title" placeholder="Recruiting Manager" value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="company-address" className="text-xs text-muted-foreground">Address</Label>
                  <Input id="company-address" name="address" autoComplete="street-address" placeholder="123 Main St, City, State ZIP" value={profileAddress} onChange={(e) => setProfileAddress(e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="company-website" className="text-xs text-muted-foreground">Website (optional)</Label>
                  <Input id="company-website" name="website" autoComplete="url" placeholder="https://yourcompany.com" value={profileWebsite} onChange={(e) => setProfileWebsite(e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="company-about" className="text-xs text-muted-foreground">About</Label>
                  <Textarea id="company-about" name="about" placeholder="Tell drivers about your company, culture, and opportunities..."
                    value={profileAbout} onChange={(e) => setProfileAbout(e.target.value)}
                    rows={5} className="resize-none" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="company-goal" className="text-xs text-muted-foreground">Primary Goal</Label>
                  <Select value={companyGoal} onValueChange={setCompanyGoal} name="companyGoal">
                    <SelectTrigger id="company-goal"><SelectValue placeholder="What do you want to accomplish?" /></SelectTrigger>
                    <SelectContent>
                      {COMPANY_GOALS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={profileSaveStatus === "saving" || !hasUnsavedChanges}
                className={isProfileSaved ? "px-8 bg-green-600 text-white hover:bg-green-600 focus-visible:ring-green-600" : "px-8"}
              >
                {profileSaveStatus === "saving" ? (
                  <>
                    <Spinner size="sm" className="h-4 w-4 border-current border-t-transparent" />
                    <span>Saving...</span>
                  </>
                ) : isProfileSaved ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Saved</span>
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
            <NotificationPreferences userId={user!.id} role="company" />
          </div>
        )}

        {/* ── Tab: Messages ──────────────────────────────────────────────────── */}
        {activeTab === "messages" && (
          <ChatPanel
            userId={user!.id}
            userRole="company"
            userName={user!.name}
            initialApplicationId={initialChatAppId}
            initialDriverId={initialChatDriverId}
          />
        )}

        {/* ── Tab: Leads ───────────────────────────────────────────────────── */}
        {activeTab === "leads" && (() => {
          const uniqueStates = [...new Set(leads.map((l) => l.state).filter(Boolean))].sort() as string[];
          const activeLeads = leads.filter((l) => l.status !== "dismissed" && l.status !== "hired");
          const dismissedLeads = leads.filter((l) => l.status === "dismissed");
          const filtered = activeLeads.filter((l) => {
            if (leadStateFilter !== "all" && l.state !== leadStateFilter) return false;
            if (leadTypeFilter === "owner-op" && !l.isOwnerOp) return false;
            if (leadTypeFilter === "company" && l.isOwnerOp) return false;
            return true;
          });
          const LEAD_PAGE_SIZE = 10;
          const totalPages = Math.ceil(filtered.length / LEAD_PAGE_SIZE);
          const pageLeads = filtered.slice(leadPage * LEAD_PAGE_SIZE, (leadPage + 1) * LEAD_PAGE_SIZE);
          const isFreePlan = !subscription || subscription.plan === "free";
          const leadsAllowed = leadLimit;

          const expLabel = (v: string | null) => {
            if (!v) return "N/A";
            if (v === "less-1") return "< 1 year";
            if (v === "5+") return "5+ years";
            return `${v} years`;
          };

          const statusDot = (s: string) => {
            if (s === "new") return "bg-blue-500";
            if (s === "contacted") return "bg-green-500";
            if (s === "hired") return "bg-emerald-600";
            return "bg-gray-400";
          };

          const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

          const timeAgo = (iso: string) => {
            const diff = Date.now() - new Date(iso).getTime();
            const mins = Math.floor(diff / 60_000);
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            const days = Math.floor(hrs / 24);
            return `${days}d ago`;
          };

          return (
            <div>
              {/* Subscription status banner */}
              <div className={`mb-4 border p-3 flex items-center justify-between gap-3 text-sm ${isFreePlan ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-primary/20 bg-primary/5"}`}>
                <p>
                  {isFreePlan ? (
                    <>You're on the <strong>Free</strong> plan ({leadsAllowed} leads). Upgrade to access more leads.</>
                  ) : (
                    <>
                      <strong className="text-primary">{PLANS[subscription!.plan].label}</strong> plan — {leadsAllowed === 9999 ? "Unlimited" : `${leadsAllowed}`} leads/month.
                      {subscription!.leadsUsed > 0 && <span className="text-muted-foreground"> {leadsAllowed - subscription!.leadsUsed} remaining.</span>}
                    </>
                  )}
                </p>
                <Link to="/pricing">
                  <Button size="sm" variant={isFreePlan ? "default" : "outline"} className="text-xs h-7 shrink-0">
                    {isFreePlan ? "Upgrade" : "Manage Plan"}
                  </Button>
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display font-semibold text-base flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Driver Leads
                    <span className="text-muted-foreground font-normal text-sm">({filtered.length})</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Facebook lead ad responses from drivers looking for jobs.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5"
                    disabled={syncLeads.isPending}
                    onClick={() => {
                      syncLeads.mutate(undefined, {
                        onSuccess: (result) => {
                          toast.success(`Synced ${result.synced} leads: ${result.new} new, ${result.updated} updated`);
                          if (result.errors.length > 0) {
                            toast.warning(`${result.errors.length} row(s) had issues`);
                          }
                        },
                        onError: (err) => {
                          toast.error(err instanceof Error ? err.message : "Sync failed");
                        },
                      });
                    }}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncLeads.isPending ? "animate-spin" : ""}`} />
                    {syncLeads.isPending ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Select value={leadStateFilter} onValueChange={(v) => { setLeadStateFilter(v); setLeadPage(0); }}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue placeholder="All States" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueStates.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex border border-border rounded-md overflow-hidden">
                    {(["all", "owner-op", "company"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setLeadTypeFilter(t); setLeadPage(0); }}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          leadTypeFilter === t
                            ? "bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t === "all" ? "All" : t === "owner-op" ? "Owner Op" : "Company"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {leadsLoading ? (
                <div className="border border-border bg-card px-5 py-12 flex justify-center">
                  <Spinner />
                </div>
              ) : leadsIsError ? (
                <div className="border border-destructive/30 bg-destructive/5 px-5 py-8 text-center">
                  <p className="text-sm text-destructive">
                    {leadsError instanceof Error ? leadsError.message : "Failed to load leads."}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchLeads()}>
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      disabled={syncLeads.isPending}
                      onClick={() => {
                        syncLeads.mutate(undefined, {
                          onSuccess: (result) => {
                            toast.success(`Synced ${result.synced} leads: ${result.new} new, ${result.updated} updated`);
                          },
                          onError: (err) => {
                            toast.error(err instanceof Error ? err.message : "Sync failed");
                          },
                        });
                      }}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncLeads.isPending ? "animate-spin" : ""}`} />
                      {syncLeads.isPending ? "Syncing..." : "Sync Now"}
                    </Button>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="border border-border bg-card px-5 py-12 text-center text-muted-foreground text-sm">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p>No leads match your filters.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {pageLeads.map((lead, idx) => {
                      const globalIdx = leadPage * LEAD_PAGE_SIZE + idx;
                      const isLocked = leadsAllowed !== 9999 && globalIdx >= leadsAllowed;

                      return (
                      <div key={lead.id} className={`relative border bg-card p-4 transition-colors ${isLocked ? "border-border" : lead.status === "dismissed" ? "border-border opacity-60" : lead.status === "new" ? "border-blue-200 dark:border-blue-800" : "border-border"}`}>
                        {isLocked && (
                          <div className="absolute inset-0 z-10 backdrop-blur-sm bg-background/60 flex items-center justify-center">
                            <Link to="/pricing">
                              <Button size="sm" className="text-xs">Upgrade to Unlock</Button>
                            </Link>
                          </div>
                        )}
                        <div className={`flex items-start justify-between gap-3 ${isLocked ? "select-none" : ""}`}>
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* Avatar */}
                            <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                              {lead.fullName.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              {/* Name + status */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm">{lead.fullName}</p>
                                <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot(lead.status)}`} title={statusLabel(lead.status)} />
                                <span className="text-[10px] text-muted-foreground">{statusLabel(lead.status)}</span>
                              </div>
                              {/* Contact info */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                {lead.phone && (
                                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                    <PhoneIcon className="h-3 w-3" />{lead.phone}
                                  </a>
                                )}
                                {lead.email && (
                                  <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                    <MailIcon className="h-3 w-3" />{lead.email}
                                  </a>
                                )}
                              </div>
                              {/* Badges */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {lead.state && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[11px] font-medium">
                                    <MapPin className="h-3 w-3" />{lead.state}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">
                                  {expLabel(lead.yearsExp)} exp
                                </span>
                                {lead.isOwnerOp && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] font-medium">
                                    Owner Operator
                                  </span>
                                )}
                                {!lead.isOwnerOp && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[11px] font-medium">
                                    Company Driver
                                  </span>
                                )}
                              </div>
                              {/* Truck info for owner ops */}
                              {lead.isOwnerOp && lead.truckYear && (
                                <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                                  <TruckIcon className="h-3 w-3" />
                                  {lead.truckYear} {lead.truckMake} {lead.truckModel}
                                </div>
                              )}
                              {/* Time */}
                              <p className="text-[10px] text-muted-foreground mt-1.5">Added {timeAgo(lead.syncedAt)}</p>
                            </div>
                          </div>
                          {/* Actions */}
                          {!isLocked && (
                          <div className="flex flex-col gap-1.5 shrink-0 relative">
                            {lead.status !== "contacted" && lead.status !== "hired" && (
                              <Button
                                size="sm"
                                variant="default"
                                className="text-xs h-7 px-3"
                                onClick={() => setContactLeadId(contactLeadId === lead.id ? null : lead.id)}
                              >
                                Contact
                              </Button>
                            )}
                            {lead.status === "contacted" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="text-xs h-7 px-3 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => updateLeadStatus.mutate({ leadId: lead.id, status: "hired" })}
                                >
                                  Mark Hired
                                </Button>
                                {lead.email && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7 px-3"
                                    onClick={() => setSendApplyLeadId(sendApplyLeadId === lead.id ? null : lead.id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Send Apply Link
                                  </Button>
                                )}
                              </>
                            )}
                            {lead.status !== "dismissed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 px-3 text-muted-foreground"
                                onClick={() => updateLeadStatus.mutate({ leadId: lead.id, status: "dismissed" })}
                              >
                                Dismiss
                              </Button>
                            )}
                            {/* Click-outside backdrop for popups */}
                            {(contactLeadId === lead.id || sendApplyLeadId === lead.id) && (
                              <div className="fixed inset-0 z-10" onClick={() => { setContactLeadId(null); setSendApplyLeadId(null); }} />
                            )}
                            {/* Contact popup */}
                            {contactLeadId === lead.id && (
                              <div className="absolute right-0 top-8 z-20 w-56 border border-border bg-card shadow-lg p-3 space-y-2 overflow-hidden">
                                <p className="text-xs font-semibold mb-2 truncate">Contact {lead.fullName}</p>
                                {lead.phone && (
                                  <a
                                    href={`tel:${lead.phone}`}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors overflow-hidden"
                                    onClick={() => {
                                      updateLeadStatus.mutate({ leadId: lead.id, status: "contacted" });
                                      setContactLeadId(null);
                                    }}
                                  >
                                    <PhoneIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">Call {lead.phone}</span>
                                  </a>
                                )}
                                {lead.email && (
                                  <a
                                    href={`mailto:${lead.email}`}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors overflow-hidden"
                                    onClick={() => {
                                      updateLeadStatus.mutate({ leadId: lead.id, status: "contacted" });
                                      setContactLeadId(null);
                                    }}
                                  >
                                    <MailIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">Email {lead.email}</span>
                                  </a>
                                )}
                                {!lead.phone && !lead.email && (
                                  <p className="text-xs text-muted-foreground">No contact info available.</p>
                                )}
                                <button
                                  className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
                                  onClick={() => setContactLeadId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            {/* Send Apply Link job picker */}
                            {sendApplyLeadId === lead.id && (
                              <div className="absolute right-0 top-8 z-20 w-64 border border-border bg-card shadow-lg p-3 space-y-2">
                                <p className="text-xs font-semibold mb-2">Send apply link to {lead.fullName}</p>
                                {jobs.filter((j) => !j.status || j.status === "Active").length === 0 ? (
                                  <p className="text-xs text-muted-foreground">No active jobs. Post a job first.</p>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {jobs.filter((j) => !j.status || j.status === "Active").map((job) => {
                                      const applyUrl = `${window.location.origin}/jobs/${job.id}`;
                                      const subject = encodeURIComponent(`Apply for: ${job.title}`);
                                      const body = encodeURIComponent(
                                        `Hi ${lead.fullName},\n\nWe think you'd be a great fit for our "${job.title}" position.\n\nClick the link below to view the job and apply:\n${applyUrl}\n\nLooking forward to hearing from you!`
                                      );
                                      const mailto = `mailto:${lead.email}?subject=${subject}&body=${body}`;
                                      return (
                                        <a
                                          key={job.id}
                                          href={mailto}
                                          className="flex items-center gap-2 w-full px-3 py-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
                                          onClick={() => setSendApplyLeadId(null)}
                                        >
                                          <Send className="h-3 w-3 shrink-0" />
                                          <span className="truncate">{job.title}</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                                <button
                                  className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
                                  onClick={() => setSendApplyLeadId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  <ListPagination
                    page={leadPage}
                    totalItems={filtered.length}
                    pageSize={LEAD_PAGE_SIZE}
                    onPageChange={setLeadPage}
                  />
                </>
              )}

              {/* Dismissed section — collapsible */}
              {dismissedLeads.length > 0 && (() => {
                const DISMISSED_PAGE_SIZE = 10;
                const searchedDismissed = dismissedSearch
                  ? dismissedLeads.filter((l) => {
                      const q = dismissedSearch.toLowerCase();
                      return l.fullName.toLowerCase().includes(q) || (l.email ?? "").toLowerCase().includes(q) || (l.phone ?? "").includes(q) || (l.state ?? "").toLowerCase().includes(q);
                    })
                  : dismissedLeads;
                const dismissedTotalPages = Math.ceil(searchedDismissed.length / DISMISSED_PAGE_SIZE);
                const pageDismissed = searchedDismissed.slice(dismissedPage * DISMISSED_PAGE_SIZE, (dismissedPage + 1) * DISMISSED_PAGE_SIZE);

                return (
                  <div className="mt-6 border border-border bg-card">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setShowDismissed(!showDismissed); setDismissedPage(0); setDismissedSearch(""); }}
                    >
                      <span className="font-medium">Dismissed ({dismissedLeads.length})</span>
                      {showDismissed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showDismissed && (
                      <div className="px-4 pb-4 space-y-3">
                        {dismissedLeads.length > DISMISSED_PAGE_SIZE && (
                          <Input
                            id="dismissed-search"
                            name="dismissedSearch"
                            placeholder="Search dismissed leads..."
                            value={dismissedSearch}
                            onChange={(e) => { setDismissedSearch(e.target.value); setDismissedPage(0); }}
                            className="h-8 text-xs"
                          />
                        )}
                        <div className="space-y-2">
                          {pageDismissed.map((lead) => (
                            <div key={lead.id} className="flex items-center justify-between border border-border p-3 opacity-60">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm truncate">{lead.fullName}</span>
                                {lead.state && <span className="text-xs text-muted-foreground shrink-0">{lead.state}</span>}
                                {lead.phone && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{lead.phone}</span>}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 px-3 shrink-0"
                                onClick={() => updateLeadStatus.mutate({ leadId: lead.id, status: "new" })}
                              >
                                Restore
                              </Button>
                            </div>
                          ))}
                          {searchedDismissed.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-2">No matches.</p>
                          )}
                        </div>
                        <ListPagination
                          page={dismissedPage}
                          totalItems={searchedDismissed.length}
                          pageSize={DISMISSED_PAGE_SIZE}
                          onPageChange={setDismissedPage}
                          scrollToTop={false}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ── Tab: Hired ──────────────────────────────────────────────────────── */}
        {activeTab === "hired" && (() => {
          const hiredLeads = leads.filter((l) => l.status === "hired");

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Hired Drivers ({hiredLeads.length})
                </h2>
              </div>

              {hiredLeads.length === 0 ? (
                <div className="border border-dashed border-border p-12 text-center">
                  <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No hired drivers yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mark leads as hired from the Leads tab to see them here.
                  </p>
                </div>
              ) : (
                <div className="border border-border bg-card overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Phone</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Email</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">State</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Experience</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hiredLeads.map((lead) => (
                        <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{lead.fullName}</td>
                          <td className="px-4 py-3">
                            {lead.phone ? (
                              <a href={`tel:${lead.phone}`} className="text-primary underline hover:opacity-80 flex items-center gap-1">
                                <PhoneIcon className="h-3 w-3" />{lead.phone}
                              </a>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`} className="text-primary underline hover:opacity-80 flex items-center gap-1">
                                <MailIcon className="h-3 w-3" />{lead.email}
                              </a>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {lead.state ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                <MapPin className="h-3 w-3" />{lead.state}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">{lead.yearsExp ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${lead.isOwnerOp ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                              {lead.isOwnerOp ? "Owner Op" : "Company"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive"
                              onClick={() => updateLeadStatus.mutate({ leadId: lead.id, status: "contacted" })}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tab: Analytics ─────────────────────────────────────────────────── */}
        {activeTab === "analytics" && (() => {
          const total = applications.length;
          const stageCounts = (["New", "Reviewing", "Interview", "Hired", "Rejected"] as PipelineStage[]).reduce<Record<string, number>>(
            (acc, s) => {
              acc[s] = applications.filter((a) => a.pipeline_stage === s).length;
              return acc;
            }, {}
          );
          const activeJobs = jobs.filter((j) => !j.status || j.status === "Active").length;
          const hireRate = total > 0 ? Math.round((stageCounts["Hired"] / total) * 100) : 0;
          const rejectRate = total > 0 ? Math.round((stageCounts["Rejected"] / total) * 100) : 0;

          const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
            <div className="border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <p className="font-display font-bold text-3xl text-foreground">{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
          );

          return (
            <div className="space-y-6">
              <h2 className="font-display font-semibold text-base">Analytics Overview</h2>

              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Active Leads" value={leads.filter(l => l.status !== "dismissed").length} sub={`${leads.filter(l => l.status === "hired").length} hired`} />
                <StatCard label="Total Applications" value={total} sub="all time" />
                <StatCard label="Active Jobs" value={activeJobs} sub={`of ${jobs.length} total`} />
                <StatCard label="Hire Rate" value={`${hireRate}%`} sub={`${stageCounts["Hired"]} hired from apps`} />
              </div>

              {/* Pipeline stage breakdown */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">Pipeline Stage Breakdown</p>
                <div className="space-y-3">
                  {(["New", "Reviewing", "Interview", "Hired", "Rejected"] as PipelineStage[]).map((stage) => {
                    const count = stageCounts[stage] ?? 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const colors: Record<string, string> = {
                      New: "bg-slate-400",
                      Reviewing: "bg-blue-500",
                      Interview: "bg-yellow-500",
                      Hired: "bg-green-500",
                      Rejected: "bg-red-400",
                    };
                    return (
                      <div key={stage}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{stage}</span>
                          <span className="text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${colors[stage]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lead funnel */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">Lead Funnel</p>
                {leads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No leads synced yet.</p>
                ) : (() => {
                  const leadStatuses = ["new", "contacted", "hired", "dismissed"] as const;
                  const leadCounts = leadStatuses.reduce<Record<string, number>>((acc, s) => {
                    acc[s] = leads.filter((l) => l.status === s).length;
                    return acc;
                  }, {});
                  const leadColors: Record<string, string> = {
                    new: "bg-blue-500",
                    contacted: "bg-yellow-500",
                    hired: "bg-green-500",
                    dismissed: "bg-slate-400",
                  };
                  const leadLabels: Record<string, string> = {
                    new: "New",
                    contacted: "Contacted",
                    hired: "Hired",
                    dismissed: "Dismissed",
                  };
                  return (
                    <div className="space-y-3">
                      {(() => {
                        const activeFunnel = leads.length - leadCounts["dismissed"];
                        const convRate = activeFunnel > 0 ? Math.round((leadCounts["hired"] / activeFunnel) * 100) : 0;
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <div className="text-center">
                              <p className="font-display font-bold text-2xl">{activeFunnel}</p>
                              <p className="text-xs text-muted-foreground">Active Leads</p>
                            </div>
                            <div className="text-center">
                              <p className="font-display font-bold text-2xl text-yellow-500">{leadCounts["contacted"]}</p>
                              <p className="text-xs text-muted-foreground">Contacted</p>
                            </div>
                            <div className="text-center">
                              <p className="font-display font-bold text-2xl text-green-500">{leadCounts["hired"]}</p>
                              <p className="text-xs text-muted-foreground">Hired</p>
                            </div>
                            <div className="text-center">
                              <p className="font-display font-bold text-2xl">{convRate}%</p>
                              <p className="text-xs text-muted-foreground">Conversion Rate</p>
                            </div>
                          </div>
                        );
                      })()}
                      {leadStatuses.map((s) => {
                        const count = leadCounts[s] ?? 0;
                        const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                        return (
                          <div key={s}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{leadLabels[s]}</span>
                              <span className="text-muted-foreground">{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${leadColors[s]}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Job status breakdown */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">Job Status Breakdown</p>
                {jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No jobs posted yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(["Active", "Draft", "Paused", "Closed"] as const).map((status) => {
                      const cnt = jobs.filter((j) => (j.status ?? "Active") === status).length;
                      const badgeColor: Record<string, string> = {
                        Active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                        Draft: "bg-muted text-muted-foreground",
                        Paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                        Closed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                      };
                      return (
                        <div key={status} className="border border-border p-3 text-center">
                          <p className={`text-xs font-semibold px-2 py-0.5 inline-block rounded-full mb-2 ${badgeColor[status]}`}>{status}</p>
                          <p className="font-display font-bold text-2xl">{cnt}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {total === 0 && (
                <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No data yet. Analytics will appear here as applications are received.
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tab: AI Matches ──────────────────────────────────────────────── */}
        {activeTab === "ai-matches" && (() => {
          const currentPlan = subscription?.plan ?? "free";
          const matchLimit = aiMatchLimit;

          const rolloutData = rollout.data;
          const companyUiVisible =
            rolloutData?.companyUiEnabled ||
            (rolloutData?.companyBetaIds ?? []).includes(user!.id);

          if (!companyUiVisible) {
            return (
              <EmptyState
                icon={Sparkles}
                heading="AI Matches coming soon"
                description="This feature is currently in beta. Check back soon."
              />
            );
          }

          const activeJobs = jobs.filter((j) => j.status === "Active");

          return <>
            <div className="border border-border bg-blue-50/50 dark:bg-blue-950/20 p-4 mb-6 text-sm text-muted-foreground">
              AI matches are generated automatically based on driver applications and your job postings.
              Scores update as new drivers apply. Higher scores indicate a stronger fit based on experience,
              license class, location, and preferences.
            </div>
            <AiMatchesContent
            userId={user!.id}
            activeJobs={activeJobs}
            aiJobFilter={aiJobFilter}
            setAiJobFilter={setAiJobFilter}
            aiSourceFilter={aiSourceFilter}
            setAiSourceFilter={setAiSourceFilter}
            matchLimit={matchLimit}
            currentPlan={currentPlan}
            switchTab={switchTab}
          />
          </>;
        })()}

        {/* ── Tab: Subscription ────────────────────────────────────────────── */}
        {activeTab === "subscription" && (() => {
          const plan = subscription?.plan ?? "free";
          const planInfo = PLANS[plan];
          const isFreePlan = plan === "free";

          return (
            <div className="space-y-6">
              <h2 className="font-display font-semibold text-base">
                Subscription Management
              </h2>

              {/* Current plan card */}
              <div className="border border-border bg-card p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Plan</p>
                    <p className="font-display font-bold text-2xl">{planInfo.label}</p>
                    {!isFreePlan && (
                      <p className="text-sm text-muted-foreground mt-1">
                        ${planInfo.price}/month
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 font-semibold rounded-full ${
                    subscription?.status === "canceled"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : subscription?.status === "past_due"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : plan === "unlimited"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      : plan === "growth"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : plan === "starter"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {subscription?.status === "canceled" ? "canceled" : subscription?.status === "past_due" ? "past due" : "active"}
                  </span>
                </div>

                {/* Lead usage */}
                <div className="mt-5 pt-5 border-t border-border">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Leads Used</span>
                    <span className="font-medium">
                      {subscription?.leadsUsed ?? 0} / {planInfo.leads === 9999 ? "Unlimited" : planInfo.leads}
                    </span>
                  </div>
                  {planInfo.leads !== 9999 && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(((subscription?.leadsUsed ?? 0) / planInfo.leads) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Renewal date */}
                {subscription?.currentPeriodEnd && (
                  <p className="text-xs text-muted-foreground mt-3">
                    {subscription.status === "canceled" ? "Expires on" : "Renews on"} {formatDate(subscription.currentPeriodEnd)}
                  </p>
                )}

                {/* Subscription actions */}
                {!isFreePlan && (() => {
                  const isCanceled = subscription?.status === "canceled";
                  const hasStripe = !!subscription?.stripeCustomerId && !!subscription?.stripeSubscriptionId;

                  if (isCanceled) {
                    return (
                      <div className="mt-5 pt-5 border-t border-border flex items-center justify-between gap-4">
                        <p className="text-xs text-muted-foreground">
                          Subscription canceled.{subscription.currentPeriodEnd ? ` Access continues until ${formatDate(subscription.currentPeriodEnd)}.` : ""}
                        </p>
                        <Button size="sm" onClick={() => setResubscribeOpen(true)}>
                          Resubscribe
                        </Button>
                      </div>
                    );
                  }

                  if (hasStripe) {
                    return (
                      <div className="mt-5 pt-5 border-t border-border flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          disabled={cancelSubscription.isPending}
                          onClick={() => {
                            cancelSubscription.mutate(user!.id, {
                              onError: (err) => {
                                toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
                              },
                            });
                          }}
                        >
                          {cancelSubscription.isPending ? "Opening Portal..." : "Cancel Subscription"}
                        </Button>
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>

              {/* Plan comparison */}
              <div className="border border-border bg-card p-6">
                <p className="font-semibold text-sm mb-4">All Plans</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((p) => {
                    const info = PLANS[p];
                    const isCurrent = p === plan;
                    return (
                      <div
                        key={p}
                        className={`border p-4 rounded ${
                          isCurrent
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        }`}
                      >
                        <p className="font-semibold text-sm">{info.label}</p>
                        <p className="font-display font-bold text-xl mt-1">
                          {info.price === 0 ? "Free" : `$${info.price}`}
                          {info.price > 0 && <span className="text-xs font-normal text-muted-foreground">/mo</span>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {info.leads === 9999 ? "Unlimited" : info.leads} leads/month
                        </p>
                        {isCurrent && subscription?.status !== "canceled" && (
                          <p className="text-xs text-primary font-medium mt-2">Current plan</p>
                        )}
                        {isCurrent && subscription?.status === "canceled" && (
                          <Button
                            size="sm"
                            className="mt-2 w-full text-xs"
                            onClick={() => setResubscribeOpen(true)}
                          >
                            Resubscribe
                          </Button>
                        )}
                        {!isCurrent && p !== "free" && (subscription?.status === "canceled" || plan === "free") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full text-xs"
                            onClick={() => handleCheckout(p)}
                            disabled={checkoutLoading !== null}
                          >
                            {checkoutLoading === p ? "Redirecting..." : "Subscribe"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Manage Billing */}
              {!isFreePlan && subscription?.stripeCustomerId && (
                <div className="border border-border bg-card p-6">
                  <p className="font-semibold text-sm">
                    Manage Billing
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Upgrade, downgrade, update payment method, view invoices, or cancel your subscription via the Stripe billing portal.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={portalLoading}
                    onClick={async () => {
                      const controller = new AbortController();
                      const timeout = setTimeout(() => controller.abort(), 15000);
                      try {
                        setPortalLoading(true);
                        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 10_000);
                        if (!session) throw new Error("Not authenticated");

                        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`;
                        const res = await fetch(fnUrl, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          signal: controller.signal,
                        });
                        clearTimeout(timeout);
                        if (!res.ok) {
                          const body = await res.json().catch(() => ({ error: "Unknown error" }));
                          throw new Error(body.error ?? "Failed to open billing portal");
                        }

                        const { url } = await res.json();
                        if (!url) throw new Error("No portal URL returned");
                        window.location.href = url;
                      } catch (err) {
                        clearTimeout(timeout);
                        const msg = err instanceof DOMException && err.name === "AbortError"
                          ? "Request timed out. Please try again."
                          : err instanceof Error ? err.message : "Failed to open billing portal";
                        toast.error(msg);
                      } finally {
                        setPortalLoading(false);
                      }
                    }}
                  >
                    {portalLoading ? "Opening..." : "Open Billing Portal"}
                  </Button>
                </div>
              )}

            </div>
          );
        })()}
      </main>
      <Footer />

      {cropImageSrc && (
        <ImageCropDialog
          imageSrc={cropImageSrc}
          onCropComplete={handleCroppedUpload}
          onClose={() => { URL.revokeObjectURL(cropImageSrc); setCropImageSrc(null); }}
        />
      )}

      {/* Resubscribe dialog */}
      <Dialog open={resubscribeOpen} onOpenChange={(open) => { setResubscribeOpen(open); if (!open) setSelectedResub(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resubscribe to a Plan</DialogTitle>
            <DialogDescription>
              Your subscription was canceled. Select a plan to continue.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const RESUB_FEATURES: Record<string, string[]> = {
              starter: [
                "25 driver leads per month",
                "Filter by state & driver type",
                "Contact info (phone + email)",
                "Lead status tracking",
              ],
              growth: [
                "100 driver leads per month",
                "Everything in Starter",
                "Owner operator truck details",
                "Priority lead delivery",
              ],
              unlimited: [
                "Unlimited driver leads",
                "Everything in Growth",
                "Real-time lead notifications",
                "Dedicated account manager",
              ],
            };

            return (
              <div className="space-y-2 py-1">
                {(Object.keys(PLANS) as Plan[]).filter((p) => p !== "free").map((p) => {
                  const info = PLANS[p];
                  const isSamePlan = p === subscription?.plan;
                  const isSelected = selectedResub === p;
                  return (
                    <div key={p}>
                      <button
                        className={`w-full text-left border rounded-lg p-4 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : isSamePlan
                              ? "border-primary/40 bg-primary/[0.02]"
                              : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedResub(p)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm flex items-center gap-2">
                              {info.label}
                              {isSamePlan && (
                                <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                  Previous plan
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {info.leads === 9999 ? "Unlimited" : info.leads} leads/month
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">${info.price}</p>
                            <p className="text-[10px] text-muted-foreground">/month</p>
                          </div>
                        </div>
                      </button>

                      {/* Expanded details when selected */}
                      {isSelected && (
                        <div className="border border-t-0 border-primary/20 rounded-b-lg px-4 pb-4 pt-3 -mt-1 bg-primary/[0.02]">
                          <p className="text-xs font-medium text-muted-foreground mb-2">What's included:</p>
                          <ul className="space-y-1.5 mb-4">
                            {(RESUB_FEATURES[p] ?? []).map((f) => (
                              <li key={f} className="flex items-start gap-2 text-xs">
                                <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                          <Button
                            className="w-full"
                            size="sm"
                            disabled={checkoutLoading !== null}
                            onClick={() => handleCheckout(p)}
                          >
                            {checkoutLoading === p ? "Redirecting to checkout..." : `Confirm — $${info.price}/month`}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <DialogFooter className="sm:justify-center">
            <Button variant="ghost" size="sm" onClick={() => setResubscribeOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
