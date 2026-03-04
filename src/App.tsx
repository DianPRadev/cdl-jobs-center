import { lazy, Suspense, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Spinner } from "./components/ui/Spinner";
import Index from "./pages/Index";
import AuthCallback from "./pages/AuthCallback";

// Auto-reload on stale chunk errors (happens after new deployments)
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch(() => {
      const key = "chunk_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        // Return a never-resolving promise so React doesn't try to render
        // while the page is reloading
        return new Promise<{ default: React.ComponentType }>(() => {});
      }
      // Already reloaded once — clear the flag and retry the import
      sessionStorage.removeItem(key);
      return factory();
    })
  );
}

const ApplyNow = lazyWithRetry(() => import("./pages/ApplyNow"));
const Jobs = lazyWithRetry(() => import("./pages/Jobs"));
const JobDetail = lazyWithRetry(() => import("./pages/JobDetail"));

const Drivers = lazyWithRetry(() => import("./pages/Drivers"));
const DriverProfile = lazyWithRetry(() => import("./pages/DriverProfile"));
const Companies = lazyWithRetry(() => import("./pages/Companies"));
const CompanyProfile = lazyWithRetry(() => import("./pages/CompanyProfile"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const DriverDashboard = lazyWithRetry(() => import("./pages/DriverDashboard"));
const SignIn = lazyWithRetry(() => import("./pages/SignIn"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing"));
const AdminDashboard = lazyWithRetry(() => import("./pages/AdminDashboard"));
const Verification = lazyWithRetry(() => import("./pages/Verification"));
const Onboarding = lazyWithRetry(() => import("./pages/Onboarding"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <AuthProvider>
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
              <Spinner />
            </div>
          }>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/apply" element={<ApplyNow />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/saved-jobs" element={<Navigate to="/driver-dashboard" replace />} />
            <Route path="/my-applications" element={<Navigate to="/driver-dashboard" replace />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/drivers/:id" element={<DriverProfile />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyProfile />} />
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="company"><Dashboard /></ProtectedRoute>} />
            <Route path="/verification" element={<ProtectedRoute requiredRole="company"><Verification /></ProtectedRoute>} />
            <Route path="/driver-dashboard" element={<ProtectedRoute requiredRole="driver"><DriverDashboard /></ProtectedRoute>} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
