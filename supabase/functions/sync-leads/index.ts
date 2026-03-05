import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Sheet config — stored in LEAD_SHEETS secret as JSON array */
interface SheetConfig {
  id: string;           // Google Sheets spreadsheet ID
  tab: string;          // Tab/sheet name within the spreadsheet
  lead_type: "owner_operator" | "company_driver";
  label: string;        // Human-readable label
}

interface LeadRecord {
  sheet_row_id: string;
  source_sheet: string;
  source: string;
  lead_type: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  years_exp: string | null;
  is_owner_op: boolean;
  truck_year: string | null;
  truck_make: string | null;
  truck_model: string | null;
  date_submitted: string | null;
  violations: string | null;
  availability: string | null;
  notes: string | null;
  synced_at: string;
}

/**
 * Map a header name (lowercased, trimmed) to a known field.
 * This handles all 3 sheet layouts automatically.
 */
function headerToField(h: string): string | null {
  const lc = h.toLowerCase().trim();
  if (lc === "name" || lc === "full name") return "full_name";
  if (lc.includes("phone")) return "phone";
  if (lc === "email") return "email";
  if (lc === "state") return "state";
  if (lc.includes("experience") || lc.includes("years of exp")) return "years_exp";
  if (lc.includes("truck year") || lc === "year of truck?") return "truck_year";
  if (lc.includes("model truck") || lc.includes("truck make")) return "truck_model";
  if (lc.includes("owner operator")) return "is_owner_op";
  if (lc.includes("violation")) return "violations";
  if (lc.includes("when can you start") || lc.includes("availability")) return "availability";
  if (lc.includes("date created") || lc.includes("date submitted")) return "date_submitted";
  if (lc === "notes") return "notes";
  return null;
}

function parseISODate(val: string): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch { /* ignore */ }
  return null;
}

async function fetchSheet(
  apiKey: string,
  config: SheetConfig,
): Promise<{ records: LeadRecord[]; errors: string[] }> {
  const range = encodeURIComponent(`${config.tab}!A1:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.id}/values/${range}?key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    return { records: [], errors: [`${config.label}: Sheets API ${res.status} — ${errText}`] };
  }

  const data = await res.json();
  const rows: string[][] = data.values ?? [];
  if (rows.length < 2) {
    return { records: [], errors: [] }; // Just header or empty
  }

  // Build column mapping from header row
  const headers = rows[0];
  const colMap: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const field = headerToField(headers[i]);
    if (field) colMap[i] = field;
  }

  const sourceSheet = `${config.id}::${config.tab}`;
  const records: LeadRecord[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (let r = 1; r < rows.length; r++) {
    const vals = rows[r];
    // Build a map of field -> value for this row
    const fields: Record<string, string> = {};
    for (const [colIdx, fieldName] of Object.entries(colMap)) {
      const v = (vals[Number(colIdx)] ?? "").trim();
      if (v) fields[fieldName] = v;
    }

    // Skip rows with no name
    const fullName = fields.full_name;
    if (!fullName) continue;

    // Skip "month divider" rows (e.g. "January 2026")
    if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(fullName)) {
      continue;
    }

    const ownerOpRaw = (fields.is_owner_op ?? "").toLowerCase();
    const isOwnerOp = config.lead_type === "owner_operator" ||
      ownerOpRaw === "yes" || ownerOpRaw === "true" || ownerOpRaw === "1";

    records.push({
      sheet_row_id: `row-${r + 1}`,
      source_sheet: sourceSheet,
      source: "google-sheets",
      lead_type: config.lead_type,
      full_name: fullName,
      phone: fields.phone || null,
      email: fields.email || null,
      state: fields.state || null,
      years_exp: fields.years_exp || null,
      is_owner_op: isOwnerOp,
      truck_year: fields.truck_year || null,
      truck_make: null,
      truck_model: fields.truck_model || null,
      date_submitted: parseISODate(fields.date_submitted ?? ""),
      violations: fields.violations || null,
      availability: fields.availability || null,
      notes: fields.notes || null,
      synced_at: now,
    });
  }

  return { records, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sheetsApiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    const leadSheetsRaw = Deno.env.get("LEAD_SHEETS");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!sheetsApiKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing required env vars" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth: require admin or service role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Allow service role key directly (for cron) or admin users
    const isServiceRole = token === serviceRoleKey;
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile || (profile.role !== "admin" && profile.role !== "company")) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Parse sheet configs
    let sheetConfigs: SheetConfig[] = [];
    if (leadSheetsRaw) {
      try {
        sheetConfigs = JSON.parse(leadSheetsRaw);
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid LEAD_SHEETS JSON" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Fallback: use legacy single-sheet env var
    if (sheetConfigs.length === 0) {
      const legacyId = Deno.env.get("GOOGLE_SHEET_ID");
      if (legacyId) {
        sheetConfigs = [{
          id: legacyId,
          tab: "Sheet1",
          lead_type: "owner_operator",
          label: "Legacy Sheet",
        }];
      }
    }

    if (sheetConfigs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No sheet configs found (set LEAD_SHEETS secret)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch all sheets in parallel
    const results = await Promise.all(
      sheetConfigs.map((cfg) => fetchSheet(sheetsApiKey, cfg))
    );

    const allRecords: LeadRecord[] = [];
    const allErrors: string[] = [];
    for (const r of results) {
      allRecords.push(...r.records);
      allErrors.push(...r.errors);
    }

    if (allRecords.length === 0) {
      return new Response(
        JSON.stringify({ synced: 0, new: 0, updated: 0, errors: allErrors, message: "No valid rows found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert in batches
    const BATCH_SIZE = 50;
    let totalNew = 0;
    let totalUpdated = 0;

    // Check existing rows for counting
    const allKeys = allRecords.map((r) => `${r.source_sheet}||${r.sheet_row_id}`);
    const existingKeys = new Set<string>();

    // Query existing in chunks to stay within query limits
    for (let i = 0; i < allRecords.length; i += 200) {
      const batch = allRecords.slice(i, i + 200);
      const sourceSheets = [...new Set(batch.map((r) => r.source_sheet))];
      const rowIds = batch.map((r) => r.sheet_row_id);

      const { data: existing } = await supabase
        .from("leads")
        .select("source_sheet, sheet_row_id")
        .in("source_sheet", sourceSheets)
        .in("sheet_row_id", rowIds);

      if (existing) {
        for (const row of existing) {
          existingKeys.add(`${row.source_sheet}||${row.sheet_row_id}`);
        }
      }
    }

    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE);

      const { error: upsertErr } = await supabase.from("leads").upsert(batch, {
        onConflict: "source_sheet,sheet_row_id",
        ignoreDuplicates: false,
      });

      if (upsertErr) {
        allErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertErr.message}`);
        continue;
      }

      for (const rec of batch) {
        const key = `${rec.source_sheet}||${rec.sheet_row_id}`;
        if (existingKeys.has(key)) {
          totalUpdated++;
        } else {
          totalNew++;
        }
      }
    }

    console.log(`Sync complete: ${totalNew} new, ${totalUpdated} updated, ${allErrors.length} errors`);

    return new Response(
      JSON.stringify({
        synced: totalNew + totalUpdated,
        new: totalNew,
        updated: totalUpdated,
        errors: allErrors,
        sheets: sheetConfigs.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
