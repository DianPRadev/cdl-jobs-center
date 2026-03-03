import { AlertTriangle, Check, CheckCircle2, Info } from "lucide-react";
import { DriverJobMatch } from "@/hooks/useMatchScores";
import { Button } from "@/components/ui/button";

interface MatchReasonPanelProps {
  match: DriverJobMatch;
  onHelpful?: () => void;
  helpfulPending?: boolean;
  helpfulSubmitted?: boolean;
}

const labelize = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

export function MatchReasonPanel({
  match,
  onHelpful,
  helpfulPending = false,
  helpfulSubmitted = false,
}: MatchReasonPanelProps) {
  const breakdownRows = Object.entries(match.scoreBreakdown ?? {});

  return (
    <div className="mt-4 grid gap-4 rounded-lg border border-border/70 bg-background/80 p-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold">Why this match</p>
          </div>
          {match.topReasons.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              We need more data to explain this score. Add profile details for better
              explanations.
            </p>
          ) : (
            <ul className="space-y-2">
              {match.topReasons.slice(0, 4).map((reason, idx) => (
                <li
                  key={`${match.jobId}-reason-${idx}`}
                  className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                >
                  {reason.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {match.cautions.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">Watchouts</p>
            </div>
            <ul className="space-y-2">
              {match.cautions.slice(0, 2).map((caution, idx) => (
                <li
                  key={`${match.jobId}-caution-${idx}`}
                  className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                >
                  {caution.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {match.missingFields.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Improve your match quality</p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {match.missingFields.slice(0, 5).map((field) => (
                <li
                  key={`${match.jobId}-missing-${field}`}
                  className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary"
                >
                  Add {field}
                </li>
              ))}
            </ul>
          </div>
        )}

        {onHelpful && (
          <Button
            type="button"
            variant={helpfulSubmitted ? "secondary" : "outline"}
            size="sm"
            disabled={helpfulPending}
            onClick={onHelpful}
          >
            {helpfulPending ? (
              "Saving..."
            ) : helpfulSubmitted ? (
              <><Check className="h-3.5 w-3.5" /> Marked Helpful</>
            ) : (
              "This Match Was Helpful"
            )}
          </Button>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Score breakdown</p>
        {breakdownRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No score details available.</p>
        ) : (
          <div className="space-y-3">
            {breakdownRows.map(([key, value]) => {
              const max = Math.max(1, value.maxScore || 0);
              const pct = Math.round((value.score / max) * 100);
              return (
                <div key={`${match.jobId}-breakdown-${key}`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{labelize(key)}</span>
                    <span className="text-muted-foreground">
                      {value.score}/{value.maxScore}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
                      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{value.detail}</p>
                </div>
              );
            })}
          </div>
        )}

        {match.degradedMode && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Running in rules-only mode for this result. Semantic scoring is temporarily
            unavailable.
          </div>
        )}
      </div>
    </div>
  );
}
