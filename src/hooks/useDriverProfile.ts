import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DriverProfile {
  firstName: string;
  lastName: string;
  phone: string;
  cdlNumber: string;
  driverType: string;
  licenseClass: string;
  yearsExp: string;
  licenseState: string;
  zipCode: string;
  dateOfBirth: string;
  about: string;
  homeAddress: string;
  interestedIn: string;
  nextJobWant: string;
  hasAccidents: string;
  wantsContact: string;
}

export function useDriverProfile(driverId: string) {
  const qc = useQueryClient();
  const key = ["driver_profile", driverId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_profiles")
        .select("*")
        .eq("id", driverId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        firstName: data.first_name ?? "",
        lastName: data.last_name ?? "",
        phone: data.phone ?? "",
        cdlNumber: data.cdl_number ?? "",
        driverType: data.driver_type ?? "",
        licenseClass: data.license_class ?? "",
        yearsExp: data.years_exp ?? "",
        licenseState: data.license_state ?? "",
        zipCode: data.zip_code ?? "",
        dateOfBirth: data.date_of_birth ?? "",
        about: data.about ?? "",
        homeAddress: data.home_address ?? "",
        interestedIn: data.interested_in ?? "",
        nextJobWant: data.next_job_want ?? "",
        hasAccidents: data.has_accidents ?? "",
        wantsContact: data.wants_contact ?? "",
      } as DriverProfile;
    },
    enabled: !!driverId,
  });

  const saveMutation = useMutation({
    mutationFn: async (profile: DriverProfile) => {
      const fullPayload = {
        id: driverId,
        first_name: profile.firstName,
        last_name: profile.lastName,
        phone: profile.phone,
        cdl_number: profile.cdlNumber,
        driver_type: profile.driverType,
        license_class: profile.licenseClass,
        years_exp: profile.yearsExp,
        license_state: profile.licenseState,
        zip_code: profile.zipCode,
        date_of_birth: profile.dateOfBirth,
        about: profile.about,
        home_address: profile.homeAddress,
        interested_in: profile.interestedIn,
        next_job_want: profile.nextJobWant,
        has_accidents: profile.hasAccidents,
        wants_contact: profile.wantsContact,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("driver_profiles").upsert(fullPayload);
      if (!error) return;

      // Backward-compatible fallback for environments missing newer columns.
      const { error: fallbackError } = await supabase.from("driver_profiles").upsert({
        id: driverId,
        first_name: profile.firstName,
        last_name: profile.lastName,
        phone: profile.phone,
        cdl_number: profile.cdlNumber,
        driver_type: profile.driverType,
        license_class: profile.licenseClass,
        years_exp: profile.yearsExp,
        license_state: profile.licenseState,
        zip_code: profile.zipCode,
        date_of_birth: profile.dateOfBirth,
        about: profile.about,
        updated_at: new Date().toISOString(),
      });

      if (fallbackError) throw fallbackError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    profile: data ?? null,
    isLoading,
    saveProfile: (p: DriverProfile) => saveMutation.mutateAsync(p),
  };
}
