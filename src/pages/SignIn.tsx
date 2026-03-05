import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { usePageTitle, useNoIndex } from "@/hooks/usePageTitle";
import { supabase } from "@/lib/supabase";
import { friendlySignInError } from "@/lib/authErrorMessages";
import { getPasswordStrength, type PasswordStrengthLevel } from "@/lib/passwordStrength";
import { SocialLoginButtons, OrDivider } from "@/components/SocialLoginButtons";
import { withTimeout } from "@/lib/withTimeout";

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
          {strength.label.charAt(0).toUpperCase() + strength.label.slice(1)}
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

const SignIn = () => {
  usePageTitle("Sign In");
  useNoIndex();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { signIn, register } = useAuth();
  const navigate = useNavigate();

  // Detect PASSWORD_RECOVERY event when user clicks reset link from email
  useEffect(() => {
    // Check URL hash for recovery token (in case event fired before mount)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setRecovering(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 12) {
      toast.error("Password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }), 15_000);
      if (error) throw error;
      toast.success("Password updated successfully!");
      setRecovering(false);
      setNewPassword("");
      setConfirmPassword("");
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password.");
      return;
    }
    if (isSignUp) {
      if (!name.trim()) {
        toast.error("Please enter your full name.");
        return;
      }
      if (password.length < 12) {
        toast.error("Password must be at least 12 characters.");
        return;
      }
      setLoading(true);
      try {
        // Register with a placeholder role — onboarding will collect the real role + profile fields
        await withTimeout(register(name.trim(), email, password, "driver"), 15_000);
        toast.success("Account created! Complete your profile to get started.");
        navigate("/onboarding");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Registration failed.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      await withTimeout(signIn(email, password), 15_000);
      toast.success("Welcome back!");
      navigate("/");
    } catch (err) {
      toast.error(friendlySignInError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border">
        <div className="container mx-auto py-4">
          <Link to="/" className="flex items-center gap-3 w-fit">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Truck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="font-display">
              <span className="text-xl font-bold">CDL</span>
              <span className="text-xl font-bold text-primary"> Jobs</span>
              <span className="text-xl font-light">Center</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Form */}
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          {/* Breadcrumb */}
          <p className="text-sm text-muted-foreground mb-6">
            <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
            <span className="mx-1">»</span>
            {recovering ? "Reset Password" : isSignUp ? "Create Account" : "Sign In"}
          </p>

          <div className="border border-border bg-card">
            {/* Header */}
            <div className="border-b border-border px-5 py-4">
              <div className="border-l-4 border-primary pl-3">
                <p className="font-display font-bold text-lg">
                  {recovering ? "Set a New Password" : isSignUp ? "Create Your Account" : "Sign In to Your Account"}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {recovering
                    ? "Choose a strong password for your account"
                    : isSignUp
                    ? "Join CDL Jobs Center as a driver or company"
                    : "Access your driver profile and saved jobs"}
                </p>
              </div>
            </div>

            {recovering ? (
              <form onSubmit={handleResetPassword} className="px-5 py-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <PasswordStrengthIndicator password={newPassword} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
                    className={confirmPassword.length > 0 && newPassword !== confirmPassword ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <>
              <div className="px-5 pt-6 space-y-4">
                <SocialLoginButtons />
                <OrDivider />
              </div>
              <form onSubmit={handleSubmit} className="px-5 pb-6 space-y-4">
                {isSignUp && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!isSignUp && (
                      <button
                        type="button"
                        className="text-xs text-primary underline hover:opacity-80"
                        onClick={async () => {
                          if (!email) {
                            toast.error("Enter your email first, then click Forgot password.");
                            return;
                          }
                          try {
                            const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(email, {
                              redirectTo: `${window.location.origin}/signin`,
                            }), 15_000);
                            if (error) throw error;
                            toast.success("Password reset email sent! Check your inbox.");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to send reset email.");
                          }
                        }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder={isSignUp ? "••••••••••••" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                  />
                  {isSignUp && <PasswordStrengthIndicator password={password} />}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {isSignUp ? "Creating account..." : "Signing in..."}
                    </>
                  ) : isSignUp ? "Create Account" : "Sign In"}
                </Button>

                <p className="text-center text-sm text-muted-foreground pt-2">
                  {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    className="text-primary font-medium hover:underline"
                    onClick={() => setIsSignUp(!isSignUp)}
                  >
                    {isSignUp ? "Sign In →" : "Create Account →"}
                  </button>
                </p>
              </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SignIn;
