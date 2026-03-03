import { Button } from "@/components/ui/button";

interface ListPaginationProps {
  /** Current zero-based page index */
  page: number;
  /** Total number of items (before pagination) */
  totalItems: number;
  /** Items per page */
  pageSize: number;
  /** Called with the new zero-based page index */
  onPageChange: (page: number) => void;
  /** Scroll to top of page on navigation (default true) */
  scrollToTop?: boolean;
}

/**
 * Consistent pagination control used across all list pages.
 * Shows "Showing X–Y of Z" on the left and numbered page buttons
 * with ellipsis + Previous/Next on the right.
 */
export function ListPagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  scrollToTop = true,
}: ListPaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const safePage = Math.min(page, totalPages - 1);
  const from = safePage * pageSize + 1;
  const to = Math.min((safePage + 1) * pageSize, totalItems);

  const goTo = (p: number) => {
    onPageChange(p);
    if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Build page number array with ellipsis
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (safePage > 2) pages.push("...");
    for (let i = Math.max(1, safePage - 1); i <= Math.min(totalPages - 2, safePage + 1); i++) {
      pages.push(i);
    }
    if (safePage < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-border mt-2">
      <span className="text-sm text-muted-foreground">
        Showing {from}–{to} of {totalItems}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onClick={() => goTo(safePage - 1)}
          disabled={safePage === 0}
        >
          Previous
        </Button>
        {pages.map((p, idx) =>
          p === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              className="w-9 flex items-center justify-center text-sm text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === safePage ? "default" : "outline"}
              size="sm"
              onClick={() => goTo(p)}
              className="w-9 min-h-[44px]"
              aria-label={`Page ${p + 1}`}
              aria-current={p === safePage ? "page" : undefined}
            >
              {p + 1}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onClick={() => goTo(safePage + 1)}
          disabled={safePage >= totalPages - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
