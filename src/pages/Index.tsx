import { lazy, Suspense } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import { usePageTitle } from "@/hooks/usePageTitle";

const HowItWorks = lazy(() => import("@/components/HowItWorks"));
const JobCategories = lazy(() => import("@/components/JobCategories"));
const TopCompanies = lazy(() => import("@/components/TopCompanies"));
const Stats = lazy(() => import("@/components/Stats"));
const Reviews = lazy(() => import("@/components/Reviews"));
const CTA = lazy(() => import("@/components/CTA"));

const Index = () => {
  usePageTitle("CDL Trucking Jobs — AI-Powered Matching");
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <Suspense fallback={
          <div className="py-20 flex items-center justify-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" role="status" aria-label="Loading sections" />
          </div>
        }>
          <HowItWorks />
          <JobCategories />
          <TopCompanies />
          <Stats />
          <Reviews />
          <CTA />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
