import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { usePageTitle, useNoIndex } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageBreadcrumb } from "@/components/ui/PageBreadcrumb";
import { User, MapPin, Award, Truck, MessageSquare, Phone, Mail, Shield, Calendar, Hash, Home } from "lucide-react";
import { useAuth } from "@/context/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const LICENSE_CLASS_LABELS: Record<string, string> = {
  a: "Class A",
  b: "Class B",
  c: "Class C",
  permit: "Permit Only",
};

const YEARS_EXP_LABELS: Record<string, string> = {
  none: "None",
  "less-1": "Less than 1 year",
  "1-2": "1-2 years",
  "1-3": "1-3 years",
  "2-5": "2-5 years",
  "3-5": "3-5 years",
  "5-10": "5-10 years",
  "5+": "5+ years",
  "10+": "10+ years",
};

const DriverProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const { data: hasApplication = false } = useQuery({
    queryKey: ["driver-has-application", id, user?.id],
    enabled: !!id && !!user && user.role === "company",
    refetchOnMount: "always",
    queryFn: async () => {
      const { count, error } = await supabase
        .from("applications")
        .select("id", { head: true, count: "exact" })
        .eq("driver_id", id)
        .eq("company_id", user!.id)
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const { data: driver, isLoading, isError, error } = useQuery({
    queryKey: ["driver-profile-full", id],
    enabled: !!id && !!user && (user.role === "company" || isAdmin),
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_profiles")
        .select("id, first_name, last_name, license_class, years_exp, license_state, about, phone, driver_type, cdl_number, zip_code, home_address, date_of_birth, has_accidents, wants_contact")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", id)
        .maybeSingle();

      const fullName = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
      return {
        id: data.id,
        name: fullName || "Unnamed Driver",
        firstName: data.first_name ?? "",
        lastName: data.last_name ?? "",
        licenseClass: LICENSE_CLASS_LABELS[data.license_class ?? ""] ?? "Not specified",
        experience: YEARS_EXP_LABELS[data.years_exp ?? ""] ?? "Not specified",
        state: data.license_state || "Not specified",
        about: data.about ?? "",
        phone: data.phone ?? "",
        email: profile?.email ?? "",
        driverType: data.driver_type ?? "",
        cdlNumber: data.cdl_number ?? "",
        zipCode: data.zip_code ?? "",
        homeAddress: data.home_address ?? "",
        dateOfBirth: data.date_of_birth ?? "",
        hasAccidents: data.has_accidents,
        wantsContact: data.wants_contact,
      };
    },
  });

  usePageTitle(driver?.name ?? "Driver Profile");
  useNoIndex();

  if (!user || (user.role !== "company" && user.role !== "admin")) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl text-center">
          <p className="text-muted-foreground">Company access required.</p>
          <Button className="mt-4" asChild>
            <Link to="/">Go Home</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl text-center">
          <p className="text-muted-foreground">Loading driver profile...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl text-center">
          <p className="text-destructive">{(error as Error).message || "Failed to load driver profile."}</p>
          <Button className="mt-4" onClick={() => navigate("/drivers")}>Back to Drivers</Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto py-8 max-w-3xl text-center">
          <p className="text-muted-foreground">Driver not found.</p>
          <Button className="mt-4" onClick={() => navigate("/drivers")}>Back to Drivers</Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-6 max-w-3xl">
        <PageBreadcrumb items={[{ label: "Main", to: "/" }, { label: "Drivers", to: "/drivers" }, { label: driver.name }]} />

        <div className="border border-border bg-card mb-4">
          {/* Header */}
          <div className="bg-foreground text-background dark:bg-muted dark:text-foreground px-6 py-5 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl">{driver.name}</h1>
              <p className="text-sm opacity-70 mt-0.5">
                {driver.driverType || "CDL Driver"} | {driver.licenseClass}
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Core info */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">License State</p>
                  <p className="font-medium text-sm">{driver.state}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Truck className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Experience</p>
                  <p className="font-medium text-sm">{driver.experience}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Award className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">License Class</p>
                  <p className="font-medium text-sm">{driver.licenseClass}</p>
                </div>
              </div>
            </div>

            {/* Contact & details */}
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              {driver.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <a href={`tel:${driver.phone}`} className="font-medium text-sm text-primary hover:underline">{driver.phone}</a>
                  </div>
                </div>
              )}
              {driver.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <a href={`mailto:${driver.email}`} className="font-medium text-sm text-primary hover:underline">{driver.email}</a>
                  </div>
                </div>
              )}
              {driver.cdlNumber && (
                <div className="flex items-center gap-2.5">
                  <Hash className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">CDL Number</p>
                    <p className="font-medium text-sm">{driver.cdlNumber}</p>
                  </div>
                </div>
              )}
              {driver.zipCode && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Zip Code</p>
                    <p className="font-medium text-sm">{driver.zipCode}</p>
                  </div>
                </div>
              )}
              {driver.homeAddress && (
                <div className="flex items-center gap-2.5 sm:col-span-2">
                  <Home className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Home Address</p>
                    <p className="font-medium text-sm">{driver.homeAddress}</p>
                  </div>
                </div>
              )}
              {driver.dateOfBirth && (
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Date of Birth</p>
                    <p className="font-medium text-sm">{driver.dateOfBirth}</p>
                  </div>
                </div>
              )}
              {driver.hasAccidents !== null && (
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Accidents on Record</p>
                    <p className="font-medium text-sm">{driver.hasAccidents ? "Yes" : "No"}</p>
                  </div>
                </div>
              )}
              {driver.wantsContact !== null && (
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Open to Contact</p>
                    <p className="font-medium text-sm">{driver.wantsContact ? "Yes" : "No"}</p>
                  </div>
                </div>
              )}
            </div>

            {/* About */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-3 border-l-4 border-primary pl-3">About</p>
              <p className="text-sm text-muted-foreground">{driver.about || "No profile summary provided yet."}</p>
            </div>

            <div className="flex gap-3 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => navigate("/drivers")}>
                Back to Directory
              </Button>
              {isAdmin && (
                <Button variant="outline" onClick={() => navigate(`/admin?tab=users&search=${encodeURIComponent(driver.name)}`)}>
                  Manage in Admin
                </Button>
              )}
              {hasApplication && (
                <Button
                  onClick={() => navigate(`/dashboard?tab=messages&driver=${encodeURIComponent(id ?? "")}`)}
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Message Driver
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DriverProfile;
