import { useState, useEffect, useCallback } from "react";
import { X, Mail, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { friendlySignInError } from "@/lib/authErrorMessages";
import { getPasswordStrength, type PasswordStrengthLevel } from "@/lib/passwordStrength";
import { US_STATES, DRIVER_INTERESTS, DRIVER_NEXT_JOB, COMPANY_GOALS } from "@/data/constants";
import { SocialLoginButtons, OrDivider } from "@/components/SocialLoginButtons";

type View = "login" | "rules" | "register" | "forgot" | "confirm-email";

const RULES_TEXT = `General rules of conduct on the website:

To begin with, hundreds of people of different backgrounds work with CDL Jobs Center, and all of them are full-fledged users of our platform, so if we want a community of people to function, then we need rules. We strongly recommend that you read these rules. It will take just five minutes, but it will save your and our time and will help make the platform more interesting and organized.

Firstly, you should behave respectfully to all visitors on our website. Do not insult other participants — it is always unwanted. If you have a complaint, contact administrators or moderators. We consider insulting other visitors one of the most serious violations and it is severely punished by the administration. Racism, religious and political speech are strictly forbidden. Thank you for your understanding.

The following is strictly prohibited:

- Messages not related to the content of job listings or to the context of the discussion
- Insults and threats to other users
- Expressions that contain profanity, degrading or inciting language
- Spam and advertising of any goods and services not related to CDL job postings

Let us respect each other and the site where drivers and companies come to connect. The Administration reserves the right to remove content, or accounts, if they do not meet these requirements.

If you violate the rules you may be given a warning. In some cases, you may be banned without warning. Contact the Administrator regarding ban removal.

Insulting administrators and moderators is also punishable by a ban — Respect other people's labor.`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

const REG_DRAFT_KEY = "cdl-reg-draft";

function loadRegDraft(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(REG_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveRegDraft(fields: Record<string, string>) {
  sessionStorage.setItem(REG_DRAFT_KEY, JSON.stringify(fields));
}

function clearRegDraft() {
  sessionStorage.removeItem(REG_DRAFT_KEY);
}

interface SignInModalProps {
  onClose: () => void;
}

const ModalHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
    <div className="flex items-center gap-3">
      <div className="w-1 h-5 bg-primary shrink-0" />
      <h2 className="font-display font-bold text-base">{title}</h2>
    </div>
    <button onClick={onClose} className="p-1 hover:text-primary transition-colors" aria-label="Close">
      <X className="h-5 w-5" />
    </button>
  </div>
);

const strengthGradientByLevel: Record<PasswordStrengthLevel, string> = {
  weak: "from-rose-600 to-red-500",
  fair: "from-amber-500 to-orange-500",
  good: "from-lime-500 to-emerald-500",
  strong: "from-emerald-500 via-teal-500 to-cyan-500",
};

const strengthTextByLevel: Record<PasswordStrengthLevel, string> = {
  weak: "text-destructive",
  fair: "text-amber-700 dark:text-amber-400",
  good: "text-lime-700 dark:text-lime-400",
  strong: "text-emerald-700 dark:text-emerald-400",
};

const formatStrengthLabel = (level: PasswordStrengthLevel) =>
  level.charAt(0).toUpperCase() + level.slice(1);

const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  if (!password) return null;

  const strength = getPasswordStrength(password);
  const width = Math.max((strength.score / 5) * 100, 8);
  const hints: Array<{ ok: boolean; label: string }> = [
    { ok: password.length >= 12, label: "12+ chars" },
    { ok: /[A-Z]/.test(password), label: "uppercase" },
    { ok: /[a-z]/.test(password), label: "lowercase" },
    { ok: /\d/.test(password), label: "number" },
    { ok: /[^A-Za-z0-9]/.test(password), label: "symbol" },
  ];
  const missing = hints.filter((h) => !h.ok).map((h) => h.label);
  const conciseHint =
    missing.length === 0 ? "Looks strong." : `Add ${missing.slice(0, 2).join(" + ")}.`;

  return (
    <div className="space-y-1.5 pt-0.5" aria-live="polite">
      <div className="flex items-center justify-between text-[11px] leading-none">
        <span className="text-muted-foreground">{conciseHint}</span>
        <span className={`font-semibold ${strengthTextByLevel[strength.label]}`}>
          {formatStrengthLabel(strength.label)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out ${strengthGradientByLevel[strength.label]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
};

export function SignInModal({ onClose }: SignInModalProps) {
  const [view, setView] = useState<View>("login");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, register } = useAuth();

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  // Shared register state — hydrate from sessionStorage draft
  const [draft] = useState(loadRegDraft);
  const [role, setRole] = useState<"driver" | "company">((draft.role as "driver" | "company") || "driver");
  const [regEmail, setRegEmail] = useState(draft.regEmail || "");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const passwordsDoNotMatch = regConfirm.length > 0 && regPassword !== regConfirm;
  const [zipError, setZipError] = useState("");

  // Driver-specific
  const [regUsername, setRegUsername] = useState(draft.regUsername || "");
  const [driverName, setDriverName] = useState(draft.driverName || "");
  const [homeAddress, setHomeAddress] = useState(draft.homeAddress || "");
  const [zipCode, setZipCode] = useState(draft.zipCode || "");
  const [driverPhone, setDriverPhone] = useState(draft.driverPhone || "");
  const [cdlNumber, setCdlNumber] = useState(draft.cdlNumber || "");
  const [interestedIn, setInterestedIn] = useState<string>(draft.interestedIn || DRIVER_INTERESTS[0]);
  const [nextJobWant, setNextJobWant] = useState<string>(draft.nextJobWant || DRIVER_NEXT_JOB[0]);
  const [hasAccidents, setHasAccidents] = useState(draft.hasAccidents || "No");
  const [wantsContact, setWantsContact] = useState(draft.wantsContact || "Yes");

  // Company-specific
  const [contactName, setContactName] = useState(draft.contactName || "");
  const [contactTitle, setContactTitle] = useState(draft.contactTitle || "");
  const [companyName, setCompanyName] = useState(draft.companyName || "");
  const [companyAddress, setCompanyAddress] = useState(draft.companyAddress || "");
  const [companyPhone, setCompanyPhone] = useState(draft.companyPhone || "");
  const [companyState, setCompanyState] = useState(draft.companyState || "");
  const [companyGoal, setCompanyGoal] = useState<string>(draft.companyGoal || COMPANY_GOALS[0]);

  // Persist registration fields to sessionStorage on change
  const saveDraft = useCallback(() => {
    saveRegDraft({
      role, regEmail, regUsername, driverName, homeAddress, zipCode,
      driverPhone, cdlNumber, interestedIn, nextJobWant, hasAccidents, wantsContact,
      contactName, contactTitle, companyName, companyAddress, companyPhone, companyState, companyGoal,
    });
  }, [role, regEmail, regUsername, driverName, homeAddress, zipCode,
      driverPhone, cdlNumber, interestedIn, nextJobWant, hasAccidents, wantsContact,
      contactName, contactTitle, companyName, companyAddress, companyPhone, companyState, companyGoal]);

  useEffect(() => { saveDraft(); }, [saveDraft]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    const timeout = setTimeout(() => {
      setSubmitting(false);
      toast.error("Sign in is taking too long. Please try again.");
    }, 15000);
    try {
      await signIn(loginEmail, loginPassword);
      clearTimeout(timeout);
      toast.success("Welcome back!");
      onClose();
    } catch (err) {
      clearTimeout(timeout);
      toast.error(friendlySignInError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const friendlyRegisterError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered"))
      return "This email is already registered. Please sign in instead.";
    if (msg.toLowerCase().includes("password") || msg.includes("422"))
      return "Password must be at least 12 characters.";
    return msg || "Registration failed. Please try again.";
  };

  const handleDriverRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername || !regPassword || !regEmail) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!EMAIL_RE.test(regEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (regPassword.length < 12) {
      toast.error("Password must be at least 12 characters.");
      return;
    }
    if (regPassword !== regConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (zipCode && !ZIP_RE.test(zipCode)) {
      setZipError("Enter a valid US zip code (e.g. 33304).");
      toast.error("Enter a valid US zip code.");
      return;
    }
    setZipError("");
    setSubmitting(true);
    const timeout = setTimeout(() => {
      setSubmitting(false);
      toast.error("Registration is taking too long. Please try again.");
    }, 15000);
    try {
      const [first, ...rest] = driverName.trim().split(/\s+/);
      const driverFields = {
        first_name: first || "",
        last_name: rest.join(" ") || "",
        phone: driverPhone || "",
        cdl_number: cdlNumber || "",
        zip_code: zipCode || "",
        home_address: homeAddress || "",
        interested_in: interestedIn || "",
        next_job_want: nextJobWant || "",
        has_accidents: hasAccidents || "",
        wants_contact: wantsContact || "",
      };
      await register(regUsername, regEmail, regPassword, "driver", driverFields);

      // Check if session was created (email confirmation not required)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const { error: upsertErr } = await supabase.from("driver_profiles").upsert({ id: session.user.id, ...driverFields });
          // If full upsert fails (e.g. new columns not yet migrated), retry with base columns only
          if (upsertErr) {
            await supabase.from("driver_profiles").upsert({
              id: session.user.id,
              first_name: driverFields.first_name,
              last_name: driverFields.last_name,
              phone: driverFields.phone,
              cdl_number: driverFields.cdl_number,
              zip_code: driverFields.zip_code,
            });
          }
        } catch { /* deferred population in AuthContext handles this */ }
        clearRegDraft();
        toast.success("Registration successful!");
        onClose();
      } else {
        clearRegDraft();
        setView("confirm-email");
      }
    } catch (err) {
      console.error("[SignInModal] driver register error:", err);
      toast.error(friendlyRegisterError(err));
    } finally {
      clearTimeout(timeout);
      setSubmitting(false);
    }
  };

  const handleCompanyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !companyName || !regEmail || !regPassword) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!EMAIL_RE.test(regEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (regPassword.length < 12) {
      toast.error("Password must be at least 12 characters.");
      return;
    }
    if (regPassword !== regConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const timeout = setTimeout(() => {
      setSubmitting(false);
      toast.error("Registration is taking too long. Please try again.");
    }, 15000);
    try {
      const companyFields = {
        company_name: companyName,
        company_phone: companyPhone || "",
        company_address: companyAddress || "",
        company_state: companyState || "",
        company_email: regEmail,
        contact_name: contactName || "",
        contact_title: contactTitle || "",
        company_goal: companyGoal || "",
      };
      await register(companyName, regEmail, regPassword, "company", companyFields);

      // Check if session was created (email confirmation not required)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          await supabase.from("company_profiles").upsert({
            id: session.user.id,
            company_name: companyName,
            phone: companyPhone || "",
            address: companyAddress || "",
            email: regEmail,
            contact_name: contactName || "",
            contact_title: contactTitle || "",
            company_goal: companyGoal || "",
          });
        } catch { /* deferred population in AuthContext handles this */ }
        clearRegDraft();
        toast.success("Registration successful!");
        onClose();
      } else {
        clearRegDraft();
        setView("confirm-email");
      }
    } catch (err) {
      console.error("[SignInModal] company register error:", err);
      toast.error(friendlyRegisterError(err));
    } finally {
      clearTimeout(timeout);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-md p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden [&>button.absolute]:hidden">
        <DialogTitle className="sr-only">
          {view === "login" ? "Login" : view === "forgot" ? "Reset Password" : view === "rules" ? "Rules" : view === "confirm-email" ? "Confirm Email" : "Register"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {view === "login" ? "Sign in to your account" : view === "forgot" ? "Reset your password" : view === "confirm-email" ? "Confirm your email address" : "Create a new account"}
        </DialogDescription>

        {/* ── LOGIN VIEW ── */}
        {view === "login" && (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-primary shrink-0" />
                <h2 className="font-display font-bold text-base">Login</h2>
              </div>
              <button onClick={onClose} className="p-1 hover:text-primary transition-colors" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pt-5">
              <SocialLoginButtons />
              <OrDivider />
            </div>
            <form onSubmit={handleLogin} className="px-5 pb-5 space-y-3">
              <Input
                id="login-email"
                placeholder="Email"
                type="email"
                name="email"
                aria-label="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="username"
              />
              <Input
                id="login-password"
                type="password"
                placeholder="Password"
                name="loginPassword"
                aria-label="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
              />
              <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Signing in…" : "Login"}</Button>
              <hr className="border-border" />
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setResetEmail(loginEmail); setView("forgot"); }}
                >
                  Forgot Password?
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-foreground text-background hover:bg-foreground/90 dark:bg-muted dark:text-foreground dark:hover:bg-muted/80"
                  onClick={() => setView("rules")}
                >
                  Registration
                </Button>
              </div>
            </form>
          </>
        )}

        {/* ── FORGOT PASSWORD VIEW ── */}
        {view === "forgot" && (
          <>
            <ModalHeader title="Reset Password" onClose={onClose} />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!resetEmail) { toast.error("Please enter your email."); return; }
                setSubmitting(true);
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                    redirectTo: `${window.location.origin}/signin`,
                  });
                  if (error) throw error;
                  toast.success("Password reset email sent! Check your inbox.");
                  setView("login");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to send reset email.");
                } finally {
                  setSubmitting(false);
                }
              }}
              className="px-5 py-5 space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <Input
                id="reset-email"
                type="email"
                placeholder="Email address"
                name="resetEmail"
                aria-label="Email address"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoComplete="email"
              />
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Sending…" : "Send Reset Link"}
              </Button>
              <button
                type="button"
                onClick={() => setView("login")}
                className="w-full text-center text-sm text-primary underline hover:opacity-80"
              >
                ← Back to login
              </button>
            </form>
          </>
        )}

        {/* ── RULES VIEW ── */}
        {view === "rules" && (
          <>
            <ModalHeader title="General rules on the website" onClose={onClose} />
            <div className="px-5 py-4 overflow-y-auto flex-1">
              {RULES_TEXT.split("\n\n").map((para, i) => (
                <p key={i} className="text-sm text-muted-foreground mb-3 leading-relaxed whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
              <Button className="flex-1" onClick={() => setView("register")}>
                Accept
              </Button>
              <Button variant="outline" className="flex-1 border-primary text-primary hover:bg-primary/5" onClick={() => setView("login")}>
                Decline
              </Button>
            </div>
          </>
        )}

        {/* ── REGISTER VIEW ── */}
        {view === "register" && (
          <>
            <ModalHeader title="New user registration" onClose={onClose} />

            {/* Role selector — always visible at top */}
            <div className="px-5 pt-4 pb-2 border-b border-border shrink-0">
              <label className="text-sm text-primary font-medium block mb-1">Who are you?</label>
              <Select value={role} onValueChange={(v) => setRole(v as "driver" | "company")} name="role">
                <SelectTrigger id="reg-role" className="w-full" aria-label="Who are you?">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── DRIVER FORM ── */}
            {role === "driver" && (
              <form onSubmit={handleDriverRegister} className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
                <Input
                  id="reg-username"
                  placeholder="Username *"
                  name="registerUsername"
                  aria-label="Username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  autoComplete="username"
                />
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="Your e-mail *"
                  name="registerEmail"
                  aria-label="Email address"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  autoComplete="email"
                />
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Password *"
                  name="registerPassword"
                  aria-label="Password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <PasswordStrengthIndicator password={regPassword} />
                <Input
                  id="reg-confirmPassword"
                  type="password"
                  placeholder="Confirm password *"
                  name="registerConfirmPassword"
                  aria-label="Confirm password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={passwordsDoNotMatch}
                  className={passwordsDoNotMatch ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {passwordsDoNotMatch && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
                <hr className="border-border" />
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Driver Profile</p>
                <Input
                  id="reg-driverName"
                  placeholder="Your name"
                  name="driverName"
                  aria-label="Your name"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  autoComplete="name"
                />
                <Input
                  id="reg-homeAddress"
                  placeholder="Home Address"
                  name="homeAddress"
                  aria-label="Home address"
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  autoComplete="street-address"
                />
                <Input
                  id="reg-zipCode"
                  placeholder="Zip Code"
                  name="zipCode"
                  aria-label="Zip code"
                  value={zipCode}
                  onChange={(e) => { setZipCode(e.target.value); setZipError(""); }}
                  autoComplete="postal-code"
                  aria-invalid={!!zipError}
                  className={zipError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {zipError && <p className="text-xs text-destructive -mt-2">{zipError}</p>}
                <Input
                  id="reg-driverPhone"
                  placeholder="Phone Number"
                  type="tel"
                  name="driverPhone"
                  aria-label="Phone number"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  autoComplete="tel"
                />
                <Input
                  id="reg-cdlNumber"
                  placeholder="CDL Number"
                  name="cdlNumber"
                  aria-label="CDL number"
                  value={cdlNumber}
                  onChange={(e) => setCdlNumber(e.target.value)}
                  autoComplete="off"
                />
                <div>
                  <label className="text-sm text-primary font-medium block mb-1">I am interested in:</label>
                  <Select value={interestedIn} onValueChange={setInterestedIn} name="interestedIn">
                    <SelectTrigger id="reg-interestedIn" className="w-full" aria-label="I am interested in"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DRIVER_INTERESTS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-primary font-medium block mb-1">In my next job I want:</label>
                  <Select value={nextJobWant} onValueChange={setNextJobWant} name="nextJobWant">
                    <SelectTrigger id="reg-nextJobWant" className="w-full" aria-label="In my next job I want"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DRIVER_NEXT_JOB.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-primary font-medium block mb-1">Any accidents or violations in the last 2 years?</label>
                  <Select value={hasAccidents} onValueChange={setHasAccidents} name="hasAccidents">
                    <SelectTrigger id="reg-hasAccidents" className="w-full" aria-label="Any accidents or violations in the last 2 years"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-primary font-medium block mb-1">I want CDL Jobs Center staff to contact me with employment offers</label>
                  <Select value={wantsContact} onValueChange={setWantsContact} name="wantsContact">
                    <SelectTrigger id="reg-wantsContact" className="w-full" aria-label="Contact me with employment offers"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Submitting…" : "Submit"}</Button>
                <button type="button" onClick={() => setView("login")} className="w-full text-center text-sm text-primary underline hover:opacity-80">
                  ← Back to login
                </button>
              </form>
            )}

            {/* ── COMPANY FORM ── */}
            {role === "company" && (
              <form onSubmit={handleCompanyRegister} className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
                <Input
                  id="co-email"
                  type="email"
                  placeholder="Your e-mail *"
                  name="companyEmail"
                  aria-label="Company email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  autoComplete="email"
                />
                <Input
                  id="co-password"
                  type="password"
                  placeholder="Password *"
                  name="companyPassword"
                  aria-label="Company password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <PasswordStrengthIndicator password={regPassword} />
                <Input
                  id="co-confirmPassword"
                  type="password"
                  placeholder="Confirm password *"
                  name="companyConfirmPassword"
                  aria-label="Confirm company password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={passwordsDoNotMatch}
                  className={passwordsDoNotMatch ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {passwordsDoNotMatch && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
                <hr className="border-border" />
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Company Profile</p>
                <Input
                  id="co-contactName"
                  placeholder="Your name *"
                  name="contactName"
                  aria-label="Contact name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  autoComplete="name"
                />
                <Input
                  id="co-contactTitle"
                  placeholder="Your title"
                  name="contactTitle"
                  aria-label="Contact title"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  autoComplete="organization-title"
                />
                <Input
                  id="co-companyName"
                  placeholder="Company Name *"
                  name="companyName"
                  aria-label="Company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoComplete="organization"
                />
                <Input
                  id="co-companyAddress"
                  placeholder="Company Address"
                  name="companyAddress"
                  aria-label="Company address"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  autoComplete="street-address"
                />
                <div>
                  <label className="text-sm text-primary font-medium block mb-1">State</label>
                  <Select value={companyState} onValueChange={setCompanyState} name="companyState">
                    <SelectTrigger id="co-companyState" className="w-full" aria-label="Company state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  id="co-companyPhone"
                  placeholder="Company phone number"
                  type="tel"
                  name="companyPhone"
                  aria-label="Company phone number"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  autoComplete="tel"
                />
                <div>
                  <label className="text-sm text-primary font-medium block mb-1">
                    What do you want to accomplish by using CDL Jobs Center?
                  </label>
                  <Select value={companyGoal} onValueChange={setCompanyGoal} name="companyGoal">
                    <SelectTrigger id="co-companyGoal" className="w-full" aria-label="Company goal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_GOALS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Submitting…" : "Submit"}</Button>
                <button type="button" onClick={() => setView("login")} className="w-full text-center text-sm text-primary underline hover:opacity-80">
                  ← Back to login
                </button>
              </form>
            )}
          </>
        )}

        {/* ── CONFIRM EMAIL VIEW ── */}
        {view === "confirm-email" && (
          <>
            <ModalHeader title="Check Your Email" onClose={onClose} />
            <div className="px-5 py-8 text-center space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-base">Confirm your email address</p>
                <p className="text-sm text-muted-foreground mt-2">
                  We sent a confirmation link to <span className="font-medium text-foreground">{regEmail}</span>.
                  Click the link in the email to activate your account.
                </p>
              </div>
              <div className="pt-2 space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      const { error } = await supabase.auth.resend({
                        type: "signup",
                        email: regEmail,
                      });
                      if (error) throw error;
                      toast.success("Confirmation email resent! Check your inbox.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to resend email.");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  <RotateCw className="h-4 w-4 mr-2" />
                  {submitting ? "Sending…" : "Resend Confirmation Email"}
                </Button>
                <Button className="w-full" onClick={() => setView("login")}>
                  Back to Login
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Didn't receive it? Check your spam folder or try resending.
              </p>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
