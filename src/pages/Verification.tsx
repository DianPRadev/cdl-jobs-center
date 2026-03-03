import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth";
import { useVerificationRequest, useSubmitVerification } from "@/hooks/useVerification";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle, Clock, XCircle, FileText, X, Upload } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle } from "@/hooks/usePageTitle";

const Verification = () => {
  usePageTitle("Company Verification");
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: request, isLoading } = useVerificationRequest(user?.id);
  const submitVerification = useSubmitVerification();

  const [dotNumber, setDotNumber] = useState("");
  const [businessEin, setBusinessEin] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [fleetSize, setFleetSize] = useState("");
  const [notes, setNotes] = useState("");
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);

    const ALLOWED_TYPES = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB

    const urls: string[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Only PDF, JPG, and PNG files are allowed.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is too large. Max 10MB.`);
        continue;
      }
      // Sanitize filename: strip path chars, keep only safe characters
      const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\.{2,}/g, "_");
      const path = `${user!.id}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("verification-documents").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }
      // Store the storage path — we'll generate signed URLs when displaying
      urls.push(path);
    }
    setDocumentUrls((prev) => [...prev, ...urls]);
    setUploading(false);
    e.target.value = "";
  };

  const handleSubmit = () => {
    if (!dotNumber.trim()) {
      toast.error("DOT/MC number is required.");
      return;
    }
    submitVerification.mutate({
      companyId: user!.id,
      dotNumber,
      businessEin,
      yearsInBusiness,
      fleetSize,
      notes,
      documentUrls,
    }, {
      onSuccess: () => {
        toast.success("Verification request submitted! We'll review it shortly.");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to submit request."),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-2xl">
          <div className="flex justify-center py-20"><Spinner /></div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8 max-w-2xl">
        {/* Breadcrumb */}
        <p className="text-sm text-muted-foreground mb-6">
          <Link to="/" className="text-primary underline hover:opacity-80">Main</Link>
          <span className="mx-1">&raquo;</span>
          <Link to="/dashboard" className="text-primary underline hover:opacity-80">Dashboard</Link>
          <span className="mx-1">&raquo;</span>
          Verification
        </p>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 border-l-4 border-primary pl-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold">Company Verification</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Verify your company to build trust with drivers and stand out in search results.
            </p>
          </div>
        </div>

        {/* Status: Approved */}
        {request?.status === "approved" && (
          <div className="border border-border bg-card p-6">
            <div className="flex items-center gap-4 p-5 bg-green-500/10 border border-green-500/30 rounded-md">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400 text-lg">Your company is verified</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drivers can see the verified badge on your profile and job listings.
                </p>
              </div>
            </div>
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* Status: Pending */}
        {request?.status === "pending" && (
          <div className="border border-border bg-card p-6">
            <div className="flex items-center gap-4 p-5 bg-amber-500/10 border border-amber-500/30 rounded-md">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-400 text-lg">Verification under review</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your request was submitted on {formatDate(request.createdAt)}. Our team will review it shortly.
                </p>
              </div>
            </div>
            <div className="mt-6 border border-border rounded-md p-4 space-y-2 text-sm">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-3">Submitted Information</p>
              <p><span className="text-muted-foreground">DOT/MC #:</span> {request.dotNumber || "—"}</p>
              {request.businessEin && <p><span className="text-muted-foreground">Business EIN:</span> {request.businessEin}</p>}
              {request.yearsInBusiness && <p><span className="text-muted-foreground">Years in Business:</span> {request.yearsInBusiness}</p>}
              {request.fleetSize && <p><span className="text-muted-foreground">Fleet Size:</span> {request.fleetSize}</p>}
              {request.notes && <p><span className="text-muted-foreground">Notes:</span> {request.notes}</p>}
              {request.documentUrls.length > 0 && (
                <p><span className="text-muted-foreground">Documents:</span> {request.documentUrls.length} file(s) uploaded</p>
              )}
            </div>
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* Status: Rejected or No Request — show form */}
        {request?.status !== "approved" && request?.status !== "pending" && (
          <div className="border border-border bg-card">
            {/* Rejection notice */}
            {request?.status === "rejected" && (
              <div className="px-6 pt-6">
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-md">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-400 text-sm">Your previous request was not approved</p>
                    {request.rejectionReason && (
                      <p className="text-sm text-muted-foreground mt-0.5">Reason: {request.rejectionReason}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">You can submit a new request with updated information below.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="p-6 space-y-5">
              <div>
                <p className="font-medium text-sm mb-1">Why get verified?</p>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Verified badge on your company profile and job listings
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Increased trust from drivers browsing the platform
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Stand out from unverified companies in search results
                  </li>
                </ul>
              </div>

              <hr className="border-border" />

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="v-dot" className="text-sm font-medium">DOT / MC Number <span className="text-destructive">*</span></Label>
                  <Input id="v-dot" placeholder="e.g. 1234567" value={dotNumber} onChange={(e) => setDotNumber(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Your USDOT or MC number from FMCSA.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-ein" className="text-sm font-medium">Business EIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input id="v-ein" placeholder="e.g. 12-3456789" value={businessEin} onChange={(e) => setBusinessEin(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-years" className="text-sm font-medium">Years in Business</Label>
                  <Select value={yearsInBusiness} onValueChange={setYearsInBusiness} name="yearsInBusiness">
                    <SelectTrigger id="v-years"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0-1">Less than 1 year</SelectItem>
                      <SelectItem value="1-3">1–3 years</SelectItem>
                      <SelectItem value="3-5">3–5 years</SelectItem>
                      <SelectItem value="5-10">5–10 years</SelectItem>
                      <SelectItem value="10+">10+ years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-fleet" className="text-sm font-medium">Fleet Size</Label>
                  <Select value={fleetSize} onValueChange={setFleetSize} name="fleetSize">
                    <SelectTrigger id="v-fleet"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1–10 trucks</SelectItem>
                      <SelectItem value="11-50">11–50 trucks</SelectItem>
                      <SelectItem value="51-200">51–200 trucks</SelectItem>
                      <SelectItem value="200+">200+ trucks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-notes" className="text-sm font-medium">Additional Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea id="v-notes" placeholder="Anything else that supports your verification..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Supporting Documents <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <p className="text-xs text-muted-foreground">Business license, DOT certificate, insurance documents, etc. PDF, JPG, or PNG. Max 10MB each.</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-md cursor-pointer transition-colors text-sm font-medium">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading..." : "Choose Files"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    onChange={handleUpload}
                    className="sr-only"
                    disabled={uploading}
                  />
                </label>
                {documentUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {documentUrls.map((url, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-muted rounded text-xs">
                        <FileText className="h-3.5 w-3.5" />
                        Document {i + 1}
                        <button type="button" onClick={() => setDocumentUrls((d) => d.filter((_, j) => j !== i))} className="ml-1 text-destructive hover:text-destructive/80">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-border" />

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSubmit}
                  disabled={submitVerification.isPending || uploading || !dotNumber.trim()}
                  className="px-6"
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {submitVerification.isPending ? "Submitting..." : "Submit Verification Request"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Verification;
