import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { PageBreadcrumb } from "@/components/ui/PageBreadcrumb";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import {
  Users,
  Briefcase,
  Building2,
  FileText,
  UserCheck,
  CreditCard,
  MapPin,
  Phone as PhoneIcon,
  Mail as MailIcon,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Ban,
  Trash2,
  ShieldOff,
  ClipboardList,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  Truck,
  Loader2,
  Pencil,
  Plus,
} from "lucide-react";
import {
  useAdminStats,
  useAdminUsers,
  useAdminSubscriptions,
  useAdminJobs,
  useAdminLeads,
  useSyncLeads,
  useAdminUpdateJobStatus,
  useChangeSubscriptionPlan,
  useToggleCompanyVerified,
  useDeclineCompany,
  useAdminBanUser,
  useAdminDeleteUser,
  useAdminEditUser,
  useAdminCreateUser,
  useAdminApplications,
  useAdminChartData,
} from "@/hooks/useAdmin";
import { useAutoSyncLeads } from "@/hooks/useLeads";
import { PLANS, type Plan } from "@/hooks/useSubscription";
import { formatDate } from "@/lib/dateUtils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAllVerificationRequests, useReviewVerification, getVerificationDocSignedUrl } from "@/hooks/useVerification";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMatchingRollout } from "@/hooks/useMatchScores";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { usePageTitle, useNoIndex } from "@/hooks/usePageTitle";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ── Types ──────────────────────────────────────────────────────────── */
type AdminTab = "overview" | "users" | "subscriptions" | "jobs" | "leads" | "applications" | "matching" | "verification";

/* ── Outer guard ────────────────────────────────────────────────────── */
const AdminDashboard = () => {
  usePageTitle("Admin Dashboard");
  useNoIndex();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      toast.error("Admin access only.");
      navigate("/");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;
  return <AdminDashboardInner />;
};
export default AdminDashboard;

/* ── Inner dashboard ────────────────────────────────────────────────── */
function AdminDashboardInner() {
  const { user } = useAuth();

  /* data */
  const { data: stats } = useAdminStats();
  const { data: users = [] } = useAdminUsers();
  const { data: subscriptions = [] } = useAdminSubscriptions();
  const { data: jobs = [] } = useAdminJobs();
  const { data: leads = [] } = useAdminLeads();
  const syncLeads = useSyncLeads();
  useAutoSyncLeads();
  const updateJobStatus = useAdminUpdateJobStatus();
  const changePlan = useChangeSubscriptionPlan();
  const toggleVerified = useToggleCompanyVerified();
  const banUser = useAdminBanUser();
  const deleteUser = useAdminDeleteUser();
  const editUser = useAdminEditUser();
  const createUser = useAdminCreateUser();
  const { data: applications = [] } = useAdminApplications();
  const { data: chartData } = useAdminChartData();

  /* ban/delete confirmation dialog */
  const [confirmAction, setConfirmAction] = useState<{
    type: "ban" | "unban" | "delete";
    userId: string;
    userName: string;
  } | null>(null);

  /* edit user dialog */
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Record<string, string> & { id: string; role: string } | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});

  /* create user dialog */
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createRole, setCreateRole] = useState<"driver" | "company">("company");
  const [createFields, setCreateFields] = useState<Record<string, string>>({});

  /* matching diagnostics data */
  const { data: rollout } = useMatchingRollout();

  const { data: matchingStats } = useQuery({
    queryKey: ["admin-matching-stats"],
    refetchOnMount: "always",
    queryFn: async () => {
      const [djRes, cdRes, pendingRes, errorRes] = await Promise.all([
        supabase.from("driver_job_match_scores").select("*", { count: "exact", head: true }),
        supabase.from("company_driver_match_scores").select("*", { count: "exact", head: true }),
        supabase.from("matching_recompute_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("matching_recompute_queue").select("*", { count: "exact", head: true }).eq("status", "error"),
      ]);
      return {
        driverJobScores: djRes.count ?? 0,
        companyDriverScores: cdRes.count ?? 0,
        queuePending: pendingRes.count ?? 0,
        queueErrors: errorRes.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const { data: queueErrors = [] } = useQuery({
    queryKey: ["admin-matching-queue-errors"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matching_recompute_queue")
        .select("entity_type, entity_id, reason, last_error, attempts, created_at")
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as {
        entity_type: string;
        entity_id: string;
        reason: string;
        last_error: string | null;
        attempts: number;
        created_at: string;
      }[];
    },
    staleTime: 30_000,
  });

  /* verification data */
  const { data: verificationRequests = [] } = useAllVerificationRequests();
  const reviewVerification = useReviewVerification();
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogRequestId, setRejectDialogRequestId] = useState<string | null>(null);
  const [verificationSearch, setVerificationSearch] = useState("");
  const [declineDialogCompany, setDeclineDialogCompany] = useState<{ id: string; name: string } | null>(null);
  const [declineReasonText, setDeclineReasonText] = useState("");
  const [banReapplyCheck, setBanReapplyCheck] = useState(false);
  const declineCompany = useDeclineCompany();
  const pendingVerifications = verificationRequests.filter((r) => r.status === "pending");

  /* unverified new companies */
  const { data: unverifiedCompanies = [] } = useQuery({
    queryKey: ["admin-unverified-companies"],
    enabled: !!user && user.role === "admin",
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_profiles")
        .select("id, company_name, phone, email, address, website, created_at, decline_reason, reapply_note, reapply_doc_paths")
        .or("is_verified.is.null,is_verified.eq.false")
        .is("decline_reason", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; company_name: string | null; phone: string | null; email: string | null; address: string | null; website: string | null; created_at: string; decline_reason: string | null }[];
    },
  });

  /* tab state — synced with URL so refresh preserves the tab */
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as AdminTab | null;
  const VALID_TABS: AdminTab[] = ["overview", "users", "subscriptions", "jobs", "leads", "applications", "matching", "verification"];
  const activeTab: AdminTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "overview";
  const setActiveTab = (tab: AdminTab) => {
    setSearchParams(tab === "overview" ? {} : { tab }, { replace: true });
  };

  /* users tab state */
  const [userSearch, setUserSearch] = useState(searchParams.get("search") || "");
  const [userRoleFilter, setUserRoleFilter] = useState<
    "all" | "driver" | "company" | "new"
  >("all");
  const [userPage, setUserPage] = useState(0);

  /* jobs tab state */
  const [jobPage, setJobPage] = useState(0);

  /* leads tab state */
  const [leadPage, setLeadPage] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadTypeFilter, setLeadTypeFilter] = useState<"all" | "owner_operator" | "company_driver">("all");
  const [leadStatusFilter, setLeadStatusFilter] = useState<"all" | "new" | "contacted" | "hired" | "dismissed">("all");
  const [leadCompanyFilter, setLeadCompanyFilter] = useState<string>("all");

  /* applications tab state */
  const [appPage, setAppPage] = useState(0);

  /* subscription dialog state */
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planDialogTarget, setPlanDialogTarget] = useState<{
    companyId: string;
    companyName: string;
    currentPlan: Plan;
  } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>("free");

  const tabClass = (tab: AdminTab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      activeTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
    }`;

  const PAGE_SIZE = 15;

  /* ── Badge helpers ───────────────────────────────────────────────── */
  const roleBadge = (role: string) => {
    const cls =
      role === "company"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        : role === "admin"
        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    return (
      <span className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${cls}`}>
        {role}
      </span>
    );
  };

  const planBadge = (plan: Plan) => {
    const cls =
      plan === "unlimited"
        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
        : plan === "growth"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        : plan === "starter"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : "bg-muted text-muted-foreground";
    return (
      <span className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${cls}`}>
        {PLANS[plan].label}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const cls =
      status === "active"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : status === "past_due"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    return (
      <span className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${cls}`}>
        {status}
      </span>
    );
  };

  const JOB_STATUS_BADGE: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    Active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    Paused: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    Closed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  };

  const LEAD_STATUS_BADGE: Record<string, string> = {
    new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    contacted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    hired: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    dismissed: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };

  /* ── Pagination helper ──────────────────────────────────────────── */
  const Pagination = ({
    page,
    setPage,
    total,
  }: {
    page: number;
    setPage: (fn: (p: number) => number) => void;
    total: number;
  }) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-muted-foreground">
          Showing {page * PAGE_SIZE + 1}&ndash;
          {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-xs">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8 max-w-[1400px]">
        {/* Breadcrumb */}
        <PageBreadcrumb items={[{ label: "Main", to: "/" }, { label: "Admin Dashboard" }]} />

        {/* Welcome header */}
        <div className="bg-foreground text-background dark:bg-muted dark:text-foreground border border-border px-5 py-4 mb-6">
          <h1 className="font-display font-bold text-lg">
            Admin Panel
          </h1>
          <p className="text-sm opacity-70 mt-0.5">
            Welcome, {user!.name}
          </p>
        </div>

        {/* Tab bar */}
        <div className="border-b border-border mb-6 flex overflow-x-auto">
          <button className={tabClass("overview")} onClick={() => setActiveTab("overview")}>
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Overview
            </span>
          </button>
          <button className={tabClass("users")} onClick={() => setActiveTab("users")}>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Users ({users.length})
            </span>
          </button>
          <button className={tabClass("subscriptions")} onClick={() => setActiveTab("subscriptions")}>
            <span className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Subscriptions
            </span>
          </button>
          <button className={tabClass("jobs")} onClick={() => setActiveTab("jobs")}>
            <span className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" /> Jobs ({jobs.length})
            </span>
          </button>
          <button className={tabClass("leads")} onClick={() => setActiveTab("leads")}>
            <span className="flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> Leads ({leads.length})
            </span>
          </button>
          <button className={tabClass("applications")} onClick={() => setActiveTab("applications")}>
            <span className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Applications ({applications.length})
            </span>
          </button>
          <button className={tabClass("matching")} onClick={() => setActiveTab("matching")}>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Matching
            </span>
          </button>
          <button className={tabClass("verification")} onClick={() => setActiveTab("verification")}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Verification{(pendingVerifications.length + unverifiedCompanies.length) > 0 && ` (${pendingVerifications.length + unverifiedCompanies.length})`}
            </span>
          </button>
        </div>

        {/* ── TAB: Overview ──────────────────────────────────────────── */}
        {activeTab === "overview" && (() => {
          // Build signup trend chart data (last 30 days)
          const signupChartData = (() => {
            const days: { date: string; drivers: number; companies: number }[] = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
              days.push({ date: d.toISOString().slice(5, 10), drivers: 0, companies: 0 });
            }
            for (const s of chartData?.signups ?? []) {
              const key = s.date.slice(5, 10);
              const entry = days.find((d) => d.date === key);
              if (entry) {
                if (s.role === "company") entry.companies++;
                else entry.drivers++;
              }
            }
            return days;
          })();

          const PIPELINE_ORDER = ["New", "Reviewing", "Interview", "Hired", "Rejected"];
          const pipelineData = PIPELINE_ORDER.map((stage) => ({
            stage,
            count: chartData?.applicationStages.find((a) => a.stage === stage)?.count ?? 0,
          }));

          const STAGE_COLORS: Record<string, string> = {
            New: "hsl(217, 91%, 60%)",
            Reviewing: "hsl(45, 93%, 47%)",
            Interview: "hsl(280, 67%, 52%)",
            Hired: "hsl(142, 71%, 45%)",
            Rejected: "hsl(0, 72%, 51%)",
          };

          const JOB_STATUS_COLORS: Record<string, string> = {
            Active: "hsl(142, 71%, 45%)",
            Draft: "hsl(215, 14%, 60%)",
            Paused: "hsl(45, 93%, 47%)",
            Closed: "hsl(0, 72%, 51%)",
          };

          const recentSignups = users.slice(0, 10);

          return (
          <div className="space-y-6">
            <h2 className="font-display font-semibold text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Platform Overview
            </h2>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Total Users", value: stats?.totalUsers ?? 0, icon: <Users className="h-5 w-5 text-muted-foreground" /> },
                { label: "Companies", value: stats?.totalCompanies ?? 0, icon: <Building2 className="h-5 w-5 text-muted-foreground" /> },
                { label: "Drivers", value: stats?.totalDrivers ?? 0, icon: <UserCheck className="h-5 w-5 text-muted-foreground" /> },
                { label: "Active Jobs", value: stats?.activeJobs ?? 0, icon: <Briefcase className="h-5 w-5 text-muted-foreground" /> },
                { label: "Applications", value: stats?.totalApplications ?? 0, icon: <FileText className="h-5 w-5 text-muted-foreground" /> },
                { label: "Leads", value: stats?.totalLeads ?? 0, icon: <PhoneIcon className="h-5 w-5 text-muted-foreground" /> },
              ].map((s) => (
                <div key={s.label} className="border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    {s.icon}
                    <span className="text-2xl font-bold font-display">
                      {s.value}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Signup Trend */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">New Signups (Last 30 Days)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={signupChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Area type="monotone" dataKey="drivers" stackId="1" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.3} name="Drivers" />
                    <Area type="monotone" dataKey="companies" stackId="1" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.3} name="Companies" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Application Pipeline */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">Application Pipeline</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pipelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="stage" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="count" name="Applications">
                      {pipelineData.map((entry, i) => (
                        <Cell key={i} fill={STAGE_COLORS[entry.stage] ?? "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Job Status */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">Job Status Breakdown</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData?.jobStatuses ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="count" name="Jobs">
                      {(chartData?.jobStatuses ?? []).map((entry, i) => (
                        <Cell key={i} fill={JOB_STATUS_COLORS[entry.status] ?? "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Lead Sources */}
              <div className="border border-border bg-card p-5">
                <p className="font-semibold text-sm mb-4">Lead Sources</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData?.leadSources ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis dataKey="source" type="category" tick={{ fontSize: 10 }} className="fill-muted-foreground" width={80} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="count" name="Leads" fill="hsl(217, 91%, 60%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Subscription breakdown */}
            <div className="border border-border bg-card p-5">
              <p className="font-semibold text-sm mb-4">
                Subscription Breakdown
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.keys(PLANS) as Plan[]).map((p) => {
                  const count = subscriptions.filter((s) => s.plan === p).length;
                  return (
                    <div key={p} className="text-center p-3 border border-border rounded">
                      <p className="text-2xl font-bold font-display">{count}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {PLANS[p].label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Signups */}
            <div className="border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="font-semibold text-sm">Recent Signups</p>
              </div>
              {recentSignups.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">No users yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {recentSignups.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-medium truncate">{u.role === "company" && u.companyName ? u.companyName : u.name}</p>
                        {roleBadge(u.role)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        {u.email && <span>{u.email}</span>}
                        <span>{formatDate(u.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          {/* Admin notification preferences */}
          <NotificationPreferences userId={user!.id} role="admin" />
          </div>
          );
        })()}

        {/* ── TAB: Users ─────────────────────────────────────────────── */}
        {activeTab === "users" &&
          (() => {
            const filtered = users.filter((u) => {
              if (userRoleFilter === "new") {
                if (Date.now() - new Date(u.createdAt).getTime() >= 48 * 60 * 60 * 1000)
                  return false;
              } else if (userRoleFilter !== "all" && u.role !== userRoleFilter)
                return false;
              if (userSearch) {
                const q = userSearch.toLowerCase();
                const haystack = [u.name, u.email, u.phone, u.companyName]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();
                if (!haystack.includes(q)) return false;
              }
              return true;
            });
            const pageUsers = filtered.slice(
              userPage * PAGE_SIZE,
              (userPage + 1) * PAGE_SIZE
            );

            return (
              <div>
                {/* Filter bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h2 className="font-display font-semibold text-base">
                    All Users
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      ({filtered.length})
                    </span>
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      onClick={() => {
                        setCreateRole("company");
                        setCreateFields({});
                        setCreateDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Add Company
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      onClick={() => {
                        setCreateRole("driver");
                        setCreateFields({});
                        setCreateDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Add Driver
                    </Button>
                    <Input
                      id="admin-userSearch"
                      name="userSearch"
                      placeholder="Search name, email, phone..."
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setUserPage(0);
                      }}
                      className="w-48 h-8 text-xs"
                    />
                    <div className="flex border border-border rounded-md overflow-hidden">
                      {(["all", "new", "driver", "company"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setUserRoleFilter(r);
                            setUserPage(0);
                          }}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                            userRoleFilter === r
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {r === "all"
                            ? "All"
                            : r === "new"
                              ? "New"
                              : r === "company"
                                ? "Companies"
                                : "Drivers"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* User list */}
                {pageUsers.length === 0 ? (
                  <div className="border border-border bg-card">
                    <EmptyState icon={Users} heading="No users found." />
                  </div>
                ) : (
                  <div className="border border-border bg-card divide-y divide-border">
                    {pageUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 px-5 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground text-sm">
                              {u.role === "company" && u.companyName ? u.companyName : u.name}
                            </p>
                            {roleBadge(u.role)}
                            {Date.now() - new Date(u.createdAt).getTime() < 48 * 60 * 60 * 1000 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase animate-pulse">
                                New
                              </span>
                            )}
                            {u.isBanned && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-500 uppercase">
                                <Ban className="h-3 w-3" /> Banned
                              </span>
                            )}
                            {u.role === "company" &&
                              (() => {
                                const sub = subscriptions.find(
                                  (s) => s.companyId === u.id
                                );
                                return planBadge(sub?.plan ?? "free");
                              })()}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            {u.email && (
                              <span className="flex items-center gap-1">
                                <MailIcon className="h-3 w-3" />
                                {u.email}
                              </span>
                            )}
                            {u.phone && (
                              <span className="flex items-center gap-1">
                                <PhoneIcon className="h-3 w-3" />
                                {u.phone}
                              </span>
                            )}
                            {u.state && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {u.state}
                              </span>
                            )}
                            {u.yearsExp && (
                              <span>{u.yearsExp} yrs exp</span>
                            )}
                            {u.role === "company" && u.name && u.companyName && u.name !== u.companyName && (
                              <span className="flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                {u.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Joined{" "}
                            {formatDate(u.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {u.role === "company" && (
                            <>
                              <Button
                                variant={u.isVerified ? "outline" : "default"}
                                size="sm"
                                className={`text-xs h-7 ${u.isVerified ? "border-green-500/50 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" : ""}`}
                                disabled={toggleVerified.isPending}
                                onClick={() => {
                                  toggleVerified.mutate(
                                    { companyId: u.id, verified: !u.isVerified },
                                    {
                                      onSuccess: () =>
                                        toast.success(
                                          u.isVerified
                                            ? `${u.companyName || u.name} unverified`
                                            : `${u.companyName || u.name} verified`
                                        ),
                                    }
                                  );
                                }}
                              >
                                {u.isVerified ? "Verified" : "Verify"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => {
                                  const sub = subscriptions.find(
                                    (s) => s.companyId === u.id
                                  );
                                  setPlanDialogTarget({
                                    companyId: u.id,
                                    companyName: u.name,
                                    currentPlan: sub?.plan ?? "free",
                                  });
                                  setSelectedPlan(sub?.plan ?? "free");
                                  setPlanDialogOpen(true);
                                }}
                              >
                                Manage Plan
                              </Button>
                            </>
                          )}
                          {u.role !== "admin" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 gap-1"
                                onClick={async () => {
                                  const base: Record<string, string> = { id: u.id, role: u.role, name: u.name, email: u.email || "", phone: u.phone || "" };
                                  if (u.role === "company") {
                                    const { data: cp } = await supabase.from("company_profiles").select("company_name, email, phone, address, website, contact_name, contact_title, company_goal, about").eq("id", u.id).maybeSingle();
                                    if (cp) {
                                      base.companyName = cp.company_name || "";
                                      base.address = cp.address || "";
                                      base.website = cp.website || "";
                                      base.contactName = cp.contact_name || "";
                                      base.contactTitle = cp.contact_title || "";
                                      base.companyGoal = cp.company_goal || "";
                                      base.about = cp.about || "";
                                      if (cp.phone) base.phone = cp.phone;
                                      if (cp.email) base.email = cp.email;
                                    }
                                  } else if (u.role === "driver") {
                                    const { data: dp } = await supabase.from("driver_profiles").select("first_name, last_name, phone, license_state, years_exp, license_class, cdl_number, driver_type, zip_code, date_of_birth, home_address, about, has_accidents, wants_contact").eq("id", u.id).maybeSingle();
                                    if (dp) {
                                      base.firstName = dp.first_name || "";
                                      base.lastName = dp.last_name || "";
                                      base.licenseState = dp.license_state || "";
                                      base.yearsExp = dp.years_exp || "";
                                      base.licenseClass = dp.license_class || "";
                                      base.cdlNumber = dp.cdl_number || "";
                                      base.driverType = dp.driver_type || "";
                                      base.zipCode = dp.zip_code || "";
                                      base.dateOfBirth = dp.date_of_birth || "";
                                      base.homeAddress = dp.home_address || "";
                                      base.about = dp.about || "";
                                      base.hasAccidents = dp.has_accidents || "";
                                      base.wantsContact = dp.wants_contact || "";
                                      if (dp.phone) base.phone = dp.phone;
                                    }
                                  }
                                  setEditTarget(base as Record<string, string> & { id: string; role: string });
                                  setEditFields({ ...base });
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" /> Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`text-xs h-7 ${u.isBanned ? "border-green-500/50 text-green-600" : "border-orange-500/50 text-orange-500"}`}
                                onClick={() => setConfirmAction({
                                  type: u.isBanned ? "unban" : "ban",
                                  userId: u.id,
                                  userName: u.name,
                                })}
                              >
                                {u.isBanned ? <><ShieldOff className="h-3 w-3 mr-1" /> Unban</> : <><Ban className="h-3 w-3 mr-1" /> Ban</>}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 border-red-500/50 text-red-500 hover:bg-red-500/10"
                                onClick={() => setConfirmAction({
                                  type: "delete",
                                  userId: u.id,
                                  userName: u.name,
                                })}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </>
                          )}
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {u.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Pagination
                  page={userPage}
                  setPage={setUserPage}
                  total={filtered.length}
                />
              </div>
            );
          })()}

        {/* ── TAB: Subscriptions ──────────────────────────────────────── */}
        {activeTab === "subscriptions" && (
          <div>
            <h2 className="font-display font-semibold text-base mb-4">
              Company Subscriptions
              <span className="text-muted-foreground font-normal text-sm ml-2">
                ({subscriptions.length})
              </span>
            </h2>

            {/* Plan breakdown */}
            {subscriptions.length > 0 && (() => {
              const counts: Record<string, number> = {};
              subscriptions.forEach((s) => { counts[s.plan] = (counts[s.plan] || 0) + 1; });
              return (
                <div className="flex flex-wrap gap-3 mb-4">
                  {(Object.keys(PLANS) as Plan[]).map((p) => (
                    <div key={p} className="border border-border bg-card px-4 py-2 text-sm">
                      {PLANS[p].label}: <span className="font-semibold">{counts[p] || 0}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {subscriptions.length === 0 ? (
              <div className="border border-border bg-card">
                <EmptyState icon={CreditCard} heading="No companies registered yet." />
              </div>
            ) : (
              <div className="border border-border bg-card divide-y divide-border">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm">
                        {sub.companyName || "Unnamed Company"}
                        {(() => {
                          const u = users.find((u) => u.id === sub.companyId);
                          return u?.email ? (
                            <span className="font-normal text-xs text-muted-foreground ml-2">
                              ({u.email})
                            </span>
                          ) : null;
                        })()}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {planBadge(sub.plan)}
                        {statusBadge(sub.status)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Leads: {sub.leadsUsed}/
                        {sub.leadLimit === 9999
                          ? "Unlimited"
                          : sub.leadLimit}
                        {sub.currentPeriodEnd &&
                          ` · Renews ${formatDate(sub.currentPeriodEnd)}`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setPlanDialogTarget({
                          companyId: sub.companyId,
                          companyName: sub.companyName,
                          currentPlan: sub.plan,
                        });
                        setSelectedPlan(sub.plan);
                        setPlanDialogOpen(true);
                      }}
                    >
                      Change Plan
                    </Button>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ── TAB: Jobs ──────────────────────────────────────────────── */}
        {activeTab === "jobs" &&
          (() => {
            const pageJobs = jobs.slice(
              jobPage * PAGE_SIZE,
              (jobPage + 1) * PAGE_SIZE
            );

            return (
              <div>
                <h2 className="font-display font-semibold text-base mb-4">
                  All Jobs
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    ({jobs.length})
                  </span>
                </h2>

                {pageJobs.length === 0 ? (
                  <div className="border border-border bg-card">
                    <EmptyState icon={Briefcase} heading="No jobs posted yet." />
                  </div>
                ) : (
                  <div className="border border-border bg-card divide-y divide-border">
                    {pageJobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="font-semibold text-foreground text-sm">
                              {job.title}
                            </p>
                            <span
                              className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${
                                JOB_STATUS_BADGE[job.status] ?? ""
                              }`}
                            >
                              {job.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {job.companyName}
                            {job.location && ` · ${job.location}`}
                            {job.pay && ` · ${job.pay}`}
                          </p>
                          {job.postedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Posted{" "}
                              {formatDate(job.postedAt)}
                            </p>
                          )}
                        </div>
                        <Select
                          value={job.status}
                          onValueChange={(v) => {
                            updateJobStatus.mutate(
                              {
                                jobId: job.id,
                                status: v as
                                  | "Active"
                                  | "Paused"
                                  | "Closed",
                              },
                              {
                                onSuccess: () =>
                                  toast.success(
                                    `"${job.title}" set to ${v}`
                                  ),
                                onError: (err) =>
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : "Failed"
                                  ),
                              }
                            );
                          }}
                          name="jobStatus"
                        >
                          <SelectTrigger className="h-7 w-24 text-xs shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["Active", "Paused", "Closed"] as const).map(
                              (s) => (
                                <SelectItem
                                  key={s}
                                  value={s}
                                  className="text-xs"
                                >
                                  {s}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}

                <Pagination
                  page={jobPage}
                  setPage={setJobPage}
                  total={jobs.length}
                />
              </div>
            );
          })()}

        {/* ── TAB: Leads ─────────────────────────────────────────────── */}
        {activeTab === "leads" &&
          (() => {
            // Build company name map from users
            const companyNameMap = new Map<string, string>();
            for (const u of users) {
              if (u.role === "company" && u.companyName) {
                companyNameMap.set(u.id, u.companyName);
              }
            }
            // Unique company IDs in leads for the filter dropdown
            const leadCompanyIds = [...new Set(leads.map((l) => l.companyId).filter(Boolean))] as string[];
            const companyOptions = leadCompanyIds
              .map((cid) => ({ id: cid, name: companyNameMap.get(cid) || cid.slice(0, 8) }))
              .sort((a, b) => a.name.localeCompare(b.name));

            const filteredLeads = leads.filter((l) => {
              if (leadCompanyFilter !== "all") {
                if (leadCompanyFilter === "unassigned") {
                  if (l.companyId) return false;
                } else if (l.companyId !== leadCompanyFilter) return false;
              }
              if (leadTypeFilter !== "all" && l.leadType !== leadTypeFilter) return false;
              if (leadStatusFilter !== "all" && l.status !== leadStatusFilter) return false;
              if (leadSearch.trim()) {
                const q = leadSearch.toLowerCase();
                const matchesName = l.fullName?.toLowerCase().includes(q);
                const matchesPhone = l.phone?.toLowerCase().includes(q);
                const matchesEmail = l.email?.toLowerCase().includes(q);
                const matchesState = l.state?.toLowerCase().includes(q);
                if (!matchesName && !matchesPhone && !matchesEmail && !matchesState) return false;
              }
              return true;
            }).sort((a, b) => {
              // Sort by company (assigned first), then owner ops first, then newest
              const aCo = a.companyId ? companyNameMap.get(a.companyId) ?? "" : "zzz";
              const bCo = b.companyId ? companyNameMap.get(b.companyId) ?? "" : "zzz";
              if (aCo !== bCo) return aCo.localeCompare(bCo);
              if (a.leadType !== b.leadType) return a.leadType === "owner_operator" ? -1 : 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            const pageLeads = filteredLeads.slice(
              leadPage * PAGE_SIZE,
              (leadPage + 1) * PAGE_SIZE
            );

            const LEAD_TYPE_BADGE: Record<string, string> = {
              owner_operator: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
              company_driver: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
            };
            const LEAD_TYPE_LABEL: Record<string, string> = {
              owner_operator: "Owner Operator",
              company_driver: "Company Driver",
            };

            return (
              <div>
                {/* Header + Sync button */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h2 className="font-display font-semibold text-base">
                    All Leads
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      ({filteredLeads.length}{filteredLeads.length !== leads.length ? ` of ${leads.length}` : ""})
                    </span>
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={syncLeads.isPending}
                    onClick={() => {
                      syncLeads.mutate(undefined, {
                        onSuccess: (data) => {
                          toast.success(`Sync complete: ${data.new} new, ${data.updated} updated`);
                          if (data.errors?.length) {
                            data.errors.forEach((e: string) => toast.error(e));
                          }
                        },
                        onError: (err) => toast.error(err instanceof Error ? err.message : "Sync failed"),
                      });
                    }}
                  >
                    {syncLeads.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {syncLeads.isPending ? "Syncing..." : "Sync Now"}
                  </Button>
                </div>

                {/* Filters */}
                <div className="border border-border bg-card mb-4">
                  <div className="px-4 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
                    {/* Search */}
                    <div className="w-full sm:w-56 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Search</label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Name, phone, email..."
                          value={leadSearch}
                          onChange={(e) => { setLeadSearch(e.target.value); setLeadPage(0); }}
                          className="pl-8 h-9 text-sm"
                        />
                      </div>
                    </div>
                    {/* Company */}
                    <div className="w-full sm:w-52 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Company</label>
                      <Select value={leadCompanyFilter} onValueChange={(v) => { setLeadCompanyFilter(v); setLeadPage(0); }}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All companies</SelectItem>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {companyOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Type */}
                    <div className="w-full sm:w-44 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <Select value={leadTypeFilter} onValueChange={(v: typeof leadTypeFilter) => { setLeadTypeFilter(v); setLeadPage(0); }}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          <SelectItem value="owner_operator">Owner Operators</SelectItem>
                          <SelectItem value="company_driver">Company Drivers</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Status */}
                    <div className="w-full sm:w-40 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Status</label>
                      <Select value={leadStatusFilter} onValueChange={(v: typeof leadStatusFilter) => { setLeadStatusFilter(v); setLeadPage(0); }}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="hired">Hired</SelectItem>
                          <SelectItem value="dismissed">Dismissed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {pageLeads.length === 0 ? (
                  <div className="border border-border bg-card">
                    <EmptyState icon={UserCheck} heading={leads.length === 0 ? "No leads synced yet. Click \"Sync Now\" to import from Google Sheets." : "No leads match the selected filters."} />
                  </div>
                ) : (
                  <div className="border border-border bg-card divide-y divide-border">
                    {pageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-5 py-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="font-semibold text-foreground text-sm">
                              {lead.fullName}
                            </p>
                            <span className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${LEAD_TYPE_BADGE[lead.leadType] ?? ""}`}>
                              {LEAD_TYPE_LABEL[lead.leadType] ?? lead.leadType}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${LEAD_STATUS_BADGE[lead.status] ?? ""}`}>
                              {lead.status}
                            </span>
                            {lead.companyId && (
                              <span className="text-xs px-1.5 py-0.5 font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {companyNameMap.get(lead.companyId) ?? "Company"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-1">
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <PhoneIcon className="h-3 w-3" />
                                {lead.phone}
                              </span>
                            )}
                            {lead.email && (
                              <span className="flex items-center gap-1">
                                <MailIcon className="h-3 w-3" />
                                {lead.email}
                              </span>
                            )}
                            {lead.state && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {lead.state}
                              </span>
                            )}
                            {lead.yearsExp && (
                              <span>{lead.yearsExp} yrs exp</span>
                            )}
                          </div>
                          {/* Extra details row */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                            {lead.truckYear && <span>Truck: {lead.truckYear}{lead.truckModel ? ` ${lead.truckModel}` : ""}</span>}
                            {lead.violations && <span>Violations: {lead.violations}</span>}
                            {lead.availability && <span>Available: {lead.availability}</span>}
                          </div>
                          {lead.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">
                              {lead.notes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lead.dateSubmitted ? formatDate(lead.dateSubmitted) : formatDate(lead.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Pagination
                  page={leadPage}
                  setPage={setLeadPage}
                  total={filteredLeads.length}
                />
              </div>
            );
          })()}

        {/* ── TAB: Applications ────────────────────────────────────────── */}
        {activeTab === "applications" &&
          (() => {
            const APP_STAGE_BADGE: Record<string, string> = {
              New: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
              Reviewing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              Interview: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
              Hired: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
              Rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
            };
            const pageApps = applications.slice(
              appPage * PAGE_SIZE,
              (appPage + 1) * PAGE_SIZE
            );

            return (
              <div>
                <h2 className="font-display font-semibold text-base mb-4">
                  All Applications
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    ({applications.length})
                  </span>
                </h2>

                {pageApps.length === 0 ? (
                  <div className="border border-border bg-card">
                    <EmptyState icon={ClipboardList} heading="No applications yet." />
                  </div>
                ) : (
                  <div className="border border-border bg-card divide-y divide-border">
                    {pageApps.map((app) => (
                      <div
                        key={app.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="font-semibold text-foreground text-sm">
                              {app.driverName}
                            </p>
                            <span
                              className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${
                                APP_STAGE_BADGE[app.pipelineStage] ?? "bg-muted text-muted-foreground"
                              }`}
                            >
                              {app.pipelineStage}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{app.jobTitle}</span>
                            {" at "}
                            {app.companyName}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            {app.driverEmail && (
                              <span className="flex items-center gap-1">
                                <MailIcon className="h-3 w-3" />
                                {app.driverEmail}
                              </span>
                            )}
                            {app.driverPhone && (
                              <span className="flex items-center gap-1">
                                <PhoneIcon className="h-3 w-3" />
                                {app.driverPhone}
                              </span>
                            )}
                            <span>{formatDate(app.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Pagination
                  page={appPage}
                  setPage={setAppPage}
                  total={applications.length}
                />
              </div>
            );
          })()}

        {/* ── TAB: Matching ──────────────────────────────────────────── */}
        {activeTab === "matching" && (
          <div className="space-y-6">
            <h2 className="font-display font-semibold text-base">
              Matching Diagnostics
            </h2>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Driver-Job Scores", value: matchingStats?.driverJobScores ?? 0 },
                { label: "Company-Driver Scores", value: matchingStats?.companyDriverScores ?? 0 },
                { label: "Queue Pending", value: matchingStats?.queuePending ?? 0 },
                { label: "Queue Errors", value: matchingStats?.queueErrors ?? 0 },
              ].map((s) => (
                <div key={s.label} className="border border-border bg-card p-5">
                  <p className="text-2xl font-bold font-display">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Rollout config */}
            <div className="border border-border bg-card p-6">
              <p className="font-semibold text-sm mb-4">Rollout Configuration</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Shadow Mode</p>
                  <p className="text-sm font-medium mt-0.5">
                    {rollout?.shadowMode ? "On" : "Off"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Driver UI</p>
                  <p className="text-sm font-medium mt-0.5">
                    {rollout?.driverUiEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Company UI</p>
                  <p className="text-sm font-medium mt-0.5">
                    {rollout?.companyUiEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Beta Company IDs</p>
                  <p className="text-sm font-medium mt-0.5">
                    {rollout?.companyBetaIds.length ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent queue errors */}
            <div className="border border-border bg-card p-6">
              <p className="font-semibold text-sm mb-4">
                Recent Queue Errors
                <span className="text-muted-foreground font-normal text-xs ml-2">
                  (last 10)
                </span>
              </p>
              {queueErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No errors found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 pr-4 font-medium">Entity ID</th>
                        <th className="pb-2 pr-4 font-medium">Reason</th>
                        <th className="pb-2 pr-4 font-medium">Last Error</th>
                        <th className="pb-2 font-medium">Attempts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {queueErrors.map((err, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-4">{err.entity_type}</td>
                          <td className="py-2 pr-4 font-mono">
                            {err.entity_id.slice(0, 8)}...
                          </td>
                          <td className="py-2 pr-4">{err.reason}</td>
                          <td className="py-2 pr-4 max-w-[240px] truncate">
                            {err.last_error ?? "—"}
                          </td>
                          <td className="py-2">{err.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Verification ──────────────────────────────────────── */}
        {activeTab === "verification" && (() => {
          const filteredPending = verificationSearch.trim()
            ? pendingVerifications.filter((r) =>
                (r.companyName ?? "").toLowerCase().includes(verificationSearch.toLowerCase()) ||
                (r.companyEmail ?? "").toLowerCase().includes(verificationSearch.toLowerCase())
              )
            : pendingVerifications;
          const filteredUnverified = verificationSearch.trim()
            ? unverifiedCompanies.filter((c) =>
                (c.company_name ?? "").toLowerCase().includes(verificationSearch.toLowerCase()) ||
                (c.email ?? "").toLowerCase().includes(verificationSearch.toLowerCase())
              )
            : unverifiedCompanies;
          return (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display font-semibold text-base">
                Company Verification
              </h2>
              <Input
                placeholder="Search companies..."
                value={verificationSearch}
                onChange={(e) => setVerificationSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* New Company Registrations awaiting approval */}
            <div className="border border-border bg-card">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-sm">New Registrations ({filteredUnverified.length})</h3>
              </div>
              {filteredUnverified.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No new company registrations awaiting approval.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredUnverified.map((c) => (
                    <div key={c.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{c.company_name || "Unnamed Company"}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.email}{c.phone ? ` · ${c.phone}` : ""}{c.created_at ? ` · Registered ${formatDate(c.created_at)}` : ""}
                          </p>
                          {c.address && <p className="text-xs text-muted-foreground mt-0.5">{c.address}</p>}
                          {c.website && <p className="text-xs text-primary mt-0.5">{c.website}</p>}
                          {c.reapply_note && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                              Re-review note: {c.reapply_note}
                            </p>
                          )}
                          {(c.reapply_doc_paths?.length ?? 0) > 0 && (
                            <button
                              className="text-xs text-primary underline mt-0.5 text-left"
                              onClick={async () => {
                                for (const path of c.reapply_doc_paths!) {
                                  const { data } = await supabase.storage.from("reapply-docs").createSignedUrl(path, 3600);
                                  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                                }
                              }}
                            >
                              <FileText className="h-3 w-3 inline mr-0.5" />
                              View {c.reapply_doc_paths!.length} attached document{c.reapply_doc_paths!.length > 1 ? "s" : ""}
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            disabled={toggleVerified.isPending}
                            onClick={() => {
                              toggleVerified.mutate({ companyId: c.id, verified: true }, {
                                onSuccess: () => {
                                  toast.success(`${c.company_name || "Company"} approved!`);
                                },
                                onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to approve."),
                              });
                            }}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                            onClick={() => { setDeclineDialogCompany({ id: c.id, name: c.company_name || "This company" }); setDeclineReasonText(""); setBanReapplyCheck(false); }}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin?tab=users&search=${encodeURIComponent(c.company_name || c.email || "")}`)}
                          >
                            View Profile
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending verification requests */}
            <div className="border border-border bg-card">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <h3 className="font-semibold text-sm">Pending ({filteredPending.length})</h3>
              </div>
              {filteredPending.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No pending verification requests.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredPending.map((req) => {
                    const isExpanded = expandedRequestId === req.id;
                    return (
                      <div key={req.id} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{req.companyName ?? "Unknown Company"}</p>
                            <p className="text-xs text-muted-foreground">{req.companyEmail} · Submitted {formatDate(req.createdAt)}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">{isExpanded ? "Collapse" : "Review"}</span>
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 space-y-3 border-t border-border pt-4">
                            <div className="grid sm:grid-cols-2 gap-3 text-sm">
                              <p><span className="text-muted-foreground">DOT/MC #:</span> {req.dotNumber || "—"}</p>
                              <p><span className="text-muted-foreground">Business EIN:</span> {req.businessEin || "—"}</p>
                              <p><span className="text-muted-foreground">Years in Business:</span> {req.yearsInBusiness || "—"}</p>
                              <p><span className="text-muted-foreground">Fleet Size:</span> {req.fleetSize || "—"}</p>
                            </div>
                            {req.notes && (
                              <p className="text-sm"><span className="text-muted-foreground">Notes:</span> {req.notes}</p>
                            )}
                            {req.documentUrls.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1.5">Supporting Documents:</p>
                                <div className="flex flex-wrap gap-2">
                                  {req.documentUrls.map((storedPath, i) => (
                                    <button
                                      key={i}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs text-primary underline hover:opacity-80"
                                      onClick={async () => {
                                        const url = await getVerificationDocSignedUrl(storedPath);
                                        if (url) window.open(url, "_blank");
                                      }}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Document {i + 1}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-3 pt-2">
                              <Button
                                size="sm"
                                disabled={reviewVerification.isPending}
                                onClick={() => {
                                  reviewVerification.mutate({
                                    requestId: req.id,
                                    companyId: req.companyId,
                                    decision: "approved",
                                    reviewedBy: user!.id,
                                  }, {
                                    onSuccess: () => toast.success(`${req.companyName} has been verified!`),
                                    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to approve."),
                                  });
                                }}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-500/50 text-red-600 hover:bg-red-500/10"
                                onClick={() => { setRejectDialogRequestId(req.id); setRejectReason(""); }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* History */}
            {verificationRequests.filter((r) => r.status !== "pending").length > 0 && (
              <div className="border border-border bg-card">
                <div className="px-5 py-3 border-b border-border">
                  <h3 className="font-semibold text-sm">Review History</h3>
                </div>
                <div className="divide-y divide-border">
                  {verificationRequests.filter((r) => r.status !== "pending").map((req) => (
                    <div key={req.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{req.companyName ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(req.createdAt)}
                          {req.rejectionReason && ` · Reason: ${req.rejectionReason}`}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        req.status === "approved"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {req.status === "approved" ? "Approved" : "Rejected"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Decline New Registration Dialog */}
        <Dialog open={!!declineDialogCompany} onOpenChange={(open) => { if (!open) setDeclineDialogCompany(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline Company Registration</DialogTitle>
              <DialogDescription>
                Provide a reason for declining <strong>{declineDialogCompany?.name}</strong>. They will see this message on their dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="decline-reason">Reason</Label>
                <Textarea
                  id="decline-reason"
                  placeholder="e.g. Could not verify business registration..."
                  rows={3}
                  value={declineReasonText}
                  onChange={(e) => setDeclineReasonText(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={banReapplyCheck}
                  onChange={(e) => setBanReapplyCheck(e.target.checked)}
                  className="h-4 w-4 accent-destructive"
                />
                <span className="text-sm text-muted-foreground">
                  Prevent this company from requesting re-review
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineDialogCompany(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={!declineReasonText.trim() || declineCompany.isPending}
                onClick={() => {
                  if (!declineDialogCompany) return;
                  declineCompany.mutate(
                    { companyId: declineDialogCompany.id, reason: declineReasonText.trim(), banReapply: banReapplyCheck },
                    {
                      onSuccess: () => {
                        toast.success(`${declineDialogCompany.name} has been declined.`);
                        setDeclineDialogCompany(null);
                      },
                      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to decline."),
                    }
                  );
                }}
              >
                {declineCompany.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm Decline
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Verification Dialog */}
        <Dialog open={!!rejectDialogRequestId} onOpenChange={(open) => { if (!open) setRejectDialogRequestId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Verification Request</DialogTitle>
              <DialogDescription>
                Provide a reason for rejection. The company will see this message.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="Reason for rejection (optional)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogRequestId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={reviewVerification.isPending}
                onClick={() => {
                  const req = verificationRequests.find((r) => r.id === rejectDialogRequestId);
                  if (!req) return;
                  reviewVerification.mutate({
                    requestId: req.id,
                    companyId: req.companyId,
                    decision: "rejected",
                    rejectionReason: rejectReason,
                    reviewedBy: user!.id,
                  }, {
                    onSuccess: () => {
                      toast.success(`Verification request for ${req.companyName} rejected.`);
                      setRejectDialogRequestId(null);
                    },
                    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reject."),
                  });
                }}
              >
                {reviewVerification.isPending ? "Rejecting..." : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Plan Dialog (shared by Users + Subscriptions tabs) */}
        <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Subscription Plan</DialogTitle>
              <DialogDescription>
                Update plan for{" "}
                <strong>{planDialogTarget?.companyName}</strong>
                {planDialogTarget &&
                  ` (currently ${PLANS[planDialogTarget.currentPlan].label})`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Select
                value={selectedPlan}
                onValueChange={(v) => setSelectedPlan(v as Plan)}
                name="subscriptionPlan"
              >
                <SelectTrigger id="admin-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLANS) as Plan[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLANS[p].label} &mdash; ${PLANS[p].price}/mo (
                      {PLANS[p].leads === 9999 ? "Unlimited" : PLANS[p].leads}{" "}
                      leads)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPlanDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={changePlan.isPending}
                onClick={() => {
                  if (!planDialogTarget) return;
                  changePlan.mutate(
                    {
                      companyId: planDialogTarget.companyId,
                      plan: selectedPlan,
                    },
                    {
                      onSuccess: () => {
                        toast.success(
                          `Plan updated to ${PLANS[selectedPlan].label} for ${planDialogTarget.companyName}`
                        );
                        setPlanDialogOpen(false);
                      },
                      onError: (err) => {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Failed to update plan"
                        );
                      },
                    }
                  );
                }}
              >
                {changePlan.isPending ? "Saving..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ban / Delete confirmation dialog */}
        <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {confirmAction?.type === "delete"
                  ? "Delete User"
                  : confirmAction?.type === "ban"
                    ? "Ban User"
                    : "Unban User"}
              </DialogTitle>
              <DialogDescription>
                {confirmAction?.type === "delete"
                  ? `This will permanently delete "${confirmAction.userName}" and all their data (jobs, applications, subscriptions). This cannot be undone.`
                  : confirmAction?.type === "ban"
                    ? `This will ban "${confirmAction?.userName}" from the platform. They will not be able to log in.`
                    : `This will unban "${confirmAction?.userName}" and restore their access.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmAction?.type === "delete" ? "destructive" : "default"}
                disabled={banUser.isPending || deleteUser.isPending}
                onClick={() => {
                  if (!confirmAction) return;
                  if (confirmAction.type === "delete") {
                    deleteUser.mutate(
                      { userId: confirmAction.userId },
                      {
                        onSuccess: () => {
                          toast.success(`${confirmAction.userName} has been deleted.`);
                          setConfirmAction(null);
                        },
                        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete user"),
                      }
                    );
                  } else {
                    banUser.mutate(
                      { userId: confirmAction.userId, ban: confirmAction.type === "ban" },
                      {
                        onSuccess: () => {
                          toast.success(
                            confirmAction.type === "ban"
                              ? `${confirmAction.userName} has been banned.`
                              : `${confirmAction.userName} has been unbanned.`
                          );
                          setConfirmAction(null);
                        },
                        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
                      }
                    );
                  }
                }}
              >
                {(banUser.isPending || deleteUser.isPending) ? "Processing..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* ── Edit User Dialog ─────────────────────────────────────────── */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false); }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Editing {editTarget?.role === "company" && editTarget?.companyName ? editTarget.companyName : editTarget?.name} ({editTarget?.role})
              </DialogDescription>
            </DialogHeader>
            {editTarget && (
              <div className="space-y-3 py-2">
                {editTarget.role !== "company" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={editFields.name || ""} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="h-9" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={editFields.email || ""} onChange={(e) => setEditFields((f) => ({ ...f, email: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">New Password (leave blank to keep current)</Label>
                  <Input type="password" value={editFields.password || ""} onChange={(e) => setEditFields((f) => ({ ...f, password: e.target.value }))} className="h-9" placeholder="Enter new password..." />
                </div>

                {editTarget.role === "company" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Company Name</Label>
                      <Input value={editFields.companyName || ""} onChange={(e) => setEditFields((f) => ({ ...f, companyName: e.target.value }))} className="h-9" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Contact Name</Label>
                        <Input value={editFields.contactName || ""} onChange={(e) => setEditFields((f) => ({ ...f, contactName: e.target.value }))} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Contact Title</Label>
                        <Input value={editFields.contactTitle || ""} onChange={(e) => setEditFields((f) => ({ ...f, contactTitle: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input value={editFields.phone || ""} onChange={(e) => setEditFields((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Address</Label>
                      <Input value={editFields.address || ""} onChange={(e) => setEditFields((f) => ({ ...f, address: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Website</Label>
                      <Input value={editFields.website || ""} onChange={(e) => setEditFields((f) => ({ ...f, website: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Company Goal</Label>
                      <Input value={editFields.companyGoal || ""} onChange={(e) => setEditFields((f) => ({ ...f, companyGoal: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">About</Label>
                      <textarea value={editFields.about || ""} onChange={(e) => setEditFields((f) => ({ ...f, about: e.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" />
                    </div>
                  </>
                )}

                {editTarget.role === "driver" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">First Name</Label>
                        <Input value={editFields.firstName || ""} onChange={(e) => setEditFields((f) => ({ ...f, firstName: e.target.value }))} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Last Name</Label>
                        <Input value={editFields.lastName || ""} onChange={(e) => setEditFields((f) => ({ ...f, lastName: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input value={editFields.phone || ""} onChange={(e) => setEditFields((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Driver Type</Label>
                        <Input value={editFields.driverType || ""} onChange={(e) => setEditFields((f) => ({ ...f, driverType: e.target.value }))} className="h-9" placeholder="e.g. Owner Operator, Company Driver" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CDL Number</Label>
                        <Input value={editFields.cdlNumber || ""} onChange={(e) => setEditFields((f) => ({ ...f, cdlNumber: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">License Class</Label>
                        <Input value={editFields.licenseClass || ""} onChange={(e) => setEditFields((f) => ({ ...f, licenseClass: e.target.value }))} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">License State</Label>
                        <Input value={editFields.licenseState || ""} onChange={(e) => setEditFields((f) => ({ ...f, licenseState: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Years Experience</Label>
                        <Input value={editFields.yearsExp || ""} onChange={(e) => setEditFields((f) => ({ ...f, yearsExp: e.target.value }))} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Date of Birth</Label>
                        <Input type="date" value={editFields.dateOfBirth || ""} onChange={(e) => setEditFields((f) => ({ ...f, dateOfBirth: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Zip Code</Label>
                        <Input value={editFields.zipCode || ""} onChange={(e) => setEditFields((f) => ({ ...f, zipCode: e.target.value }))} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Has Accidents</Label>
                        <select value={editFields.hasAccidents || ""} onChange={(e) => setEditFields((f) => ({ ...f, hasAccidents: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Home Address</Label>
                      <Input value={editFields.homeAddress || ""} onChange={(e) => setEditFields((f) => ({ ...f, homeAddress: e.target.value }))} className="h-9" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Wants Contact</Label>
                        <select value={editFields.wantsContact || ""} onChange={(e) => setEditFields((f) => ({ ...f, wantsContact: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">About</Label>
                      <textarea value={editFields.about || ""} onChange={(e) => setEditFields((f) => ({ ...f, about: e.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" />
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={editUser.isPending}
                onClick={() => {
                  if (!editTarget) return;
                  const fields: Record<string, string | null> = {};
                  if (editFields.name !== editTarget.name) fields.name = editFields.name;
                  if (editFields.email !== editTarget.email) fields.email = editFields.email;
                  if (editFields.password) fields.password = editFields.password;
                  if (editTarget.role === "company") {
                    if (editFields.companyName !== editTarget.companyName) fields.company_name = editFields.companyName;
                    if (editFields.phone !== editTarget.phone) fields.phone = editFields.phone;
                    if (editFields.email !== editTarget.email) fields.company_email = editFields.email;
                    if (editFields.address !== editTarget.address) fields.address = editFields.address;
                    if (editFields.website !== editTarget.website) fields.website = editFields.website;
                    if (editFields.contactName !== editTarget.contactName) fields.contact_name = editFields.contactName;
                    if (editFields.contactTitle !== editTarget.contactTitle) fields.contact_title = editFields.contactTitle;
                    if (editFields.companyGoal !== editTarget.companyGoal) fields.company_goal = editFields.companyGoal;
                    if (editFields.about !== editTarget.about) fields.about = editFields.about;
                  }
                  if (editTarget.role === "driver") {
                    if (editFields.firstName !== editTarget.firstName) fields.first_name = editFields.firstName;
                    if (editFields.lastName !== editTarget.lastName) fields.last_name = editFields.lastName;
                    if (editFields.phone !== editTarget.phone) fields.phone = editFields.phone;
                    if (editFields.licenseState !== editTarget.licenseState) fields.license_state = editFields.licenseState;
                    if (editFields.yearsExp !== editTarget.yearsExp) fields.years_exp = editFields.yearsExp;
                    if (editFields.licenseClass !== editTarget.licenseClass) fields.license_class = editFields.licenseClass;
                    if (editFields.driverType !== editTarget.driverType) fields.driver_type = editFields.driverType;
                    if (editFields.cdlNumber !== editTarget.cdlNumber) fields.cdl_number = editFields.cdlNumber;
                    if (editFields.zipCode !== editTarget.zipCode) fields.zip_code = editFields.zipCode;
                    if (editFields.dateOfBirth !== editTarget.dateOfBirth) fields.date_of_birth = editFields.dateOfBirth;
                    if (editFields.homeAddress !== editTarget.homeAddress) fields.home_address = editFields.homeAddress;
                    if (editFields.about !== editTarget.about) fields.about = editFields.about;
                    if (editFields.hasAccidents !== editTarget.hasAccidents) fields.has_accidents = editFields.hasAccidents;
                    if (editFields.wantsContact !== editTarget.wantsContact) fields.wants_contact = editFields.wantsContact;
                  }
                  if (Object.keys(fields).length === 0) {
                    toast.info("No changes to save.");
                    setEditDialogOpen(false);
                    return;
                  }
                  editUser.mutate(
                    { userId: editTarget.id, fields },
                    {
                      onSuccess: () => {
                        toast.success(`${editFields.name || editTarget.name} updated successfully.`);
                        setEditDialogOpen(false);
                      },
                      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update user"),
                    }
                  );
                }}
              >
                {editUser.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Create User Dialog ──────────────────────────────────────── */}
        <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) setCreateDialogOpen(false); }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New {createRole === "company" ? "Company" : "Driver"}</DialogTitle>
              <DialogDescription>
                Create a new {createRole} account. The account will be active immediately (no email confirmation needed).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Email *</Label>
                <Input value={createFields.email || ""} onChange={(e) => setCreateFields((f) => ({ ...f, email: e.target.value }))} className="h-9" placeholder="user@example.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password *</Label>
                <Input type="password" value={createFields.password || ""} onChange={(e) => setCreateFields((f) => ({ ...f, password: e.target.value }))} className="h-9" placeholder="Min 8 characters" />
              </div>

              {createRole === "company" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Company Name *</Label>
                    <Input value={createFields.company_name || ""} onChange={(e) => setCreateFields((f) => ({ ...f, company_name: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contact Name</Label>
                    <Input value={createFields.contact_name || ""} onChange={(e) => setCreateFields((f) => ({ ...f, contact_name: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input value={createFields.phone || ""} onChange={(e) => setCreateFields((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Address</Label>
                    <Input value={createFields.address || ""} onChange={(e) => setCreateFields((f) => ({ ...f, address: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Website</Label>
                    <Input value={createFields.website || ""} onChange={(e) => setCreateFields((f) => ({ ...f, website: e.target.value }))} className="h-9" />
                  </div>
                </>
              )}

              {createRole === "driver" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name *</Label>
                      <Input value={createFields.first_name || ""} onChange={(e) => setCreateFields((f) => ({ ...f, first_name: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name *</Label>
                      <Input value={createFields.last_name || ""} onChange={(e) => setCreateFields((f) => ({ ...f, last_name: e.target.value }))} className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input value={createFields.phone || ""} onChange={(e) => setCreateFields((f) => ({ ...f, phone: e.target.value }))} className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">License State</Label>
                      <Input value={createFields.license_state || ""} onChange={(e) => setCreateFields((f) => ({ ...f, license_state: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Years Experience</Label>
                      <Input value={createFields.years_exp || ""} onChange={(e) => setCreateFields((f) => ({ ...f, years_exp: e.target.value }))} className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">License Class</Label>
                    <Input value={createFields.license_class || ""} onChange={(e) => setCreateFields((f) => ({ ...f, license_class: e.target.value }))} className="h-9" />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={createUser.isPending}
                onClick={() => {
                  if (!createFields.email || !createFields.password) {
                    toast.error("Email and password are required.");
                    return;
                  }
                  if (createFields.password.length < 8) {
                    toast.error("Password must be at least 8 characters.");
                    return;
                  }
                  const name = createRole === "company"
                    ? createFields.company_name || createFields.email
                    : [createFields.first_name, createFields.last_name].filter(Boolean).join(" ") || createFields.email;

                  const profileFields: Record<string, string> = {};
                  if (createRole === "company") {
                    if (createFields.company_name) profileFields.company_name = createFields.company_name;
                    if (createFields.contact_name) profileFields.contact_name = createFields.contact_name;
                    if (createFields.phone) profileFields.phone = createFields.phone;
                    if (createFields.address) profileFields.address = createFields.address;
                    if (createFields.website) profileFields.website = createFields.website;
                    profileFields.company_email = createFields.email;
                  } else {
                    if (createFields.first_name) profileFields.first_name = createFields.first_name;
                    if (createFields.last_name) profileFields.last_name = createFields.last_name;
                    if (createFields.phone) profileFields.phone = createFields.phone;
                    if (createFields.license_state) profileFields.license_state = createFields.license_state;
                    if (createFields.years_exp) profileFields.years_exp = createFields.years_exp;
                    if (createFields.license_class) profileFields.license_class = createFields.license_class;
                  }

                  createUser.mutate(
                    {
                      role: createRole,
                      email: createFields.email,
                      password: createFields.password,
                      name,
                      profileFields,
                    },
                    {
                      onSuccess: (data) => {
                        toast.success(`${data.name} created successfully.`);
                        setCreateDialogOpen(false);
                        setCreateFields({});
                      },
                      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create user"),
                    }
                  );
                }}
              >
                {createUser.isPending ? "Creating..." : `Create ${createRole === "company" ? "Company" : "Driver"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
      <Footer />
    </div>
  );
}
