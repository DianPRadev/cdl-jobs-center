/**
 * Client-side job matching scorer.
 * Mirrors the edge function rules engine so matching works
 * even when the edge function is unavailable.
 */

import type { DriverJobMatch } from "@/hooks/useMatchScores";

// ── Normalization helpers ──

const DRIVER_TYPE_MAP: Record<string, string> = {
  company: "company", "company driver": "company", "company-driver": "company",
  "owner-operator": "owner-operator", "owner operator": "owner-operator",
  lease: "lease", "lease operator": "lease", "lease-operator": "lease",
  student: "student", "student / trainee": "student", trainee: "student",
};

const ROUTE_MAP: Record<string, string> = {
  otr: "otr", "over the road": "otr", local: "local",
  regional: "regional", dedicated: "dedicated",
  ltl: "ltl", "less than truckload": "ltl",
};

const FREIGHT_MAP: Record<string, string> = {
  box: "box", "car hauler": "carHaul", carhauler: "carHaul",
  "drop and hook": "dropAndHook", "dry bulk": "dryBulk",
  "dry van": "dryVan", dryvan: "dryVan", flatbed: "flatbed",
  "hopper bottom": "hopperBottom", intermodal: "intermodal",
  "oil field": "oilField", "oversize load": "oversizeLoad",
  refrigerated: "refrigerated", reefer: "refrigerated", tanker: "tanker",
};

const TEAM_MAP: Record<string, string> = {
  solo: "solo", team: "team", both: "both", either: "both",
};

const LICENSE_MAP: Record<string, string> = {
  a: "a", "class a": "a", b: "b", "class b": "b",
  c: "c", "class c": "c", permit: "permit",
};

const EXP_SCORES: Record<string, number> = {
  none: 2, "less-1": 4, "< 1 year": 4, "1-3": 6, "3-5": 8, "5+": 10,
};

function norm(raw: string | null | undefined, map: Record<string, string>): string | null {
  if (!raw) return null;
  return map[raw.toLowerCase().trim()] ?? raw.toLowerCase().trim();
}

// ── Driver profile shape (from form state) ──

export interface DriverFormData {
  driverType: string;
  licenseClass: string;
  yearsExp: string;
  licenseState: string;
  soloTeam: string;
  endorse: Record<string, boolean>;
  hauler: Record<string, boolean>;
  route: Record<string, boolean>;
}

// ── Job row shape (from Supabase query) ──

export interface JobRow {
  id: string;
  title: string;
  company_name: string;
  company_id: string;
  location: string | null;
  pay: string | null;
  type: string | null;
  route_type: string | null;
  driver_type: string | null;
  team_driving: string | null;
  status: string;
  logo_url?: string | null;
}

// ── Scoring ──

interface Reason { text: string; positive: boolean }

function scoreDriverType(d: string | null, j: string | null): { score: number; reasons: Reason[] } {
  if (!d || !j) return { score: 10, reasons: [] };
  if (d === j) return { score: 20, reasons: [{ text: `Driver type (${d}) matches`, positive: true }] };
  if ((d === "owner-operator" && j === "lease") || (d === "lease" && j === "owner-operator"))
    return { score: 12, reasons: [{ text: `${d} compatible with ${j}`, positive: true }] };
  return { score: 0, reasons: [{ text: `Position requires ${j}`, positive: false }] };
}

function scoreRoute(prefs: Record<string, boolean>, jobRoute: string | null): { score: number; reasons: Reason[] } {
  const jr = norm(jobRoute, ROUTE_MAP);
  if (!jr) return { score: 8, reasons: [] };
  const hasPrefs = Object.values(prefs).some(Boolean);
  if (!hasPrefs) return { score: 8, reasons: [] };
  if (prefs[jr]) return { score: 15, reasons: [{ text: `${jr.toUpperCase()} route matches`, positive: true }] };
  if ((jr === "otr" && prefs["regional"]) || (jr === "regional" && prefs["otr"]))
    return { score: 10, reasons: [{ text: `Route partially aligns`, positive: true }] };
  return { score: 3, reasons: [] };
}

function scoreFreight(exp: Record<string, boolean>, jobType: string | null): { score: number; reasons: Reason[] } {
  const jf = norm(jobType, FREIGHT_MAP);
  if (!jf) return { score: 8, reasons: [] };
  const hasExp = Object.values(exp).some(Boolean);
  if (!hasExp) return { score: 5, reasons: [] };
  if (exp[jf]) return { score: 15, reasons: [{ text: `Experience with ${jf} freight`, positive: true }] };
  const count = Object.values(exp).filter(Boolean).length;
  if (count >= 4) return { score: 10, reasons: [{ text: "Broad hauler experience", positive: true }] };
  return { score: 3, reasons: [] };
}

function scoreTeam(d: string | null, j: string | null): { score: number; reasons: Reason[] } {
  if (!d || !j) return { score: 5, reasons: [] };
  if (d === j || j === "both" || d === "both")
    return { score: 10, reasons: [{ text: `Team preference aligns`, positive: true }] };
  return { score: 0, reasons: [] };
}

function scoreLicense(licClass: string | null, endorse: Record<string, boolean>, jobType: string | null): { score: number; reasons: Reason[] } {
  let s = 0;
  const reasons: Reason[] = [];
  if (licClass === "a") { s += 6; reasons.push({ text: "Class A CDL qualifies", positive: true }); }
  else if (licClass === "b") s += 4;
  else if (licClass === "c") s += 2;
  else s += 3;

  const jf = norm(jobType, FREIGHT_MAP);
  if (jf === "tanker" && (endorse["tankVehicles"] || endorse["tankerHazmat"])) {
    s += 4; reasons.push({ text: "Tanker endorsement matches", positive: true });
  } else if (endorse["hazmat"]) s += 2;
  else s += 1;

  return { score: Math.min(s, 10), reasons };
}

function scoreExperience(yearsExp: string | null): { score: number; reasons: Reason[] } {
  if (!yearsExp) return { score: 5, reasons: [] };
  const s = EXP_SCORES[yearsExp.toLowerCase().trim()] ?? 5;
  const reasons: Reason[] = [];
  if (s >= 8) reasons.push({ text: `${yearsExp} experience is valued`, positive: true });
  return { score: s, reasons };
}

// ── Main export ──

const RULES_RAW_MAX = 90;
const RULES_WEIGHT_MAX = 70;

export function scoreJobsClientSide(
  driver: DriverFormData,
  jobs: JobRow[],
): DriverJobMatch[] {
  const dType = norm(driver.driverType, DRIVER_TYPE_MAP);
  const licClass = norm(driver.licenseClass, LICENSE_MAP);
  const teamPref = norm(driver.soloTeam, TEAM_MAP);

  const results: DriverJobMatch[] = [];

  for (const job of jobs) {
    if (job.status !== "Active") continue;

    const jType = norm(job.driver_type, DRIVER_TYPE_MAP);
    const dt = scoreDriverType(dType, jType);
    const rt = scoreRoute(driver.route, job.route_type);
    const fr = scoreFreight(driver.hauler, job.type);
    const tm = scoreTeam(teamPref, norm(job.team_driving, TEAM_MAP));
    const exp = scoreExperience(driver.yearsExp);
    const lic = scoreLicense(licClass, driver.endorse, job.type);

    let rawScore = dt.score + rt.score + fr.score + tm.score + exp.score + lic.score;
    // Hard block: cap at 40 if driver type mismatch
    if (dt.score === 0 && dType && jType) rawScore = Math.min(rawScore, 40);

    const overall = Math.round((rawScore / RULES_RAW_MAX) * RULES_WEIGHT_MAX);

    const allReasons = [dt, rt, fr, tm, exp, lic].flatMap(r => r.reasons);
    const topReasons = allReasons.filter(r => r.positive).slice(0, 3);
    const cautions = allReasons.filter(r => !r.positive).slice(0, 2);

    results.push({
      jobId: job.id,
      overallScore: overall,
      rulesScore: overall,
      semanticScore: null,
      behaviorScore: 0,
      confidence: "medium",
      topReasons,
      cautions,
      scoreBreakdown: {},
      missingFields: [],
      actions: { canApply: true, canSave: true, feedback: ["helpful", "not_relevant", "hide"] },
      degradedMode: true,
      computedAt: new Date().toISOString(),
      jobTitle: job.title ?? "",
      jobCompany: job.company_name ?? "",
      jobLocation: job.location ?? "",
      jobPay: job.pay ?? "",
      jobType: job.type ?? "",
      jobRouteType: job.route_type ?? "",
      jobDriverType: job.driver_type ?? "",
      jobTeamDriving: job.team_driving ?? "",
      jobLogoUrl: job.logo_url ?? null,
    });
  }

  return results.sort((a, b) => b.overallScore - a.overallScore);
}
