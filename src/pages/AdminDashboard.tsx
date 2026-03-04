import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
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
} from "lucide-react";
import {
  useAdminStats,
  useAdminUsers,
  useAdminSubscriptions,
  useAdminJobs,
  useAdminLeads,
  useAdminUpdateJobStatus,
  useChangeSubscriptionPlan,
  useToggleCompanyVerified,
  useAdminBanUser,
  useAdminDeleteUser,
} from "@/hooks/useAdmin";
import { PLANS, type Plan } from "@/hooks/useSubscription";
import { formatDate } from "@/lib/dateUtils";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAllVerificationRequests, useReviewVerification, getVerificationDocSignedUrl } from "@/hooks/useVerification";
import { Textarea } from "@/components/ui/textarea";
import { useMatchingRollout } from "@/hooks/useMatchScores";
import { usePageTitle } from "@/hooks/usePageTitle";

/* ── Types ──────────────────────────────────────────────────────────── */
type AdminTab = "overview" | "users" | "subscriptions" | "jobs" | "leads" | "matching" | "verification";

/* ── Outer guard ────────────────────────────────────────────────────── */
const AdminDashboard = () => {
  usePageTitle("Admin Dashboard");
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      toast.error("Admin access only.");
      navigate("/");
    }
  }, [loading, user, navigate]);

  if (loading || !user || user.role !== "admin") return null;
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
  const updateJobStatus = useAdminUpdateJobStatus();
  const changePlan = useChangeSubscriptionPlan();
  const toggleVerified = useToggleCompanyVerified();
  const banUser = useAdminBanUser();
  const deleteUser = useAdminDeleteUser();

  /* ban/delete confirmation dialog */
  const [confirmAction, setConfirmAction] = useState<{
    type: "ban" | "unban" | "delete";
    userId: string;
    userName: string;
  } | null>(null);

  /* matching diagnostics data */
  const { data: rollout } = useMatchingRollout();

  const { data: matchingStats } = useQuery({
    queryKey: ["admin-matching-stats"],
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
  const pendingVerifications = verificationRequests.filter((r) => r.status === "pending");

  /* tab state — synced with URL so refresh preserves the tab */
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as AdminTab | null;
  const VALID_TABS: AdminTab[] = ["overview", "users", "subscriptions", "jobs", "leads", "matching", "verification"];
  const activeTab: AdminTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "overview";
  const setActiveTab = (tab: AdminTab) => {
    setSearchParams(tab === "overview" ? {} : { tab }, { replace: true });
  };

  /* users tab state */
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<
    "all" | "driver" | "company"
  >("all");
  const [userPage, setUserPage] = useState(0);

  /* jobs tab state */
  const [jobPage, setJobPage] = useState(0);

  /* leads tab state */
  const [leadPage, setLeadPage] = useState(0);

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
        <p className="text-sm text-muted-foreground mb-6">
          <Link to="/" className="text-primary underline hover:opacity-80">
            Main
          </Link>
          <span className="mx-1">»</span>
          Admin Dashboard
        </p>

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
          <button className={tabClass("matching")} onClick={() => setActiveTab("matching")}>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Matching
            </span>
          </button>
          <button className={tabClass("verification")} onClick={() => setActiveTab("verification")}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Verification
            </span>
          </button>
        </div>

        {/* ── TAB: Overview ──────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <h2 className="font-display font-semibold text-base">
              Platform Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Users", value: stats?.totalUsers ?? 0, icon: <Users className="h-5 w-5 text-muted-foreground" /> },
                { label: "Companies", value: stats?.totalCompanies ?? 0, icon: <Building2 className="h-5 w-5 text-muted-foreground" /> },
                { label: "Drivers", value: stats?.totalDrivers ?? 0, icon: <UserCheck className="h-5 w-5 text-muted-foreground" /> },
                { label: "Active Jobs", value: stats?.activeJobs ?? 0, icon: <Briefcase className="h-5 w-5 text-muted-foreground" /> },
                { label: "Applications", value: stats?.totalApplications ?? 0, icon: <FileText className="h-5 w-5 text-muted-foreground" /> },
                { label: "Leads", value: stats?.totalLeads ?? 0, icon: <PhoneIcon className="h-5 w-5 text-muted-foreground" /> },
              ].map((s) => (
                <div key={s.label} className="border border-border bg-card p-5">
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
          </div>
        )}

        {/* ── TAB: Users ─────────────────────────────────────────────── */}
        {activeTab === "users" &&
          (() => {
            const filtered = users.filter((u) => {
              if (userRoleFilter !== "all" && u.role !== userRoleFilter)
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
                  <div className="flex items-center gap-2">
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
                      {(["all", "driver", "company"] as const).map((r) => (
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
                              {u.name}
                            </p>
                            {roleBadge(u.role)}
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
                            {u.companyName && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {u.companyName}
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
                        {sub.companyName}
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
            const pageLeads = leads.slice(
              leadPage * PAGE_SIZE,
              (leadPage + 1) * PAGE_SIZE
            );

            return (
              <div>
                <h2 className="font-display font-semibold text-base mb-4">
                  All Leads
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    ({leads.length})
                  </span>
                </h2>

                {pageLeads.length === 0 ? (
                  <div className="border border-border bg-card">
                    <EmptyState icon={UserCheck} heading="No leads synced yet." />
                  </div>
                ) : (
                  <div className="border border-border bg-card divide-y divide-border">
                    {pageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="font-semibold text-foreground text-sm">
                              {lead.fullName}
                            </p>
                            <span
                              className={`text-xs px-1.5 py-0.5 font-medium rounded-full ${
                                LEAD_STATUS_BADGE[lead.status] ?? ""
                              }`}
                            >
                              {lead.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lead.source} &middot;{" "}
                            {formatDate(lead.createdAt)}
                            {lead.yearsExp && ` · ${lead.yearsExp} yrs exp`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Pagination
                  page={leadPage}
                  setPage={setLeadPage}
                  total={leads.length}
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
          return (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display font-semibold text-base">
                Company Verification Requests
              </h2>
              <Input
                placeholder="Search companies..."
                value={verificationSearch}
                onChange={(e) => setVerificationSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Pending */}
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
      </main>
      <Footer />
    </div>
  );
}
