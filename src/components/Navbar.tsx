import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  Phone,
  Mail,
  Truck,
  ChevronDown,
  LogOut,
  User,
  LayoutDashboard,
  MessageSquare,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import { useUnreadCount } from "@/hooks/useMessages";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SignInModal = lazy(() =>
  import("@/components/SignInModal")
    .then((m) => ({ default: m.SignInModal }))
    .catch(() => {
      if (!sessionStorage.getItem("chunk_reload")) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
        return new Promise<never>(() => {});
      }
      sessionStorage.removeItem("chunk_reload");
      return import("@/components/SignInModal").then((m) => ({
        default: m.SignInModal,
      }));
    }),
);
const NotificationCenter = lazy(() =>
  import("@/components/NotificationCenter")
    .then((m) => ({ default: m.NotificationCenter }))
    .catch(() => {
      if (!sessionStorage.getItem("chunk_reload")) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
        return new Promise<never>(() => {});
      }
      sessionStorage.removeItem("chunk_reload");
      return import("@/components/NotificationCenter").then((m) => ({
        default: m.NotificationCenter,
      }));
    }),
);

const jobDropdownItems = [
  { name: "All Jobs", path: "/jobs" },
  { name: "Dry Van", path: "/jobs?type=dry-van" },
  { name: "Flatbed", path: "/jobs?type=flatbed" },
  { name: "Dry Bulk", path: "/jobs?type=dry-bulk" },
  { name: "Refrigerated", path: "/jobs?type=refrigerated" },
  { name: "Tanker", path: "/jobs?type=tanker" },
  { name: "Teams driving", path: "/jobs?type=teams" },
  { name: "Owner Operator", path: "/jobs?type=owner-operator" },
  { name: "Students", path: "/jobs?type=students" },
];

const navLinks = [
  { name: "Home", path: "/" },
  { name: "Apply Now", path: "/apply" },
  { name: "Drivers", path: "/drivers" },
  { name: "Jobs", path: "/jobs", dropdown: jobDropdownItems },
  { name: "Companies", path: "/companies" },
  { name: "Pricing", path: "/pricing" },
];

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

// Truck front-view SVG — headlights off in light mode, glowing amber in dark mode
const TruckToggle = ({
  isDark,
  onClick,
}: {
  isDark: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
    aria-label="Toggle dark mode"
  >
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Cab roof */}
      <path
        d="M4 9 L4 5.5 Q15 2.5 26 5.5 L26 9 Z"
        className="fill-primary dark:fill-slate-400 transition-colors duration-300"
      />
      {/* Windshield */}
      <rect
        x="5.5"
        y="9"
        width="19"
        height="6.5"
        rx="0.5"
        className="fill-sky-200 dark:fill-slate-800 transition-colors duration-300"
      />
      {/* Main body / hood */}
      <rect
        x="3"
        y="15.5"
        width="24"
        height="10"
        rx="0.5"
        className="fill-primary dark:fill-slate-700 transition-colors duration-300"
      />
      {/* Grille center section */}
      <rect
        x="11.5"
        y="16.5"
        width="7"
        height="8"
        rx="0.5"
        className="fill-primary/60 dark:fill-slate-600 transition-colors duration-300"
      />
      {/* Grille lines */}
      <line
        x1="11.5"
        y1="18.5"
        x2="18.5"
        y2="18.5"
        className="stroke-white/20 dark:stroke-slate-500"
        strokeWidth="0.6"
      />
      <line
        x1="11.5"
        y1="20.5"
        x2="18.5"
        y2="20.5"
        className="stroke-white/20 dark:stroke-slate-500"
        strokeWidth="0.6"
      />
      <line
        x1="11.5"
        y1="22.5"
        x2="18.5"
        y2="22.5"
        className="stroke-white/20 dark:stroke-slate-500"
        strokeWidth="0.6"
      />
      {/* Left headlight housing */}
      <rect
        x="3.5"
        y="16.5"
        width="7"
        height="7"
        rx="0.5"
        className="fill-primary/75 dark:fill-slate-600 transition-colors duration-300"
      />
      {/* Right headlight housing */}
      <rect
        x="19.5"
        y="16.5"
        width="7"
        height="7"
        rx="0.5"
        className="fill-primary/75 dark:fill-slate-600 transition-colors duration-300"
      />
      {/* Left headlight bulb */}
      <circle
        cx="7"
        cy="20"
        r="2.4"
        fill={isDark ? "#fbbf24" : "#4b5563"}
        style={
          isDark
            ? {
                filter:
                  "drop-shadow(0 0 4px #fbbf24) drop-shadow(0 0 10px #f59e0b)",
              }
            : undefined
        }
        className="transition-colors duration-300"
      />
      {/* Right headlight bulb */}
      <circle
        cx="23"
        cy="20"
        r="2.4"
        fill={isDark ? "#fbbf24" : "#4b5563"}
        style={
          isDark
            ? {
                filter:
                  "drop-shadow(0 0 4px #fbbf24) drop-shadow(0 0 10px #f59e0b)",
              }
            : undefined
        }
        className="transition-colors duration-300"
      />
      {/* Bumper */}
      <rect
        x="2"
        y="25.5"
        width="26"
        height="2.5"
        rx="0.5"
        className="fill-primary/50 dark:fill-slate-500 transition-colors duration-300"
      />
    </svg>
  </button>
);

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [jobsDropdownOpen, setJobsDropdownOpen] = useState(false);
  const [jobsMobileOpen, setJobsMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();
  const { user, loading: authLoading, signOut } = useAuth();

  // Use cached role during auth loading so nav links don't flash
  const cachedRole = authLoading
    ? (localStorage.getItem("cdl-cached-role") as
        | "driver"
        | "company"
        | "admin"
        | null)
    : null;
  const effectiveRole = user?.role ?? cachedRole;

  // Notification counts
  const { data: unreadMsgCount = 0 } = useUnreadCount(
    user?.id,
    user?.role as "driver" | "company" | undefined,
  );
  const { data: notifCount = 0 } = useUnreadNotificationCount(user?.id);

  // Company logo + verification status for navbar
  const { data: companyNavData } = useQuery({
    queryKey: ["company-logo", user?.id],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("company_profiles")
        .select("logo_url, is_verified")
        .eq("id", user!.id)
        .maybeSingle();
      return {
        logoUrl: (data?.logo_url as string) || null,
        isVerified: !!data?.is_verified,
      };
    },
    enabled: !!user && user.role === "company",
    staleTime: 5 * 60_000,
  });
  const companyLogoUrl = companyNavData?.logoUrl ?? null;
  const companyIsVerified = companyNavData?.isVerified ?? false;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setJobsMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const [signingOut, setSigningOut] = useState(false);
  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      setSignOutOpen(false);
      navigate("/");
      await signOut();
    } catch {
      toast.error("Sign out failed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      {/* Top bar */}
      <div className="hidden lg:block bg-secondary text-secondary-foreground">
        <div className="container mx-auto flex items-center justify-between py-2 text-sm">
          <div className="flex items-center gap-6">
            <a
              href="tel:+16189360241"
              className="flex items-center gap-2 hover:text-primary transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              +1 618-936-0241
            </a>
            <a
              href="mailto:info@cdljobscenter.com"
              className="flex items-center gap-2 hover:text-primary transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              info@cdljobscenter.com
            </a>
          </div>
          <p className="text-muted-foreground">Mon - Sat: 7:00 AM - 5:00 PM</p>
        </div>
      </div>

      {/* Main nav */}
      <nav
        ref={mobileMenuRef}
        className="sticky top-0 z-50 glass border-b border-border/50"
      >
        <div className="container mx-auto flex items-center justify-between py-4">
          <Link
            to="/"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3"
          >
            <img
              src={isDark ? "/logo-dark.svg" : "/logo.svg"}
              alt="CDL Jobs Center"
              className="h-16 object-contain"
              width={190}
              height={64}
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks
              .filter(
                (link) =>
                  !(link.name === "Apply Now" && effectiveRole === "company") &&
                  !(link.name === "Drivers" && effectiveRole === "driver") &&
                  !(link.name === "Pricing" && effectiveRole === "driver"),
              )
              .map((link) => {
                const displayName =
                  link.name === "Apply Now" && effectiveRole === "driver"
                    ? "Find My Matches"
                    : link.name;
                return link.dropdown ? (
                  <div
                    key={link.path}
                    className="relative"
                    onMouseEnter={() => setJobsDropdownOpen(true)}
                    onMouseLeave={() => setJobsDropdownOpen(false)}
                  >
                    {/* Trigger */}
                    <button
                      aria-haspopup="true"
                      aria-expanded={jobsDropdownOpen}
                      onClick={() => setJobsDropdownOpen((prev) => !prev)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setJobsDropdownOpen(false);
                      }}
                      className={`relative flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${
                        location.pathname === link.path
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {displayName}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${jobsDropdownOpen ? "rotate-180" : ""}`}
                      />
                      {location.pathname === link.path && (
                        <div className="absolute inset-0 rounded-lg bg-primary/10" />
                      )}
                    </button>

                    {/* Dropdown panel */}
                    {jobsDropdownOpen && (
                      <div className="animate-dropdown absolute top-full left-0 w-44 bg-card border border-border shadow-md py-1">
                        {link.dropdown.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setJobsDropdownOpen(false)}
                            className="block px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                          >
                            {item.name}
                          </Link>
                        ))}
                        {effectiveRole === "driver" && (
                          <>
                            <div className="border-t border-border my-1" />
                            <Link
                              to="/driver-dashboard?tab=saved"
                              onClick={() => setJobsDropdownOpen(false)}
                              className="block px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                            >
                              Saved Jobs
                            </Link>
                          </>
                        )}
                        {effectiveRole === "company" && (
                          <>
                            <div className="border-t border-border my-1" />
                            <Link
                              to="/dashboard?tab=jobs"
                              onClick={() => setJobsDropdownOpen(false)}
                              className="block px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                            >
                              Post a Job
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors
                    ${
                      location.pathname === link.path
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {displayName}
                    {location.pathname === link.path && (
                      <div className="absolute inset-0 rounded-lg bg-primary/10" />
                    )}
                  </Link>
                );
              })}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <TruckToggle isDark={isDark} onClick={toggle} />
            {authLoading ? (
              <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <>
                <Suspense fallback={null}>
                  <NotificationCenter
                    userId={user.id}
                    role={user.role as "driver" | "company" | "admin"}
                  />
                </Suspense>
                {/* Profile dropdown */}
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    aria-label="Open account menu"
                    className="group flex max-w-[300px] items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left shadow-sm transition-all hover:border-primary/50"
                  >
                    {companyLogoUrl ? (
                      <img
                        src={companyLogoUrl}
                        alt={`${user.name} logo`}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                        {getInitials(user.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                        {user.name}
                        {companyIsVerified && (
                          <CheckCircle
                            className="h-3.5 w-3.5 shrink-0 text-green-500"
                            aria-label="Verified company"
                          />
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {user.role === "admin"
                          ? "Admin Account"
                          : user.role === "company"
                            ? "Company Account"
                            : "Driver Account"}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {profileOpen && (
                    <div
                      className="animate-dropdown-profile absolute right-0 top-full z-50 mt-1.5 w-56 rounded-md border border-border bg-card py-1 shadow-md"
                      role="menu"
                      aria-label="Account menu"
                    >
                      <div className="px-4 py-2 border-b border-border mb-1">
                        <p className="text-sm font-medium truncate">
                          {user.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                      <Link
                        to={
                          user.role === "admin"
                            ? "/admin"
                            : user.role === "company"
                              ? "/dashboard"
                              : "/driver-dashboard"
                        }
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                        {user.role === "admin"
                          ? "Admin Dashboard"
                          : user.role === "company"
                            ? "Dashboard"
                            : "My Dashboard"}
                      </Link>
                      {user.role === "driver" && (
                        <Link
                          to="/driver-dashboard?tab=ai-matches"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                        >
                          <Truck className="h-3.5 w-3.5 shrink-0" />
                          AI Matches
                        </Link>
                      )}
                      {user.role !== "admin" && (
                        <Link
                          to={`${user.role === "company" ? "/dashboard" : "/driver-dashboard"}?tab=messages`}
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                        >
                          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                          Messages
                          {unreadMsgCount > 0 && (
                            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                            </span>
                          )}
                        </Link>
                      )}
                      <hr className="border-border my-1" />
                      <button
                        onClick={() => {
                          setSignOutOpen(true);
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                      >
                        <LogOut className="h-3.5 w-3.5 shrink-0" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSignInOpen(true)}
                >
                  Sign In
                </Button>
                <Button
                  size="sm"
                  className="glow-orange"
                  onClick={() => {
                    if (location.pathname === "/apply") {
                      toast.info("Sign in or create an account to apply");
                    } else {
                      navigate("/apply");
                    }
                  }}
                >
                  Apply Now
                </Button>
              </>
            )}
          </div>

          {/* Mobile: truck toggle + burger */}
          <div className="lg:hidden flex items-center gap-1">
            <TruckToggle isDark={isDark} onClick={toggle} />
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="animate-mobile-menu lg:hidden overflow-y-auto max-h-[80vh] border-t border-border/50">
            <div className="container mx-auto py-4 flex flex-col gap-2">
              {navLinks
                .filter(
                  (link) =>
                    !(
                      link.name === "Apply Now" && effectiveRole === "company"
                    ) &&
                    !(link.name === "Drivers" && effectiveRole === "driver") &&
                    !(link.name === "Pricing" && effectiveRole === "driver"),
                )
                .map((link) => {
                  const displayName =
                    link.name === "Apply Now" && effectiveRole === "driver"
                      ? "Find My Matches"
                      : link.name;
                  return link.dropdown ? (
                    <div key={link.path}>
                      <button
                        onClick={() => setJobsMobileOpen(!jobsMobileOpen)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors
                        ${
                          location.pathname === link.path
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {displayName}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${jobsMobileOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {jobsMobileOpen && (
                        <div className="overflow-hidden">
                          <div className="pl-4 flex flex-col gap-1 pt-1">
                            {link.dropdown.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => {
                                  setIsOpen(false);
                                  setJobsMobileOpen(false);
                                }}
                                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                              >
                                {item.name}
                              </Link>
                            ))}
                            {effectiveRole === "driver" && (
                              <>
                                <div className="border-t border-border my-1" />
                                <Link
                                  to="/driver-dashboard?tab=saved"
                                  onClick={() => {
                                    setIsOpen(false);
                                    setJobsMobileOpen(false);
                                  }}
                                  className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                                >
                                  Saved Jobs
                                </Link>
                              </>
                            )}
                            {effectiveRole === "company" && (
                              <>
                                <div className="border-t border-border my-1" />
                                <Link
                                  to="/dashboard?tab=jobs"
                                  onClick={() => {
                                    setIsOpen(false);
                                    setJobsMobileOpen(false);
                                  }}
                                  className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                                >
                                  Post a Job
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setIsOpen(false)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors
                      ${
                        location.pathname === link.path
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {displayName}
                    </Link>
                  );
                })}
              {authLoading ? (
                <div className="flex gap-2 pt-2">
                  <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
                </div>
              ) : user ? (
                <>
                  <Link
                    to={
                      user.role === "admin"
                        ? "/admin"
                        : user.role === "company"
                          ? "/dashboard"
                          : "/driver-dashboard"
                    }
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === "/dashboard" ||
                      location.pathname === "/driver-dashboard" ||
                      location.pathname === "/admin"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    {user.role === "admin"
                      ? "Admin Dashboard"
                      : user.role === "company"
                        ? "Dashboard"
                        : "My Dashboard"}
                    {notifCount > 0 && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {notifCount > 9 ? "9+" : notifCount}
                      </span>
                    )}
                  </Link>
                  {user.role === "driver" && (
                    <Link
                      to="/driver-dashboard?tab=ai-matches"
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        location.pathname === "/driver-dashboard"
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      <Truck className="h-4 w-4 shrink-0" />
                      AI Matches
                    </Link>
                  )}
                  <div className="flex gap-2 pt-2 items-center border-t border-border/50 mt-1">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-sm flex-1 text-muted-foreground">
                      <User className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-medium truncate">{user.name}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSignOutOpen(true);
                        setIsOpen(false);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setIsOpen(false);
                      setSignInOpen(true);
                    }}
                  >
                    Sign In
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setIsOpen(false);
                      if (location.pathname === "/apply") {
                        toast.info("Sign in or create an account to apply");
                      } else {
                        navigate("/apply");
                      }
                    }}
                  >
                    Apply Now
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {signInOpen && (
        <Suspense fallback={null}>
          <SignInModal onClose={() => setSignInOpen(false)} />
        </Suspense>
      )}

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSignOut} disabled={signingOut}>
              {signingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Navbar;
