export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const SITE = "https://cdljobscenter.com";

const STATIC: Array<{ loc: string; priority: string; changefreq: string }> = [
  { loc: "/",          priority: "1.0", changefreq: "weekly"  },
  { loc: "/jobs",      priority: "0.9", changefreq: "daily"   },
  { loc: "/apply",     priority: "0.8", changefreq: "monthly" },
  { loc: "/companies", priority: "0.7", changefreq: "weekly"  },
  { loc: "/drivers",   priority: "0.7", changefreq: "weekly"  },
  { loc: "/pricing",   priority: "0.6", changefreq: "monthly" },
  { loc: "/privacy",   priority: "0.3", changefreq: "yearly"  },
  { loc: "/terms",     priority: "0.3", changefreq: "yearly"  },
];

async function fetchIds(table: string, filter: string): Promise<string[]> {
  if (!SUPABASE_URL || !ANON_KEY) return [];
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&${filter}`;
  try {
    const res = await fetch(url, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { id: string }[];
    return data.map((r) => r.id);
  } catch {
    return [];
  }
}

function urlEntry(loc: string, priority: string, changefreq: string, lastmod: string) {
  return `  <url>\n    <loc>${SITE}${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export default async function handler(_req: Request): Promise<Response> {
  const today = new Date().toISOString().split("T")[0];

  const [jobIds, companyIds] = await Promise.all([
    fetchIds("jobs", "status=eq.Active"),
    fetchIds("company_profiles", "is_verified=eq.true"),
  ]);

  const entries = [
    ...STATIC.map(({ loc, priority, changefreq }) => urlEntry(loc, priority, changefreq, today)),
    ...jobIds.map((id) => urlEntry(`/jobs/${id}`, "0.8", "weekly", today)),
    ...companyIds.map((id) => urlEntry(`/companies/${id}`, "0.6", "monthly", today)),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
