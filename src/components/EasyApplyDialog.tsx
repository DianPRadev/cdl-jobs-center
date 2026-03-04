import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { useDriverProfile } from "@/hooks/useDriverProfile";

type EasyApplyDialogProps = {
  trigger: React.ReactNode;
  companyName?: string;
  companyId?: string;
  jobId?: string;
};

type OffOnToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
};

const OffOnToggle = ({ checked, onChange }: OffOnToggleProps) => (
  <div role="switch" aria-checked={checked} className="inline-flex overflow-hidden rounded-sm border border-border">
    <button
      type="button"
      onClick={() => onChange(false)}
      aria-pressed={!checked}
      className={cn(
        "h-7 w-14 text-center text-[11px] font-semibold transition-colors",
        !checked ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
      )}
    >
      OFF
    </button>
    <button
      type="button"
      onClick={() => onChange(true)}
      aria-pressed={checked}
      className={cn(
        "h-7 w-14 text-center text-[11px] font-semibold transition-colors",
        checked ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
      )}
    >
      ON
    </button>
  </div>
);

const EasyApplyDialog = ({ trigger, companyName = "General Application", companyId, jobId }: EasyApplyDialogProps) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { profile } = useDriverProfile(user?.id ?? "");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cdl, setCdl] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [driverType, setDriverType] = useState("");
  const [endorseCdl, setEndorseCdl] = useState(false);
  const [ownerOperator, setOwnerOperator] = useState(false);

  // Pre-fill from driver profile + auth email when dialog opens
  useEffect(() => {
    if (!open) return;
    if (profile) {
      setFirstName((prev) => prev || profile.firstName);
      setLastName((prev) => prev || profile.lastName);
      setCdl((prev) => prev || profile.cdlNumber);
      setPhone((prev) => prev || profile.phone);
      setDriverType((prev) => prev || profile.driverType);
    }
    if (user?.email) {
      setEmail((prev) => prev || (user.email ?? ""));
    }
  }, [open, profile, user]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !phone) {
      toast.error("Please fill in your name, email, and phone.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!user || user.role !== "driver") {
      toast.error("You must be signed in as a driver to apply.");
      return;
    }
    setSubmitting(true);
    const insertPromise = supabase.from("applications").insert({
      driver_id: user.id,
      company_id: companyId || null,
      job_id: jobId || null,
      company_name: companyName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      cdl_number: cdl || null,
      driver_type: driverType || null,
      endorse: { cdl: endorseCdl, ownerOperator },
      pipeline_stage: "New",
    });

    const timeoutPromise = new Promise<never>((_res, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), 30000)
    );

    try {
      const { error } = await Promise.race([insertPromise, timeoutPromise]) as { error: unknown };
      if (error) {
        const msg =
          error instanceof Error
            ? error.message
            : (error as { message?: string })?.message ?? "Submission failed.";
        toast.error(msg);
        return;
      }
      toast.success(`Application sent to ${companyName}!`);
      qc.invalidateQueries({ queryKey: ["driver-applications"] });
      qc.invalidateQueries({ queryKey: ["has-applied-job"] });
      qc.invalidateQueries({ queryKey: ["company-applications"] });
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[560px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-5">
          <DialogTitle className="text-lg font-semibold text-foreground">Quick Apply</DialogTitle>
          <DialogDescription className="sr-only">
            Quick application form.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input id="easy-firstName" name="firstName" autoComplete="given-name" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input id="easy-lastName" name="lastName" autoComplete="family-name" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <Input id="easy-cdl" name="cdlNumber" autoComplete="off" placeholder="CDL #" value={cdl} onChange={(e) => setCdl(e.target.value)} />
              <Input id="easy-email" name="email" autoComplete="email" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input id="easy-phone" name="phone" autoComplete="tel" placeholder="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Select value={driverType} onValueChange={setDriverType} name="driverType">
                <SelectTrigger id="easy-driverType">
                  <SelectValue placeholder="Driver Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company Driver</SelectItem>
                  <SelectItem value="owner-operator">Owner Operator</SelectItem>
                  <SelectItem value="lease">Lease Operator</SelectItem>
                  <SelectItem value="student">Student / Trainee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-y border-border bg-muted/40">
            <p className="px-4 pb-3 pt-4 text-sm font-semibold text-accent sm:px-5">Endorsements (optional):</p>
            <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="text-sm text-foreground">CDL</span>
                <OffOnToggle checked={endorseCdl} onChange={setEndorseCdl} />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="text-sm text-foreground">Owner Operator</span>
                <OffOnToggle checked={ownerOperator} onChange={setOwnerOperator} />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <Button
              type="submit"
              disabled={submitting}
              className="h-10 rounded-md bg-accent px-8 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
            >
              {submitting ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EasyApplyDialog;
