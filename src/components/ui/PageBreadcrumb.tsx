import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEffect } from "react";

interface Crumb {
  label: string;
  to?: string;
}

const SITE = "https://cdljobscenter.com";

export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  const itemsKey = items.map((c) => `${c.label}:${c.to ?? ""}`).join("|");
  useEffect(() => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.label,
        ...(item.to ? { item: `${SITE}${item.to}` } : {}),
      })),
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => { script.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {item.to ? (
            <Link to={item.to} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
