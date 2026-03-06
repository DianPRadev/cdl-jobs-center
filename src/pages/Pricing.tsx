import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth";
import { PLANS, useSubscription, type Plan } from "@/hooks/useSubscription";
import { supabase } from "@/lib/supabase";
import { Check, X, Zap, TrendingUp, Crown, Users, Target, Clock, Shield, Truck, BarChart3, Gift } from "lucide-react";
import { usePageTitle, useMetaDescription, useCanonical } from "@/hooks/usePageTitle";
import { toast } from "sonner";
import { withTimeout } from "@/lib/withTimeout";

/* ── plan card config ────────────────────────────────────────────── */
const ALL_PLANS: Array<{
  plan: Plan;
  icon: React.ReactNode;
  tagline: string;
  popular?: boolean;
}> = [
  { plan: "free",     icon: <Gift className="h-6 w-6" />,        tagline: "Try before you buy" },
  { plan: "starter",  icon: <Zap className="h-6 w-6" />,         tagline: "For small fleets getting started" },
  { plan: "growth",   icon: <TrendingUp className="h-6 w-6" />,  tagline: "For growing carriers", popular: true },
  { plan: "unlimited",icon: <Crown className="h-6 w-6" />,       tagline: "For high-volume recruiters" },
];

/* ── feature comparison matrix ───────────────────────────────────── */
type FeatureValue = boolean | string;
const FEATURES: Array<{ label: string; free: FeatureValue; starter: FeatureValue; growth: FeatureValue; unlimited: FeatureValue }> = [
  { label: "Driver leads per month",         free: "5",    starter: "40",   growth: "150",  unlimited: "Unlimited" },
  { label: "Filter by state & driver type",  free: true,   starter: true,   growth: true,   unlimited: true },
  { label: "Post jobs to driver directory",  free: true,   starter: true,   growth: true,   unlimited: true },
  { label: "AI-powered job matching",        free: true,   starter: true,   growth: true,   unlimited: true },
  { label: "Lead status tracking",           free: false,  starter: true,   growth: true,   unlimited: true },
  { label: "Phone & email contact info",     free: false,  starter: true,   growth: true,   unlimited: true },
  { label: "Full driver profile access",     free: false,  starter: false,  growth: false,  unlimited: true },
  { label: "Driver directory & saved drivers", free: false, starter: false, growth: false, unlimited: true },
  { label: "Browse & contact any driver",    free: false,  starter: false,  growth: false,  unlimited: true },
];

const PLAN_ORDER: Plan[] = ["free", "starter", "growth", "unlimited"];

/* ── component ───────────────────────────────────────────────────── */
const Pricing = () => {
  usePageTitle("Pricing — CDL Driver Lead Plans");
  useMetaDescription("Affordable plans to connect with CDL drivers. Get 40, 150, or unlimited driver leads per month. Start with 5 free leads.");
  useCanonical("/pricing");
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCompany = user?.role === "company";
  const { data: subscription } = useSubscription(isCompany ? user?.id : undefined);
  const [loading, setLoading] = useState<Plan | null>(null);

  const currentPlan = subscription?.plan ?? "free";
  const isCanceled = subscription?.status === "canceled";

  const handleSubscribe = async (plan: Plan) => {
    if (!user) { navigate("/signin"); return; }
    if (user.role !== "company") { toast.error("Only company accounts can subscribe to lead plans."); return; }
    const planInfo = PLANS[plan];
    if (!planInfo.priceId) { toast.error("This plan is not available for purchase."); return; }

    try {
      setLoading(plan);
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), 10_000);
      if (!session) { navigate("/signin"); return; }

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
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
      setLoading(null);
    }
  };

  /* ── CTA label logic ────────────────────────── */
  const getCtaLabel = (plan: Plan): string => {
    if (!isCompany) return plan === "free" ? "Create Free Account" : `Get ${PLANS[plan].label}`;
    if (plan === currentPlan && !isCanceled) return "Current Plan";
    if (plan === currentPlan && isCanceled) return "Reactivate";
    const currentIdx = PLAN_ORDER.indexOf(currentPlan);
    const targetIdx = PLAN_ORDER.indexOf(plan);
    if (plan === "free") return "Free Tier";
    if (targetIdx > currentIdx) return `Upgrade to ${PLANS[plan].label}`;
    return `Switch to ${PLANS[plan].label}`;
  };

  const getCtaAction = (plan: Plan) => {
    if (!user) { navigate("/signin"); return; }
    if (plan === "free") { navigate("/dashboard"); return; }
    if (plan === currentPlan && !isCanceled) { navigate("/dashboard?tab=subscription"); return; }
    if (subscription?.stripeSubscriptionId && !isCanceled) { navigate("/dashboard?tab=subscription"); return; }
    handleSubscribe(plan);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {/* ── Hero value proposition ────────────────────────────────── */}
        <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background py-16 sm:py-20">
          <div className="container mx-auto px-4 text-center max-w-5xl">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Fill Your Seats with{" "}
              <span className="text-primary">Qualified CDL Drivers</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto mb-10">
              Marketing plans purpose-built for mid-size carriers. We know your lanes, your pain points, and how to reach drivers who actually stick.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-14">
              {[
                { value: "3.2×", label: "Avg. increase in applicants" },
                { value: "42%", label: "Lower cost per hire" },
                { value: "90 day", label: "Avg. retention improvement" },
                { value: "150+", label: "Carriers served" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="font-display text-2xl sm:text-3xl font-bold text-primary">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Cost comparison */}
            <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">The Math Doesn't Lie</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-8">
              The average carrier spends <strong className="text-foreground">$8,000–$12,000</strong> to hire a single driver.
              With turnover above 90%, you're bleeding money every quarter.
            </p>

            <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 max-w-5xl mx-auto items-stretch">
              {/* Without */}
              <div className="border border-border bg-card p-6 sm:p-8 text-left">
                <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-3">Without a Recruitment Partner</p>
                <div className="h-3 w-3 rounded-full bg-red-500 mb-5" />
                <div className="space-y-4 text-base">
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Avg. cost per hire</span><span className="font-semibold whitespace-nowrap">$8,000 – $12,000</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Drivers to replace yearly (90%+ turnover)</span><span className="font-semibold whitespace-nowrap">~180 drivers</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Idle truck cost per day</span><span className="font-semibold whitespace-nowrap">$500 – $1,000</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Avg. days to fill a seat (DIY)</span><span className="font-semibold whitespace-nowrap">30 – 45 days</span></div>
                  <div className="border-t border-border pt-4 flex justify-between gap-6 font-semibold text-base">
                    <span>Estimated annual recruiting cost</span>
                    <span className="text-red-500 whitespace-nowrap">$1.4M – $2.1M+</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Includes advertising, recruiter salaries, onboarding, idle truck costs</p>
                </div>
              </div>

              {/* VS divider */}
              <div className="hidden sm:flex items-center justify-center">
                <span className="h-11 w-11 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">VS</span>
              </div>
              <div className="sm:hidden text-center py-1">
                <span className="inline-flex h-9 w-9 rounded-full border border-border bg-muted items-center justify-center text-sm font-bold text-muted-foreground">VS</span>
              </div>

              {/* With CDL Jobs Center */}
              <div className="border border-primary/30 bg-primary/5 p-6 sm:p-8 text-left">
                <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-3">With CDL Jobs Center</p>
                <div className="h-3 w-3 rounded-full bg-emerald-500 mb-5" />
                <div className="space-y-4 text-base">
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Lower cost per hire (branded leads)</span><span className="font-semibold whitespace-nowrap text-emerald-600 dark:text-emerald-400">40–50% less</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Faster time to fill</span><span className="font-semibold whitespace-nowrap text-emerald-600 dark:text-emerald-400">14 – 21 days avg.</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Higher-quality, retention-focused hires</span><span className="font-semibold whitespace-nowrap text-emerald-600 dark:text-emerald-400">Better fit = less churn</span></div>
                  <div className="flex justify-between gap-6"><span className="text-muted-foreground">Your annual investment (Growth plan)</span><span className="font-semibold whitespace-nowrap">$1,188/yr</span></div>
                  <div className="border-t border-primary/20 pt-4 flex justify-between gap-6 font-semibold text-base">
                    <span>Estimated annual savings</span>
                    <span className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap">$500K – $1M+</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Based on reduced cost per hire, faster fills, lower idle truck costs, and improved 6-month retention rates.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing section ──────────────────────────────────────── */}
        <section className="border-b border-border py-16">
          <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            Get Access to <span className="text-primary">Driver Leads</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Choose a plan based on how many leads you need each month.
          </p>
        </div>

        {/* ── Billing context for logged-in companies ──────────────── */}
        {isCompany && subscription && (
          <div className={`max-w-5xl mx-auto mb-8 border p-4 text-center text-sm ${
            isCanceled ? "border-red-500/20 bg-red-500/5" : "border-primary/20 bg-primary/5"
          }`}>
            {isCanceled ? (
              <p>
                Your <strong className="text-red-500">{PLANS[subscription.plan].label}</strong> plan was canceled.
                {subscription.currentPeriodEnd && ` Access continues until ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`}
                {" "}Choose a plan below to resubscribe.
              </p>
            ) : subscription.plan === "free" ? (
              <p>
                You're on the <strong className="text-primary">Free</strong> tier with <strong>{subscription.leadLimit - subscription.leadsUsed}</strong> leads remaining. Upgrade to unlock more leads and features.
              </p>
            ) : (
              <p>
                You're on the <strong className="text-primary">{PLANS[subscription.plan].label}</strong> plan.{" "}
                {subscription.leadLimit === 9999
                  ? "Unlimited leads."
                  : <><strong>{subscription.leadLimit - subscription.leadsUsed}</strong> of {subscription.leadLimit} leads remaining this period.</>}
                {subscription.currentPeriodEnd && <> Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.</>}
                {" "}<button onClick={() => navigate("/dashboard?tab=subscription")} className="text-primary underline hover:opacity-80">Manage</button>
              </p>
            )}
          </div>
        )}

        {/* ── Plan cards ───────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
          {ALL_PLANS.map(({ plan, icon, tagline, popular }) => {
            const info = PLANS[plan];
            const isCurrent = currentPlan === plan && !isCanceled;

            return (
              <div
                key={plan}
                className={`relative border bg-card p-5 flex flex-col ${
                  popular
                    ? "border-primary shadow-lg ring-1 ring-primary/20"
                    : isCurrent
                      ? "border-primary/50"
                      : "border-border"
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                {isCurrent && !popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-foreground text-background text-xs font-bold px-3 py-1 rounded-full">
                      Current Plan
                    </span>
                  </div>
                )}

                {/* Icon + name */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    popular ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    {icon}
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">{info.label}</h3>
                    <p className="text-[11px] text-muted-foreground">{tagline}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-4">
                  {info.price === 0 ? (
                    <span className="font-display text-3xl font-bold">Free</span>
                  ) : (
                    <>
                      <span className="font-display text-3xl font-bold">${info.price}</span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {info.leads === 9999 ? "Unlimited" : info.leads} leads/month
                  </p>
                </div>

                {/* CTA */}
                <Button
                  variant={isCurrent ? "outline" : popular ? "default" : "outline"}
                  className={`w-full mb-4 ${popular && !isCurrent ? "glow-orange" : ""}`}
                  onClick={() => getCtaAction(plan)}
                  disabled={loading !== null || (isCurrent && plan === "free")}
                >
                  {loading === plan ? "Redirecting..." : getCtaLabel(plan)}
                </Button>

                {/* Key highlights */}
                <ul className="space-y-2 flex-1 text-sm">
                  {plan === "free" && (
                    <>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>5 leads to preview quality</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Filter by state & type</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>AI-powered job matching</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>No credit card required</span></li>
                    </>
                  )}
                  {plan === "starter" && (
                    <>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>40 leads/month</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Phone & email contact info</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Lead status tracking</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Post jobs to driver directory</span></li>
                    </>
                  )}
                  {plan === "growth" && (
                    <>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>150 leads/month</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Everything in Starter</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Best value per lead</span></li>
                    </>
                  )}
                  {plan === "unlimited" && (
                    <>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Unlimited leads</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Everything in Growth</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Full driver profiles & directory</span></li>
                      <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Save & contact any driver</span></li>
                    </>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ── Billing note ─────────────────────────────────────────── */}
        <p className="text-center mt-6 text-xs text-muted-foreground max-w-xl mx-auto">
          All paid plans are billed monthly. Cancel anytime from your dashboard — no long-term contracts.
        </p>

        {/* ── Feature comparison table ─────────────────────────────── */}
        <div className="mt-16 max-w-5xl mx-auto">
          <h2 className="font-display text-2xl font-bold text-center mb-8">
            Compare Plans
          </h2>
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground min-w-[200px]">Feature</th>
                  {PLAN_ORDER.map((p) => (
                    <th key={p} className={`text-center py-3 px-3 font-semibold min-w-[100px] ${p === currentPlan && !isCanceled ? "text-primary" : ""}`}>
                      {PLANS[p].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? "" : "bg-muted/10"}>
                    <td className="py-2.5 px-4 text-muted-foreground">{row.label}</td>
                    {PLAN_ORDER.map((p) => {
                      const val = row[p];
                      return (
                        <td key={p} className="text-center py-2.5 px-3">
                          {typeof val === "string" ? (
                            <span className="font-medium text-foreground">{val}</span>
                          ) : val ? (
                            <Check className="h-4 w-4 text-primary mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

          </div>
        </section>

        {/* ── Why CDL Jobs Center ──────────────────────────────────── */}
        <section className="border-b border-border py-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-10">
              <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3">
                Why Companies Choose <span className="text-primary">CDL Jobs Center</span>
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                We connect you directly with CDL drivers who are actively looking for work — no middlemen, no wasted time.
              </p>
            </div>

            {/* Platform stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {[
                { value: "2,000+", label: "Drivers Registered", icon: <Users className="h-5 w-5" /> },
                { value: "50+", label: "States Covered", icon: <Truck className="h-5 w-5" /> },
                { value: "<24h", label: "Avg. Lead Delivery", icon: <Clock className="h-5 w-5" /> },
                { value: "95%", label: "Contact Rate", icon: <Target className="h-5 w-5" /> },
              ].map((stat) => (
                <div key={stat.label} className="border border-border bg-card p-4 text-center">
                  <div className="flex justify-center mb-2 text-primary">{stat.icon}</div>
                  <p className="font-display text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Benefits grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: <Target className="h-5 w-5" />,
                  title: "Pre-Qualified Leads",
                  desc: "Every driver on our platform has completed a detailed profile with CDL class, experience, and preferences — so you know they're serious.",
                },
                {
                  icon: <BarChart3 className="h-5 w-5" />,
                  title: "AI-Powered Matching",
                  desc: "Our matching algorithm scores drivers against your job requirements so the best-fit candidates surface first.",
                },
                {
                  icon: <Clock className="h-5 w-5" />,
                  title: "New Lead Notifications",
                  desc: "Get notified when new drivers sign up and apply to your jobs. Stay on top of every lead without refreshing your dashboard.",
                },
                {
                  icon: <Shield className="h-5 w-5" />,
                  title: "Verified Companies Only",
                  desc: "Drivers trust our platform because we verify every company before they go live. More trust means more applications.",
                },
                {
                  icon: <Users className="h-5 w-5" />,
                  title: "Full Driver Profiles",
                  desc: "Unlimited plan gives you access to complete driver profiles — phone, email, CDL details, driving history, and more.",
                },
                {
                  icon: <TrendingUp className="h-5 w-5" />,
                  title: "Lower Cost Per Hire",
                  desc: "Skip expensive job boards and recruiters. Our leads cost a fraction of traditional driver recruitment channels.",
                },
              ].map((b) => (
                <div key={b.title} className="border border-border bg-card p-5">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                    {b.icon}
                  </div>
                  <h3 className="font-display font-semibold text-sm mb-1.5">{b.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA banner */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="border border-primary/30 bg-primary/5 p-6 sm:p-8 text-center">
              <h3 className="font-display font-bold text-lg mb-2">Still not sure? Start with 5 free leads.</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-lg mx-auto">
                Every company account gets 5 complimentary driver leads — no credit card required. See the quality for yourself before committing.
              </p>
              <Button onClick={() => user ? navigate("/dashboard") : navigate("/signin")} className="glow-orange">
                {user ? "Go to Dashboard" : "Create Free Account"}
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Pricing;
