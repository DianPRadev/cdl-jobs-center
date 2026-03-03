import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  heading: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={cn("p-12 text-center", className)}>
      {Icon && <Icon className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />}
      <h3 className="font-medium text-foreground mb-1">{heading}</h3>
      {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}
