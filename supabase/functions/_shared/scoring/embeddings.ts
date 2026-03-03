/**
 * Embedding provider abstraction + cosine similarity.
 * HuggingFace implementation; OpenAI can be added later.
 */

// ── Provider interface ─────────────────────────────────────

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly providerName: string;
  readonly modelName: string;
}

// ── HuggingFace Inference API provider ─────────────────────

export class HuggingFaceProvider implements EmbeddingProvider {
  readonly providerName = "hf";
  readonly modelName: string;
  readonly dimensions = 384; // all-MiniLM-L6-v2 output dimensions
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.modelName = model ?? "sentence-transformers/all-MiniLM-L6-v2";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `https://router.huggingface.co/hf-inference/models/${this.modelName}/pipeline/feature-extraction`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: texts,
        options: { wait_for_model: true },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HF embedding failed (${response.status}): ${body}`);
    }

    const result = await response.json();

    // HF returns number[][] for batch inputs
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result as number[][];
    }

    throw new Error("Unexpected HF embedding response format");
  }
}

// ── Cosine similarity ──────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

// ── Text block builders (PII-free) ─────────────────────────

export function buildDriverText(
  profile: {
    about?: string | null;
    driver_type?: string | null;
    license_class?: string | null;
    years_exp?: string | null;
    license_state?: string | null;
  },
  application?: {
    solo_team?: string | null;
    endorse?: Record<string, boolean> | null;
    hauler?: Record<string, boolean> | null;
    route?: Record<string, boolean> | null;
    notes?: string | null;
  } | null,
): string {
  const parts: string[] = [];

  if (profile.about) parts.push(profile.about);
  if (profile.driver_type) parts.push(`Driver type: ${profile.driver_type}`);
  if (profile.license_class) parts.push(`License: Class ${profile.license_class.toUpperCase()}`);
  if (profile.years_exp) parts.push(`Experience: ${profile.years_exp}`);
  if (profile.license_state) parts.push(`State: ${profile.license_state}`);

  if (application) {
    if (application.solo_team) parts.push(`Prefers: ${application.solo_team}`);

    const endorsements = application.endorse
      ? Object.entries(application.endorse).filter(([, v]) => v).map(([k]) => k)
      : [];
    if (endorsements.length) parts.push(`Endorsements: ${endorsements.join(", ")}`);

    const haulers = application.hauler
      ? Object.entries(application.hauler).filter(([, v]) => v).map(([k]) => k)
      : [];
    if (haulers.length) parts.push(`Hauler experience: ${haulers.join(", ")}`);

    const routes = application.route
      ? Object.entries(application.route).filter(([, v]) => v).map(([k]) => k)
      : [];
    if (routes.length) parts.push(`Route preferences: ${routes.join(", ")}`);
  }

  return parts.join(". ");
}

export function buildJobText(job: {
  title?: string | null;
  description?: string | null;
  type?: string | null;
  driver_type?: string | null;
  route_type?: string | null;
  team_driving?: string | null;
  location?: string | null;
  pay?: string | null;
}): string {
  const parts: string[] = [];

  if (job.title) parts.push(job.title);
  if (job.description) parts.push(job.description);
  if (job.type) parts.push(`Freight: ${job.type}`);
  if (job.driver_type) parts.push(`Driver type: ${job.driver_type}`);
  if (job.route_type) parts.push(`Route: ${job.route_type}`);
  if (job.team_driving) parts.push(`Team: ${job.team_driving}`);
  if (job.location) parts.push(`Location: ${job.location}`);
  if (job.pay) parts.push(`Pay: ${job.pay}`);

  return parts.join(". ");
}

export function buildLeadText(lead: {
  state?: string | null;
  years_exp?: string | null;
  is_owner_op?: boolean;
  truck_year?: string | null;
  truck_make?: string | null;
  truck_model?: string | null;
}): string {
  const parts: string[] = [];

  if (lead.state) parts.push(`State: ${lead.state}`);
  if (lead.years_exp) parts.push(`Experience: ${lead.years_exp}`);
  if (lead.is_owner_op) parts.push("Owner-operator with own truck");
  if (lead.truck_year || lead.truck_make || lead.truck_model) {
    parts.push(`Truck: ${[lead.truck_year, lead.truck_make, lead.truck_model].filter(Boolean).join(" ")}`);
  }

  return parts.join(". ");
}

// ── Content hash (simple) ──────────────────────────────────

export function contentHash(text: string): string {
  // Simple hash — good enough for cache invalidation
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32-bit integer
  }
  return hash.toString(36);
}

// ── Provider factory ───────────────────────────────────────

export function createEmbeddingProvider(): EmbeddingProvider | null {
  const apiKey = Deno.env.get("HF_API_KEY");
  if (!apiKey) return null;

  const model = Deno.env.get("HF_EMBED_MODEL") ?? "sentence-transformers/all-MiniLM-L6-v2";
  return new HuggingFaceProvider(apiKey, model);
}
