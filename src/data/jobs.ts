export interface Job {
  id: string;
  company: string;
  companyId?: string;  // uuid from profiles / jobs table
  title: string;
  description: string;
  type: string;        // freight type
  driverType: string;  // "Owner Operator" | "Company Driver" | "Student"
  routeType: string;   // "OTR" | "Local" | "Regional" | "Dedicated" | "LTL"
  teamDriving: string; // "Solo" | "Team" | "Both"
  location: string;
  pay: string;
  postedAt?: string;
  status?: "Draft" | "Active" | "Paused" | "Closed";
  logoUrl?: string;    // company logo URL from Supabase Storage
}
