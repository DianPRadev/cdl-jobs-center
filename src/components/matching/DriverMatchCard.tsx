import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DriverFeedback,
  DriverJobMatch,
  DriverMatchEventType,
} from "@/hooks/useMatchScores";
import { MatchReasonPanel } from "@/components/matching/MatchReasonPanel";

interface DriverMatchCardProps {
  match: DriverJobMatch;
  isSaved: boolean;
  pendingFeedback?: DriverFeedback | null;
  submittedFeedback?: DriverFeedback | null;
  onToggleSave: (jobId: string) => Promise<void> | void;
  onFeedback: (jobId: string, feedback: DriverFeedback) => Promise<void> | void;
  onTrackEvent?: (jobId: string, eventType: DriverMatchEventType) => void;
}

const scoreClass = (score: number) => {
  if (score >= 80) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (score >= 60) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (score >= 40) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
};

const confidenceClass = (confidence: DriverJobMatch["confidence"]) => {
  if (confidence === "high") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (confidence === "low") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
};

export function DriverMatchCard({
  match,
  isSaved,
  pendingFeedback = null,
  submittedFeedback = null,
  onToggleSave,
  onFeedback,
  onTrackEvent,
}: DriverMatchCardProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) onTrackEvent?.(match.jobId, "click");
  };

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${scoreClass(match.overallScore)}`}>
                {match.overallScore}% Match
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${confidenceClass(
                  match.confidence,
                )}`}
              >
                {match.confidence} confidence
              </span>
              {match.degradedMode && (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Rules only
                </span>
              )}
            </div>
            <h3 className="truncate font-display text-lg font-bold text-foreground">
              {match.jobTitle}
            </h3>
            <p className="truncate text-sm font-medium text-primary">{match.jobCompany}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {match.jobLocation && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {match.jobLocation}
                </span>
              )}
              {match.jobRouteType && (
                <span className="inline-flex items-center gap-1">
                  <Compass className="h-3.5 w-3.5" />
                  {match.jobRouteType}
                </span>
              )}
              {match.jobPay && <span>{match.jobPay}</span>}
            </div>
          </div>

          <div className="min-w-[160px] rounded-lg border border-primary/20 bg-background/80 p-2 text-xs">
            <p className="mb-1 font-semibold text-foreground">Signal mix</p>
            <p className="text-muted-foreground">Rules: {match.rulesScore}</p>
            <p className="text-muted-foreground">Semantic: {match.semanticScore ?? 0}</p>
            <p className="text-muted-foreground">Behavior: {match.behaviorScore}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {match.topReasons.length > 0 ? (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Why this match
            </p>
            <div className="flex flex-wrap gap-2">
              {match.topReasons.slice(0, 3).map((reason, idx) => (
                <span
                  key={`${match.jobId}-reason-chip-${idx}`}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300"
                >
                  {reason.text}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" onClick={() => onTrackEvent?.(match.jobId, "apply")}>
            <Link to={`/jobs/${match.jobId}`}>Apply</Link>
          </Button>

          <Button
            type="button"
            size="sm"
            variant={isSaved ? "secondary" : "outline"}
            disabled={!match.actions.canSave}
            onClick={async () => {
              await onToggleSave(match.jobId);
              onTrackEvent?.(match.jobId, "save");
            }}
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" />
                Save
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant={submittedFeedback === "not_relevant" ? "secondary" : "outline"}
            disabled={pendingFeedback === "not_relevant"}
            onClick={() => onFeedback(match.jobId, "not_relevant")}
          >
            {pendingFeedback === "not_relevant" ? (
              "Saving..."
            ) : submittedFeedback === "not_relevant" ? (
              <><Check className="h-3.5 w-3.5" /> Not relevant</>
            ) : (
              "Not relevant"
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={submittedFeedback === "hide"
              ? "border-muted text-muted-foreground"
              : "border-destructive/40 text-destructive hover:bg-destructive/10"}
            disabled={pendingFeedback === "hide"}
            onClick={() => onFeedback(match.jobId, "hide")}
          >
            {pendingFeedback === "hide" ? (
              "Saving..."
            ) : submittedFeedback === "hide" ? (
              <><Check className="h-3.5 w-3.5" /> Hidden</>
            ) : (
              "Hide"
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={toggleExpanded}
          >
            Details {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {expanded && (
          <MatchReasonPanel
            match={match}
            onHelpful={() => onFeedback(match.jobId, "helpful")}
            helpfulPending={pendingFeedback === "helpful"}
            helpfulSubmitted={submittedFeedback === "helpful"}
          />
        )}
      </div>
    </article>
  );
}
