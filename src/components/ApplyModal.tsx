import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useApplication } from "@/hooks/useApplication";
import { useAuth } from "@/context/auth";
import { useDriverProfile } from "@/hooks/useDriverProfile";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

import { US_STATES } from "@/data/constants";

const ToggleRow = ({ id, name, label, checked, onChange }: { id?: string; name?: string; label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between py-1">
    <label htmlFor={id} className="text-sm text-foreground cursor-pointer">{label}</label>
    <div className="flex items-center gap-1.5">
      <span className={`text-xs font-medium ${!checked ? "text-foreground" : "text-muted-foreground"}`}>OFF</span>
      <Switch id={id} name={name} checked={checked} onCheckedChange={onChange} className="data-[state=unchecked]:bg-muted" />
      <span className={`text-xs font-medium ${checked ? "text-primary" : "text-muted-foreground"}`}>ON</span>
    </div>
  </div>
);

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-l-4 border-primary bg-primary/5 px-3 py-2 mb-4">
    <p className="text-primary text-sm font-semibold">{children}</p>
  </div>
);

interface ApplyModalProps {
  companyName: string;
  companyId?: string;
  jobId?: string;
  jobTitle?: string;
  onClose: () => void;
}

export function ApplyModal({ companyName, companyId, jobId, jobTitle, onClose }: ApplyModalProps) {
  const { user } = useAuth();
  const { load, save } = useApplication();
  const saved = load();
  const { profile } = useDriverProfile(user?.id ?? "");
  const qc = useQueryClient();

  // Basic info — pre-fill from saved
  const [firstName, setFirstName] = useState(saved.firstName ?? "");
  const [lastName, setLastName] = useState(saved.lastName ?? "");
  const [email, setEmail] = useState(saved.email ?? "");
  const [phone, setPhone] = useState(saved.phone ?? "");
  const [cdlNumber, setCdlNumber] = useState(saved.cdlNumber ?? "");
  const [zipCode, setZipCode] = useState(saved.zipCode ?? "");
  const [date, setDate] = useState(saved.date ?? "");
  const [driverType, setDriverType] = useState(saved.driverType ?? "");
  const [licenseClass, setLicenseClass] = useState(saved.licenseClass ?? "");
  const [yearsExp, setYearsExp] = useState(saved.yearsExp ?? "");
  const [licenseState, setLicenseState] = useState(saved.licenseState ?? "");
  const [soloTeam, setSoloTeam] = useState(saved.soloTeam ?? "Solo");
  const [notes, setNotes] = useState(saved.notes ?? "");

  const [prefs, setPrefs] = useState({
    betterPay: false, betterHomeTime: false,
    healthInsurance: false, bonuses: false, newEquipment: false,
    ...(saved.prefs ?? {}),
  });
  const [endorse, setEndorse] = useState({
    doublesTriples: false, hazmat: false, tankVehicles: false, tankerHazmat: false,
    ...(saved.endorse ?? {}),
  });
  const [hauler, setHauler] = useState({
    box: false, carHaul: false, dropAndHook: false, dryBulk: false, dryVan: false,
    flatbed: false, hopperBottom: false, intermodal: false, oilField: false,
    oversizeLoad: false, refrigerated: false, tanker: false,
    ...(saved.hauler ?? {}),
  });
  const [route, setRoute] = useState({
    dedicated: false, local: false, ltl: false, otr: false, regional: false,
    ...(saved.route ?? {}),
  });
  const [extra, setExtra] = useState({
    leasePurchase: false, accidents: false, suspended: false, newsletters: false,
    ...(saved.extra ?? {}),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill empty fields from driver profile (Supabase)
  useEffect(() => {
    if (!profile) return;
    setFirstName(prev => prev || profile.firstName);
    setLastName(prev => prev || profile.lastName);
    setPhone(prev => prev || profile.phone);
    setCdlNumber(prev => prev || profile.cdlNumber);
    setLicenseClass(prev => prev || profile.licenseClass);
    setYearsExp(prev => prev || profile.yearsExp);
    setDriverType(prev => prev || profile.driverType);
    setLicenseState(prev => prev || profile.licenseState);
    setZipCode(prev => prev || profile.zipCode);
  }, [profile]);

  // Pre-fill email from auth user
  useEffect(() => {
    if (user?.email) setEmail(prev => prev || user.email);
  }, [user]);

  const tog = <T extends Record<string, boolean>>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof T) =>
    (v: boolean) => setter((prev) => ({ ...prev, [key]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (!phone.trim()) e.phone = "Phone is required";
    if (!cdlNumber.trim()) e.cdlNumber = "CDL number is required";
    if (!zipCode.trim()) e.zipCode = "Zip code is required";
    else if (!/^\d{5}(-\d{4})?$/.test(zipCode)) e.zipCode = "Enter a valid zip code";
    if (!driverType) e.driverType = "Select a driver type";
    if (!licenseClass) e.licenseClass = "Select a license class";
    if (!yearsExp) e.yearsExp = "Select years of experience";
    if (!licenseState) e.licenseState = "Select your license state";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to submit an application.");
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error("Please fix the errors before submitting.");
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const data = {
        firstName, lastName, email, phone, cdlNumber, zipCode, date,
        driverType, licenseClass, yearsExp, licenseState, soloTeam, notes,
        prefs, endorse, hauler, route, extra,
      };

      // Save form draft for next time, but do not block submit if storage fails.
      save(data);

      const insertPromise = supabase.from("applications").insert({
        driver_id: user.id,
        company_id: companyId ?? null,
        job_id: jobId ?? null,
        company_name: companyName,
        job_title: jobTitle ?? null,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        cdl_number: cdlNumber,
        zip_code: zipCode,
        available_date: date || null,
        driver_type: driverType,
        license_class: licenseClass,
        years_exp: yearsExp,
        license_state: licenseState,
        solo_team: soloTeam,
        notes,
        prefs,
        endorse,
        hauler,
        route,
        extra,
        pipeline_stage: "New",
      });

      const timeoutPromise = new Promise<never>((_res, reject) =>
        setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), 30000)
      );

      const { error } = await Promise.race([insertPromise, timeoutPromise]) as { error: unknown };
      if (error) {
        const msg =
          error instanceof Error
            ? error.message
            : (error as { message?: string })?.message ?? "Submission failed.";
        toast.error(msg);
        return;
      }

      if (jobId) {
        qc.setQueryData(["has-applied-job", user.id, jobId], true);
      }
      qc.invalidateQueries({ queryKey: ["driver-applications", user.id] });
      qc.invalidateQueries({ queryKey: ["driver-applications-history", user.id] });
      if (companyId) {
        qc.invalidateQueries({ queryKey: ["company-applications", companyId] });
      }

      toast.success(`Application submitted to ${companyName}!`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden [&>button.absolute]:hidden">
        <DialogTitle className="sr-only">
          Apply to {companyName}{jobTitle ? ` — ${jobTitle}` : ""}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Fill out the application form to apply for this position.
        </DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display font-bold text-base">Let's Get Started!</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Applying to {companyName}{jobTitle ? ` — ${jobTitle}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:text-primary transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-5 space-y-6">

          {/* Job preferences */}
          <div>
            <SectionHeader>What do you want in your next job selections?</SectionHeader>
            <div className="grid sm:grid-cols-2 gap-x-12 gap-y-1">
              <ToggleRow id="modal-betterPay" name="betterPay" label="Better pay" checked={prefs.betterPay} onChange={tog(setPrefs, "betterPay")} />
              <ToggleRow id="modal-betterHomeTime" name="betterHomeTime" label="Better home time" checked={prefs.betterHomeTime} onChange={tog(setPrefs, "betterHomeTime")} />
              <ToggleRow id="modal-healthInsurance" name="healthInsurance" label="Health Insurance" checked={prefs.healthInsurance} onChange={tog(setPrefs, "healthInsurance")} />
              <ToggleRow id="modal-bonuses" name="bonuses" label="Bonuses" checked={prefs.bonuses} onChange={tog(setPrefs, "bonuses")} />
              <ToggleRow id="modal-newEquipment" name="newEquipment" label="New equipment" checked={prefs.newEquipment} onChange={tog(setPrefs, "newEquipment")} />
            </div>
          </div>

          {/* Basic info */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="modal-firstName" className="text-xs text-muted-foreground">First Name *</Label>
              <Input id="modal-firstName" name="firstName" autoComplete="given-name" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={errors.firstName ? "border-destructive" : ""} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="modal-lastName" className="text-xs text-muted-foreground">Last Name *</Label>
              <Input id="modal-lastName" name="lastName" autoComplete="family-name" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={errors.lastName ? "border-destructive" : ""} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="modal-email" className="text-xs text-muted-foreground">Email *</Label>
              <Input id="modal-email" name="email" autoComplete="email" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={errors.email ? "border-destructive" : ""} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="modal-phone" className="text-xs text-muted-foreground">Phone *</Label>
              <Input id="modal-phone" name="phone" autoComplete="tel" placeholder="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={errors.phone ? "border-destructive" : ""} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="modal-cdlNumber" className="text-xs text-muted-foreground">CDL # *</Label>
              <Input id="modal-cdlNumber" name="cdlNumber" autoComplete="off" placeholder="CDL number" value={cdlNumber} onChange={(e) => setCdlNumber(e.target.value)} className={errors.cdlNumber ? "border-destructive" : ""} />
              {errors.cdlNumber && <p className="text-xs text-destructive">{errors.cdlNumber}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="modal-zipCode" className="text-xs text-muted-foreground">Zip Code *</Label>
              <Input id="modal-zipCode" name="zipCode" autoComplete="postal-code" placeholder="Zip code" value={zipCode} onChange={(e) => setZipCode(e.target.value)} className={errors.zipCode ? "border-destructive" : ""} />
              {errors.zipCode && <p className="text-xs text-destructive">{errors.zipCode}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="modal-date" className="text-xs text-muted-foreground">Available Date</Label>
              <Input id="modal-date" name="availableDate" autoComplete="off" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Driving experience */}
          <div>
            <SectionHeader>Tell us about your driving experience.</SectionHeader>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="modal-driverType" className="text-xs text-muted-foreground">Driver Type *</Label>
                <Select value={driverType} onValueChange={(v) => { setDriverType(v); setErrors((p) => ({ ...p, driverType: "" })); }} name="driverType">
                  <SelectTrigger id="modal-driverType" className={errors.driverType ? "border-destructive" : ""}><SelectValue placeholder="Select driver type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company Driver</SelectItem>
                    <SelectItem value="owner-operator">Owner Operator</SelectItem>
                    <SelectItem value="lease">Lease Operator</SelectItem>
                    <SelectItem value="student">Student / Trainee</SelectItem>
                  </SelectContent>
                </Select>
                {errors.driverType && <p className="text-xs text-destructive">{errors.driverType}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-licenseClass" className="text-xs text-muted-foreground">License Class *</Label>
                <Select value={licenseClass} onValueChange={(v) => { setLicenseClass(v); setErrors((p) => ({ ...p, licenseClass: "" })); }} name="licenseClass">
                  <SelectTrigger id="modal-licenseClass" className={errors.licenseClass ? "border-destructive" : ""}><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a">Class A</SelectItem>
                    <SelectItem value="b">Class B</SelectItem>
                    <SelectItem value="c">Class C</SelectItem>
                    <SelectItem value="permit">Permit Only</SelectItem>
                  </SelectContent>
                </Select>
                {errors.licenseClass && <p className="text-xs text-destructive">{errors.licenseClass}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-yearsExp" className="text-xs text-muted-foreground">Years Experience *</Label>
                <Select value={yearsExp} onValueChange={(v) => { setYearsExp(v); setErrors((p) => ({ ...p, yearsExp: "" })); }} name="yearsExp">
                  <SelectTrigger id="modal-yearsExp" className={errors.yearsExp ? "border-destructive" : ""}><SelectValue placeholder="Select experience" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="less-1">Less than 1 year</SelectItem>
                    <SelectItem value="1-3">1–3 years</SelectItem>
                    <SelectItem value="3-5">3–5 years</SelectItem>
                    <SelectItem value="5+">5+ years</SelectItem>
                  </SelectContent>
                </Select>
                {errors.yearsExp && <p className="text-xs text-destructive">{errors.yearsExp}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-licenseState" className="text-xs text-muted-foreground">License State *</Label>
                <Select value={licenseState} onValueChange={(v) => { setLicenseState(v); setErrors((p) => ({ ...p, licenseState: "" })); }} name="licenseState">
                  <SelectTrigger id="modal-licenseState" className={errors.licenseState ? "border-destructive" : ""}><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.licenseState && <p className="text-xs text-destructive">{errors.licenseState}</p>}
              </div>
            </div>
          </div>

          {/* Endorsements */}
          <div>
            <SectionHeader>Endorsements (optional):</SectionHeader>
            <div className="grid sm:grid-cols-2 gap-x-12 gap-y-1">
              <ToggleRow id="modal-doublesTriples" name="doublesTriples" label="Doubles/Triples (T)" checked={endorse.doublesTriples} onChange={tog(setEndorse, "doublesTriples")} />
              <ToggleRow id="modal-hazmat" name="hazmat" label="HAZMAT (H)" checked={endorse.hazmat} onChange={tog(setEndorse, "hazmat")} />
              <ToggleRow id="modal-tankVehicles" name="tankVehicles" label="Tank Vehicles (N)" checked={endorse.tankVehicles} onChange={tog(setEndorse, "tankVehicles")} />
              <ToggleRow id="modal-tankerHazmat" name="tankerHazmat" label="Tanker + HAZMAT (X)" checked={endorse.tankerHazmat} onChange={tog(setEndorse, "tankerHazmat")} />
            </div>
          </div>

          {/* Hauler experience */}
          <div>
            <SectionHeader>Hauler Experience:</SectionHeader>
            <div className="grid sm:grid-cols-3 gap-x-8 gap-y-1">
              <ToggleRow id="modal-box" name="box" label="Box" checked={hauler.box} onChange={tog(setHauler, "box")} />
              <ToggleRow id="modal-carHaul" name="carHaul" label="Car Hauler" checked={hauler.carHaul} onChange={tog(setHauler, "carHaul")} />
              <ToggleRow id="modal-dropAndHook" name="dropAndHook" label="Drop and Hook" checked={hauler.dropAndHook} onChange={tog(setHauler, "dropAndHook")} />
              <ToggleRow id="modal-dryBulk" name="dryBulk" label="Dry Bulk" checked={hauler.dryBulk} onChange={tog(setHauler, "dryBulk")} />
              <ToggleRow id="modal-dryVan" name="dryVan" label="Dry Van" checked={hauler.dryVan} onChange={tog(setHauler, "dryVan")} />
              <ToggleRow id="modal-flatbed" name="flatbed" label="Flatbed" checked={hauler.flatbed} onChange={tog(setHauler, "flatbed")} />
              <ToggleRow id="modal-hopperBottom" name="hopperBottom" label="Hopper Bottom" checked={hauler.hopperBottom} onChange={tog(setHauler, "hopperBottom")} />
              <ToggleRow id="modal-intermodal" name="intermodal" label="Intermodal" checked={hauler.intermodal} onChange={tog(setHauler, "intermodal")} />
              <ToggleRow id="modal-oilField" name="oilField" label="Oil Field" checked={hauler.oilField} onChange={tog(setHauler, "oilField")} />
              <ToggleRow id="modal-oversizeLoad" name="oversizeLoad" label="Oversize Load" checked={hauler.oversizeLoad} onChange={tog(setHauler, "oversizeLoad")} />
              <ToggleRow id="modal-refrigerated" name="refrigerated" label="Refrigerated" checked={hauler.refrigerated} onChange={tog(setHauler, "refrigerated")} />
              <ToggleRow id="modal-tanker" name="tanker" label="Tanker" checked={hauler.tanker} onChange={tog(setHauler, "tanker")} />
            </div>
          </div>

          {/* Route preference */}
          <div>
            <SectionHeader>Route Preference:</SectionHeader>
            <div className="grid sm:grid-cols-3 gap-x-8 gap-y-1">
              <ToggleRow id="modal-dedicated" name="dedicated" label="Dedicated" checked={route.dedicated} onChange={tog(setRoute, "dedicated")} />
              <ToggleRow id="modal-local" name="local" label="Local" checked={route.local} onChange={tog(setRoute, "local")} />
              <ToggleRow id="modal-ltl" name="ltl" label="LTL" checked={route.ltl} onChange={tog(setRoute, "ltl")} />
              <ToggleRow id="modal-otr" name="otr" label="OTR" checked={route.otr} onChange={tog(setRoute, "otr")} />
              <ToggleRow id="modal-regional" name="regional" label="Regional" checked={route.regional} onChange={tog(setRoute, "regional")} />
            </div>
          </div>

          <Separator />

          {/* Additional questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Interested in solo or team driving?</span>
              <Select value={soloTeam} onValueChange={setSoloTeam} name="soloTeam">
                <SelectTrigger id="modal-soloTeam" className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Solo">Solo</SelectItem>
                  <SelectItem value="Team">Team</SelectItem>
                  <SelectItem value="Either">Either</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ToggleRow id="modal-leasePurchase" name="leasePurchase" label="Interested in lease purchase?" checked={extra.leasePurchase} onChange={tog(setExtra, "leasePurchase")} />
            <ToggleRow id="modal-accidents" name="accidents" label="Have you had any accidents or violations in the past 3 years?" checked={extra.accidents} onChange={tog(setExtra, "accidents")} />
            <ToggleRow id="modal-suspended" name="suspended" label="Have you had your license suspended or DUI/DWI charges in the past 10 years?" checked={extra.suspended} onChange={tog(setExtra, "suspended")} />
            <ToggleRow id="modal-newsletters" name="newsletters" label="Yes! Sign me up to receive newsletters and job alerts" checked={extra.newsletters} onChange={tog(setExtra, "newsletters")} />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="modal-notes" className="text-sm font-medium mb-2 block">Message to {companyName} (optional):</Label>
            <Textarea
              id="modal-notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tell them about yourself, your experience, or anything else you'd like them to know..."
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {notes.trim() ? notes.trim().split(/\s+/).length : 0} words
            </p>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pb-2">
            <Button type="submit" className="px-8" disabled={submitting}>
              {submitting ? "Submitting..." : "Send Application"}
            </Button>
            <Button type="button" variant="outline" className="px-8" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
