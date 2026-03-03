import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link, useNavigationType } from "react-router-dom";
import { useApplication } from "@/hooks/useApplication";
import { useAuth } from "@/context/auth";
import { useDriverProfile } from "@/hooks/useDriverProfile";
import { useRefreshMyMatches, useDriverJobMatches, type DriverJobMatch } from "@/hooks/useMatchScores";
import { useQueryClient } from "@tanstack/react-query";
import { scoreJobsClientSide, type JobRow } from "@/lib/clientScoring";
import { SignInModal } from "@/components/SignInModal";
import { AIGenerationScreen } from "@/components/matching/AIGenerationScreen";
import { MatchResultsReveal } from "@/components/matching/MatchResultsReveal";
import { Sparkles, ChevronDown, ChevronUp, Check, Clock, User, Briefcase, Settings, CheckCircle2, X, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePageTitle } from "@/hooks/usePageTitle";
import { US_STATES } from "@/data/constants";

// ── Inline helpers ──

const ProgressBar = ({ step }: { step: number }) => {
  const steps = [
    { num: 1, label: "Personal Info", icon: User },
    { num: 2, label: "Experience", icon: Briefcase },
    { num: 3, label: "Preferences", icon: Settings },
    { num: 4, label: "AI Matching", icon: Sparkles },
    { num: 5, label: "Results", icon: CheckCircle2 },
  ];

  // For steps 4 & 5, hide the form-style progress and show a simpler indicator
  if (step >= 4) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        {steps.slice(0, 3).map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step > s.num ? "bg-green-500 text-white" : step === s.num ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div className={`flex-1 h-0.5 mx-3 transition-colors ${step > s.num ? "bg-green-500" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Estimated time: 2-3 min</span>
      </div>
    </div>
  );
};

const Chip = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
  <Badge
    variant={selected ? "default" : "outline"}
    className={`cursor-pointer select-none transition-colors px-3 py-1.5 text-xs ${
      selected ? "" : "hover:bg-muted"
    }`}
    onClick={onClick}
  >
    {selected && <Check className="h-3 w-3 mr-1" />}
    {label}
  </Badge>
);

const CollapsibleSection = ({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

const ToggleRow = ({ id, name, label, checked, onChange }: { id?: string; name?: string; label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between py-1.5">
    <label htmlFor={id} className="text-sm text-foreground cursor-pointer">{label}</label>
    <Switch id={id} name={name} checked={checked} onCheckedChange={onChange} className="data-[state=unchecked]:bg-muted" />
  </div>
);

const MATCH_STEP_KEY = "cdl-ai-match-step";

const ApplyNow = () => {
  usePageTitle("Apply Now");
  const { user, loading } = useAuth();
  const navType = useNavigationType();
  const [signInOpen, setSignInOpen] = useState(false);
  const { load, save } = useApplication();
  const saved = load();
  const { profile, saveProfile } = useDriverProfile(user?.id ?? "");
  const refreshMyMatches = useRefreshMyMatches(user?.id);
  const queryClient = useQueryClient();
  const shouldValidateRestoredStep = useRef(navType === "POP");

  // Only restore step from sessionStorage on back-navigation (POP).
  // Clicking "Apply Now" link is a PUSH — always start fresh at step 1.
  const [step, setStep] = useState(() => {
    if (navType !== "POP") return 1;
    const raw = sessionStorage.getItem(MATCH_STEP_KEY);
    if (!raw) return 1;
    const n = parseInt(raw, 10);
    if (n === 4) return 5; // can't replay animation, jump to results
    return n >= 1 && n <= 5 ? n : 1;
  });
  const [submitting, setSubmitting] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  // AI matching state
  const [matchesStartedAt, setMatchesStartedAt] = useState<number | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [matchRefreshDone, setMatchRefreshDone] = useState(false);
  const [clientFallbackMatches, setClientFallbackMatches] = useState<DriverJobMatch[]>([]);
  const handleAnimationComplete = useCallback(() => setAnimationComplete(true), []);

  // Fallback: force animation complete after 6s in case callback doesn't fire (mobile)
  useEffect(() => {
    if (step !== 4 || animationComplete) return;
    const fallback = setTimeout(() => setAnimationComplete(true), 6000);
    return () => clearTimeout(fallback);
  }, [step, animationComplete]);

  // Persist step to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(MATCH_STEP_KEY, String(step));
  }, [step]);

  const [firstName, setFirstName] = useState(saved.firstName ?? "");
  const [lastName, setLastName] = useState(saved.lastName ?? "");
  const [email, setEmail] = useState(saved.email ?? "");
  const [phone, setPhone] = useState(saved.phone ?? "");
  const [cdlNumber, setCdlNumber] = useState(saved.cdlNumber ?? "");
  const [zipCode, setZipCode] = useState(saved.zipCode ?? "");
  const [date, setDate] = useState(saved.date ?? "");
  const [driverType, setDriverType] = useState(saved.driverType ?? "");
  const [licenseClass, setLicenseClass] = useState(saved.licenseClass ?? "");
  const [yearsExp, setYearsExp] = useState(saved.yearsExp ?? "");
  const [licenseState, setLicenseState] = useState(saved.licenseState ?? "");
  const [soloTeam, setSoloTeam] = useState(saved.soloTeam ?? "Solo");
  const [notes, setNotes] = useState(saved.notes ?? "");
  const [prefs, setPrefs] = useState({
    betterPay: false, betterHomeTime: false,
    healthInsurance: false, bonuses: false,
    newEquipment: false,
    ...(saved.prefs ?? {}),
  });
  const [endorse, setEndorse] = useState({
    doublesTriples: false, hazmat: false,
    tankVehicles: false, tankerHazmat: false,
    ...(saved.endorse ?? {}),
  });
  const [hauler, setHauler] = useState({
    box: false, carHaul: false, dropAndHook: false,
    dryBulk: false, dryVan: false, flatbed: false,
    hopperBottom: false, intermodal: false, oilField: false,
    oversizeLoad: false, refrigerated: false, tanker: false,
    ...(saved.hauler ?? {}),
  });
  const [route, setRoute] = useState({
    dedicated: false, local: false, ltl: false,
    otr: false, regional: false,
    ...(saved.route ?? {}),
  });
  const [extra, setExtra] = useState({
    leasePurchase: false, accidents: false,
    suspended: false, newsletters: false,
    ...(saved.extra ?? {}),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch matches unconditionally so they survive back-navigation
  const { data: matches = [], isLoading: matchesLoading } = useDriverJobMatches(
    user?.id,
    { limit: 20, minScore: 0, excludeHidden: true },
  );

  // Determine if matches are still computing (no fresh results since submission)
  const isStillComputing = matchesStartedAt
    ? !matches.some((m) => new Date(m.computedAt).getTime() > matchesStartedAt)
    : false;

  // If we restored from browser history to step 5 with no matches, fall back once.
  // Do not keep forcing step 1 during a fresh search flow.
  useEffect(() => {
    if (!shouldValidateRestoredStep.current || matchesLoading) return;
    if (step === 5 && matches.length === 0 && !matchesStartedAt) {
      setStep(1);
    }
    shouldValidateRestoredStep.current = false;
  }, [step, matchesLoading, matches.length, matchesStartedAt]);

  // Reset matchesStartedAt when entering step 4 (prevents stale timestamps on back-navigation)
  useEffect(() => {
    if (step === 4 && !matchesStartedAt) {
      setMatchesStartedAt(Date.now());
    }
  }, [step, matchesStartedAt]);

  // Poll for fresh matches during step 4 AND step 5 (while still computing)
  useEffect(() => {
    if (!user?.id) return;
    // Poll on step 4 always, or step 5 while results are still computing
    const shouldPoll = step === 4 || (step === 5 && isStillComputing);
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["driver-matches", user.id] });
    }, 3000);
    return () => clearInterval(interval);
  }, [step, user?.id, queryClient, isStillComputing]);

  // Hard timeout: if still no DB matches after 15s, compute client-side fallback
  useEffect(() => {
    if (step !== 5 || !isStillComputing || !matchesStartedAt) return;
    const elapsed = Date.now() - matchesStartedAt;
    const remaining = Math.max(0, 15000 - elapsed);
    const timer = setTimeout(async () => {
      try {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id, title, company_name, company_id, location, pay, type, route_type, driver_type, team_driving, status")
          .eq("status", "Active");
        if (jobs && jobs.length > 0) {
          // Fetch logos
          const companyIds = [...new Set(jobs.map(j => j.company_id).filter(Boolean))] as string[];
          const logoMap = new Map<string, string | null>();
          if (companyIds.length > 0) {
            const { data: logos } = await supabase.from("company_profiles").select("id, logo_url").in("id", companyIds);
            for (const row of logos ?? []) logoMap.set(row.id, row.logo_url ?? null);
          }
          const jobRows: JobRow[] = jobs.map(j => ({ ...j, logo_url: logoMap.get(j.company_id) ?? null } as JobRow));
          const scored = scoreJobsClientSide(
            { driverType, licenseClass, yearsExp, licenseState, soloTeam, endorse, hauler, route },
            jobRows,
          );
          setClientFallbackMatches(scored.slice(0, 20));
        }
      } catch (err) {
        console.error("Client-side scoring failed:", err);
      }
      setMatchesStartedAt(null); // stop "still computing"
    }, remaining);
    return () => clearTimeout(timer);
  }, [step, isStillComputing, matchesStartedAt, driverType, licenseClass, yearsExp, licenseState, soloTeam, endorse, hauler, route]);

  // Transition from step 4 → 5 when animation complete
  useEffect(() => {
    if (step !== 4 || !animationComplete || !matchesStartedAt) return;

    // If we have any matches (fresh or stale), show them immediately
    if (matches.length > 0) {
      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Edge function finished (success or error) with no matches — run client-side scoring and transition
    if (matchRefreshDone) {
      queryClient.invalidateQueries({ queryKey: ["driver-matches", user?.id] });
      const timer = setTimeout(async () => {
        // If still no DB matches after final refetch, compute client-side
        try {
          const { data: jobs } = await supabase
            .from("jobs")
            .select("id, title, company_name, company_id, location, pay, type, route_type, driver_type, team_driving, status")
            .eq("status", "Active");
          if (jobs && jobs.length > 0) {
            const companyIds = [...new Set(jobs.map(j => j.company_id).filter(Boolean))] as string[];
            const logoMap = new Map<string, string | null>();
            if (companyIds.length > 0) {
              const { data: logos } = await supabase.from("company_profiles").select("id, logo_url").in("id", companyIds);
              for (const row of logos ?? []) logoMap.set(row.id, row.logo_url ?? null);
            }
            const jobRows: JobRow[] = jobs.map(j => ({ ...j, logo_url: logoMap.get(j.company_id) ?? null } as JobRow));
            const scored = scoreJobsClientSide(
              { driverType, licenseClass, yearsExp, licenseState, soloTeam, endorse, hauler, route },
              jobRows,
            );
            setClientFallbackMatches(scored.slice(0, 20));
          }
        } catch (err) {
          console.error("Client-side fallback scoring failed:", err);
        }
        setStep(5);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 1500);
      return () => clearTimeout(timer);
    }

    // Edge function still running — poll every 2s, hard cap at 20s
    const elapsed = Date.now() - matchesStartedAt;
    if (elapsed > 20000) {
      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["driver-matches", user?.id] });
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, animationComplete, matchesStartedAt, matchRefreshDone, matches, queryClient, user?.id, driverType, licenseClass, yearsExp, licenseState, soloTeam, endorse, hauler, route]);

  // Pre-fill empty fields from driver profile (Supabase)
  useEffect(() => {
    if (!profile) return;
    setFirstName(prev => prev || profile.firstName);
    setLastName(prev => prev || profile.lastName);
    setPhone(prev => prev || profile.phone);
    setCdlNumber(prev => prev || profile.cdlNumber);
    setLicenseClass(prev => prev || profile.licenseClass);
    setYearsExp(prev => prev || profile.yearsExp);
    setDriverType(prev => prev || profile.driverType);
    setLicenseState(prev => prev || profile.licenseState);
    setZipCode(prev => prev || profile.zipCode);
  }, [profile]);

  // Pre-fill email from auth user
  useEffect(() => {
    if (user?.email) setEmail(prev => prev || user.email);
  }, [user]);

  // Loading guard
  if (loading) return null;

  // Auth gate
  if (!user || user.role === "company") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-16 max-w-xl text-center">
          <p className="text-sm text-muted-foreground mb-6">
            <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
            <span className="mx-1">&raquo;</span>
            AI Job Matching
          </p>
          <div className="border border-border bg-card p-12">
            <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            {!user ? (
              <>
                <h2 className="font-display font-bold text-lg mb-2">Sign in to find your matches</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  You need a driver account to use AI job matching.
                </p>
                <Button onClick={() => setSignInOpen(true)}>Sign In / Register</Button>
              </>
            ) : (
              <>
                <h2 className="font-display font-bold text-lg mb-2">Not available</h2>
                <p className="text-sm text-muted-foreground">
                  Company accounts cannot use driver job matching.
                </p>
              </>
            )}
          </div>
        </main>
        <Footer />
        {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
      </div>
    );
  }

  // ── Helpers ──

  const tog = <T extends Record<string, boolean>>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof T) =>
    () => setter((prev) => ({ ...prev, [key]: !prev[key] }));

  const saveDraft = () => {
    const data = {
      firstName, lastName, email, phone, cdlNumber, zipCode, date,
      driverType, licenseClass, yearsExp, licenseState, soloTeam, notes,
      prefs, endorse, hauler, route, extra,
    };
    save(data);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (!phone.trim()) e.phone = "Phone is required";
    else if (!/^[\d\s()+-]{7,20}$/.test(phone.trim())) e.phone = "Enter a valid phone number";
    if (!cdlNumber.trim()) e.cdlNumber = "CDL number is required";
    if (!zipCode.trim()) e.zipCode = "Zip code is required";
    else if (!/^\d{5}(-\d{4})?$/.test(zipCode)) e.zipCode = "Enter a valid zip code";
    return e;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!driverType) e.driverType = "Select a driver type";
    if (!licenseClass) e.licenseClass = "Select a license class";
    if (!yearsExp) e.yearsExp = "Select years of experience";
    if (!licenseState) e.licenseState = "Select your license state";
    return e;
  };

  const nextStep = () => {
    let errs: Record<string, string> = {};
    if (step === 1) {
      errs = validateStep1();
      // If validation fails while summary card is shown, switch to edit mode so errors are visible
      if (Object.keys(errs).length > 0 && !editingProfile) {
        setEditingProfile(true);
      }
    }
    if (step === 2) errs = validateStep2();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const errorFields = Object.values(errs);
      toast.error(errorFields.length === 1 ? errorFields[0] : `Please fix ${errorFields.length} errors: ${errorFields.join(", ")}`);
      return;
    }
    setErrors({});
    saveDraft();
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prevStep = () => {
    setErrors({});
    saveDraft();
    setStep(step - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only allow submit from Step 3
    if (step !== 3) {
      nextStep();
      return;
    }
    setSubmitting(true);

    try {
      saveDraft();

      // Run profile save + application insert in parallel (both non-fatal)
      await Promise.all([
        // 1. Upsert driver profile
        saveProfile({
          firstName, lastName, phone, cdlNumber, driverType, licenseClass,
          yearsExp, licenseState, zipCode, dateOfBirth: date, about: notes,
          homeAddress: "", interestedIn: "", nextJobWant: "", hasAccidents: "", wantsContact: "",
        }),
        // 2. Insert enrichment application (non-fatal)
        supabase.from("applications").insert({
          driver_id: user.id, company_id: null, job_id: null,
          company_name: "General Application", job_title: "AI Match Profile",
          first_name: firstName, last_name: lastName, email, phone,
          cdl_number: cdlNumber, zip_code: zipCode, available_date: date || null,
          driver_type: driverType, license_class: licenseClass,
          years_exp: yearsExp, license_state: licenseState, solo_team: soloTeam,
          notes, prefs, endorse, hauler, route, extra, pipeline_stage: "New",
        }).then(({ error }) => { if (error) console.error("Application insert failed:", error); }),
      ]);

      // Fire match refresh after latest profile/application data is persisted.
      setMatchRefreshDone(false);
      void refreshMyMatches.mutateAsync()
        .then(() => setMatchRefreshDone(true))
        .catch((err) => {
          console.error("Match refresh failed:", err);
          toast.error("Could not refresh AI matches right now. Please try again.");
          setMatchRefreshDone(true);
        });

      // 4. Transition to AI generation screen
      setMatchesStartedAt(Date.now());
      setAnimationComplete(false);
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Check if profile has enough data for summary card
  const hasProfileData = firstName && lastName && email && cdlNumber;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto py-8 max-w-3xl">
        {/* Breadcrumb */}
        <p className="text-sm text-muted-foreground mb-6">
          <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
          <span className="mx-1">&raquo;</span>
          AI Job Matching
        </p>

        <div className="bg-card border border-border shadow-sm">
          <div className="px-6 pt-6 pb-8">

            {/* Progress bar — only shows for steps 1-3 */}
            <ProgressBar step={step} />

            {/* Draft saved indicator */}
            {draftSaved && step <= 3 && (
              <p className="text-xs text-green-500 mb-4 flex items-center gap-1">
                <Check className="h-3 w-3" /> Draft saved
              </p>
            )}

            {/* ── STEP 1: Personal Info ── */}
            {step === 1 && (
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-semibold text-lg">Personal Information</h2>
                    {editingProfile && (
                      <button type="button" onClick={() => setEditingProfile(false)} className="text-muted-foreground hover:text-foreground transition-colors" title="Cancel editing">
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* Profile summary card for logged-in users with data */}
                  {hasProfileData && !editingProfile ? (
                    <div className="border border-border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-foreground">Your profile:</p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingProfile(true)} className="text-xs">
                          Edit details
                        </Button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {firstName} {lastName}</p>
                        <p><span className="text-muted-foreground">Email:</span> {email}</p>
                        <p><span className="text-muted-foreground">Phone:</span> {phone || "—"}</p>
                        <p><span className="text-muted-foreground">CDL #:</span> {cdlNumber}</p>
                        <p><span className="text-muted-foreground">Zip:</span> {zipCode || "—"}</p>
                        <p><span className="text-muted-foreground">Available:</span> {date || "—"}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label htmlFor="apply-firstName" className="text-xs text-muted-foreground">First Name *</Label>
                          <Input id="apply-firstName" name="firstName" autoComplete="given-name" value={firstName} onChange={(e) => { setFirstName(e.target.value); setErrors(p => ({ ...p, firstName: "" })); }} placeholder="First name" className={errors.firstName ? "border-destructive" : ""} />
                          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="apply-lastName" className="text-xs text-muted-foreground">Last Name *</Label>
                          <Input id="apply-lastName" name="lastName" autoComplete="family-name" value={lastName} onChange={(e) => { setLastName(e.target.value); setErrors(p => ({ ...p, lastName: "" })); }} placeholder="Last name" className={errors.lastName ? "border-destructive" : ""} />
                          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="apply-email" className="text-xs text-muted-foreground">Email *</Label>
                          <Input id="apply-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }} placeholder="email@example.com" className={errors.email ? "border-destructive" : ""} />
                          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="apply-phone" className="text-xs text-muted-foreground">Phone *</Label>
                          <Input id="apply-phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: "" })); }} placeholder="(555) 000-0000" className={errors.phone ? "border-destructive" : ""} />
                          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="apply-cdlNumber" className="text-xs text-muted-foreground">CDL Number *</Label>
                          <Input id="apply-cdlNumber" name="cdlNumber" autoComplete="off" value={cdlNumber} onChange={(e) => { setCdlNumber(e.target.value); setErrors(p => ({ ...p, cdlNumber: "" })); }} placeholder="CDL-XX-000000" className={errors.cdlNumber ? "border-destructive" : ""} />
                          {errors.cdlNumber && <p className="text-xs text-destructive">{errors.cdlNumber}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="apply-zipCode" className="text-xs text-muted-foreground">Zip Code *</Label>
                          <Input id="apply-zipCode" name="zipCode" autoComplete="postal-code" value={zipCode} onChange={(e) => { setZipCode(e.target.value); setErrors(p => ({ ...p, zipCode: "" })); }} placeholder="00000" className={errors.zipCode ? "border-destructive" : ""} />
                          {errors.zipCode && <p className="text-xs text-destructive">{errors.zipCode}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="apply-availableDate" className="text-xs text-muted-foreground">Available Date</Label>
                          <Input id="apply-availableDate" name="availableDate" type="date" autoComplete="off" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    {editingProfile ? (
                      <Button type="button" variant="outline" onClick={() => setEditingProfile(false)}>Cancel editing</Button>
                    ) : <div />}
                    <Button type="submit" className="px-8">
                      Next
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* ── STEP 2: Experience ── */}
            {step === 2 && (
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <h2 className="font-display font-semibold text-lg">Driving Experience</h2>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="apply-driverType" className="text-xs text-muted-foreground">Driver Type *</Label>
                      <Select value={driverType} onValueChange={(v) => { setDriverType(v); setErrors((p) => ({ ...p, driverType: "" })); }} name="driverType">
                        <SelectTrigger id="apply-driverType" className={errors.driverType ? "border-destructive" : ""}><SelectValue placeholder="Select driver type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Company Driver</SelectItem>
                          <SelectItem value="owner-operator">Owner Operator</SelectItem>
                          <SelectItem value="lease">Lease Operator</SelectItem>
                          <SelectItem value="student">Student / Trainee</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.driverType && <p className="text-xs text-destructive">{errors.driverType}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="apply-licenseClass" className="text-xs text-muted-foreground">License Class *</Label>
                      <Select value={licenseClass} onValueChange={(v) => { setLicenseClass(v); setErrors((p) => ({ ...p, licenseClass: "" })); }} name="licenseClass">
                        <SelectTrigger id="apply-licenseClass" className={errors.licenseClass ? "border-destructive" : ""}><SelectValue placeholder="Select class" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="a">Class A</SelectItem>
                          <SelectItem value="b">Class B</SelectItem>
                          <SelectItem value="c">Class C</SelectItem>
                          <SelectItem value="permit">Permit Only</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.licenseClass && <p className="text-xs text-destructive">{errors.licenseClass}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="apply-yearsExp" className="text-xs text-muted-foreground">Years Experience *</Label>
                      <Select value={yearsExp} onValueChange={(v) => { setYearsExp(v); setErrors((p) => ({ ...p, yearsExp: "" })); }} name="yearsExp">
                        <SelectTrigger id="apply-yearsExp" className={errors.yearsExp ? "border-destructive" : ""}><SelectValue placeholder="Select experience" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="less-1">Less than 1 year</SelectItem>
                          <SelectItem value="1-3">1-3 years</SelectItem>
                          <SelectItem value="3-5">3-5 years</SelectItem>
                          <SelectItem value="5+">5+ years</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.yearsExp && <p className="text-xs text-destructive">{errors.yearsExp}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="apply-licenseState" className="text-xs text-muted-foreground">License State *</Label>
                      <Select value={licenseState} onValueChange={(v) => { setLicenseState(v); setErrors((p) => ({ ...p, licenseState: "" })); }} name="licenseState">
                        <SelectTrigger id="apply-licenseState" className={errors.licenseState ? "border-destructive" : ""}><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nationwide">Nationwide / Any State</SelectItem>
                          {US_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.licenseState && <p className="text-xs text-destructive">{errors.licenseState}</p>}
                    </div>
                  </div>

                  {/* Solo/Team */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Interested in solo or team driving?</span>
                    <Select value={soloTeam} onValueChange={setSoloTeam} name="soloTeam">
                      <SelectTrigger id="apply-soloTeam" className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Solo">Solo</SelectItem>
                        <SelectItem value="Team">Team</SelectItem>
                        <SelectItem value="Either">Either</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Endorsements — collapsible with chips */}
                  <CollapsibleSection title="Endorsements (optional)">
                    <div className="flex flex-wrap gap-2">
                      <Chip label="Doubles/Triples (T)" selected={endorse.doublesTriples} onClick={tog(setEndorse, "doublesTriples")} />
                      <Chip label="HAZMAT (H)" selected={endorse.hazmat} onClick={tog(setEndorse, "hazmat")} />
                      <Chip label="Tank Vehicles (N)" selected={endorse.tankVehicles} onClick={tog(setEndorse, "tankVehicles")} />
                      <Chip label="Tanker + HAZMAT (X)" selected={endorse.tankerHazmat} onClick={tog(setEndorse, "tankerHazmat")} />
                    </div>
                  </CollapsibleSection>

                  <div className="flex justify-between pt-4">
                    <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
                    <Button type="submit" className="px-8">Next</Button>
                  </div>
                </div>
              </form>
            )}

            {/* ── STEP 3: Preferences & Submit ── */}
            {step === 3 && (
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <h2 className="font-display font-semibold text-lg">Preferences</h2>

                  {/* Hauler experience — chips */}
                  <CollapsibleSection title="Hauler Experience (optional)">
                    <div className="flex flex-wrap gap-2">
                      <Chip label="Box" selected={hauler.box} onClick={tog(setHauler, "box")} />
                      <Chip label="Car Hauler" selected={hauler.carHaul} onClick={tog(setHauler, "carHaul")} />
                      <Chip label="Drop and Hook" selected={hauler.dropAndHook} onClick={tog(setHauler, "dropAndHook")} />
                      <Chip label="Dry Bulk" selected={hauler.dryBulk} onClick={tog(setHauler, "dryBulk")} />
                      <Chip label="Dry Van" selected={hauler.dryVan} onClick={tog(setHauler, "dryVan")} />
                      <Chip label="Flatbed" selected={hauler.flatbed} onClick={tog(setHauler, "flatbed")} />
                      <Chip label="Hopper Bottom" selected={hauler.hopperBottom} onClick={tog(setHauler, "hopperBottom")} />
                      <Chip label="Intermodal" selected={hauler.intermodal} onClick={tog(setHauler, "intermodal")} />
                      <Chip label="Oil Field" selected={hauler.oilField} onClick={tog(setHauler, "oilField")} />
                      <Chip label="Oversize Load" selected={hauler.oversizeLoad} onClick={tog(setHauler, "oversizeLoad")} />
                      <Chip label="Refrigerated" selected={hauler.refrigerated} onClick={tog(setHauler, "refrigerated")} />
                      <Chip label="Tanker" selected={hauler.tanker} onClick={tog(setHauler, "tanker")} />
                    </div>
                  </CollapsibleSection>

                  {/* Route preference — chips */}
                  <CollapsibleSection title="Route Preference (optional)">
                    <div className="flex flex-wrap gap-2">
                      <Chip label="Dedicated" selected={route.dedicated} onClick={tog(setRoute, "dedicated")} />
                      <Chip label="Local" selected={route.local} onClick={tog(setRoute, "local")} />
                      <Chip label="LTL" selected={route.ltl} onClick={tog(setRoute, "ltl")} />
                      <Chip label="OTR" selected={route.otr} onClick={tog(setRoute, "otr")} />
                      <Chip label="Regional" selected={route.regional} onClick={tog(setRoute, "regional")} />
                    </div>
                  </CollapsibleSection>

                  {/* Job priorities — chips */}
                  <CollapsibleSection title="What do you want in your next job? (optional)" defaultOpen>
                    <div className="flex flex-wrap gap-2">
                      <Chip label="Better Pay" selected={prefs.betterPay} onClick={tog(setPrefs, "betterPay")} />
                      <Chip label="Better Home Time" selected={prefs.betterHomeTime} onClick={tog(setPrefs, "betterHomeTime")} />
                      <Chip label="Health Insurance" selected={prefs.healthInsurance} onClick={tog(setPrefs, "healthInsurance")} />
                      <Chip label="Bonuses" selected={prefs.bonuses} onClick={tog(setPrefs, "bonuses")} />
                      <Chip label="New Equipment" selected={prefs.newEquipment} onClick={tog(setPrefs, "newEquipment")} />
                    </div>
                  </CollapsibleSection>

                  {/* Additional questions — keep as toggles */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">Additional Information</h3>
                    <ToggleRow id="apply-leasePurchase" name="leasePurchase" label="Interested in lease purchase?" checked={extra.leasePurchase} onChange={(v) => setExtra(p => ({ ...p, leasePurchase: v }))} />
                    <ToggleRow id="apply-accidents" name="accidents" label="Accidents or violations in the past 3 years?" checked={extra.accidents} onChange={(v) => setExtra(p => ({ ...p, accidents: v }))} />
                    <ToggleRow id="apply-suspended" name="suspended" label="License suspended or DUI/DWI in the past 10 years?" checked={extra.suspended} onChange={(v) => setExtra(p => ({ ...p, suspended: v }))} />
                    <ToggleRow id="apply-newsletters" name="newsletters" label="Sign me up for newsletters and job alerts" checked={extra.newsletters} onChange={(v) => setExtra(p => ({ ...p, newsletters: v }))} />
                  </div>

                  {/* Notes */}
                  <div>
                    <Label htmlFor="apply-notes" className="text-sm font-medium mb-2 block">Anything else we should know? (optional):</Label>
                    <Textarea
                      id="apply-notes"
                      name="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Tell us about yourself, your experience, or what you're looking for..."
                      rows={4}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {notes.trim() ? notes.trim().split(/\s+/).length : 0} words
                    </p>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
                    <Button type="submit" className="px-8" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Find My Matches
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* ── STEP 4: AI Generation Animation ── */}
            {step === 4 && (
              <AIGenerationScreen onAllPhasesComplete={handleAnimationComplete} />
            )}

            {/* ── STEP 5: Match Results ── */}
            {step === 5 && (() => {
              // Use DB matches if available, otherwise fall back to client-scored matches
              const displayMatches = matches.length > 0 ? matches : clientFallbackMatches;
              return (
                <>
                  <MatchResultsReveal
                    matches={displayMatches}
                    isStillComputing={isStillComputing}
                  />
                  <div className="flex justify-center mt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        sessionStorage.removeItem(MATCH_STEP_KEY);
                        setMatchesStartedAt(null);
                        setAnimationComplete(false);
                        setMatchRefreshDone(false);
                        setClientFallbackMatches([]);
                        setStep(1);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                      Update Profile &amp; Search Again
                    </Button>
                  </div>
                </>
              );
            })()}

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ApplyNow;
