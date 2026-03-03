import { ArrowRight, Shield, Zap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/auth";

const heroVideo = "/hero-bg.mp4";

const Hero = () => {
  const { user } = useAuth();
  const isCompany = user?.role === "company";
  const isDriver = user?.role === "driver";
  return (
    <section className="relative overflow-hidden bg-secondary min-h-[90vh] flex items-center">
      {/* Background image */}
      <div className="absolute inset-0">
        <picture>
          <source
            type="image/avif"
            srcSet="/hero-truck-640.avif 640w, /hero-truck-960.avif 960w, /hero-truck-1280.avif 1280w, /hero-truck-1920.avif 1920w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/hero-truck-640.webp 640w, /hero-truck-960.webp 960w, /hero-truck-1280.webp 1280w, /hero-truck-1920.webp 1920w"
            sizes="100vw"
          />
          <img
            src="/hero-truck-1280.jpg"
            alt="Professional CDL truck driver"
            width={1920}
            height={1080}
            className="w-full h-full object-cover opacity-40"
            {...({ fetchpriority: "high" } as Record<string, string>)}
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-secondary via-secondary/90 to-secondary/50" />
      </div>

      {/* Floating orb */}
      <div className="absolute top-20 right-20 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-float" />

      <div className="container mx-auto relative z-10 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] xl:grid-cols-[minmax(0,1fr)_minmax(440px,620px)]">
          <div className="max-w-2xl">
            <div
              className="animate-hero-fade-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6"
              style={{ animationDuration: "0.5s" }}
            >
              <Zap className="h-4 w-4" />
              {isCompany
                ? "AI-Powered Driver Matching"
                : "AI-Powered Job Matching"}
            </div>

            <h1
              className="animate-hero-fade-up font-display text-5xl md:text-7xl font-bold text-secondary-foreground leading-tight mb-6"
              style={{ animationDelay: "0.1s" }}
            >
              {isCompany ? "Find the CDL Drivers " : "Find the Trucking Job "}
              <span className="text-gradient">
                {isCompany ? "You Need" : "You Deserve"}
              </span>
            </h1>

            <p
              className="animate-hero-fade-up text-lg md:text-xl text-muted-foreground mb-8 max-w-lg"
              style={{ animationDelay: "0.2s" }}
            >
              {isCompany
                ? "Post once, get matched with qualified CDL drivers instantly. Over 150 carriers trust us."
                : isDriver
                  ? "Get AI-ranked jobs based on your profile and preferences. Over 2,000 drivers placed and counting."
                  : "Apply once, get matched with top carriers instantly. Over 2,000 drivers placed and counting."}
            </p>

            <div
              className="animate-hero-fade-up flex flex-col sm:flex-row gap-4"
              style={{ animationDelay: "0.3s" }}
            >
              <Button
                size="lg"
                className="text-lg px-8 glow-orange group"
                asChild
              >
                <Link to={isCompany ? "/dashboard" : "/apply"}>
                  {isCompany ? "Post a Job" : isDriver ? "Find My Matches" : "Apply Now"}
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 border-border/50 text-secondary-foreground hover:bg-muted/20 hover:text-secondary-foreground"
                asChild
              >
                <Link to={isCompany ? "/drivers" : "/jobs"}>
                  {isCompany ? "Browse Drivers" : "Browse Jobs"}
                </Link>
              </Button>
            </div>

            {/* Trust badges */}
            <div
              className="animate-hero-fade-in mt-12 flex items-center gap-x-8 gap-y-3 flex-wrap border-t border-border/20 pt-8"
              style={{ animationDelay: "0.5s" }}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="h-5 w-5 text-primary" />
                <span className="text-sm">
                  {isCompany ? "Verified Drivers" : "Verified Companies"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-sm">
                  {isCompany
                    ? "150+ Partner Companies"
                    : "2,000+ Drivers Placed"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-5 w-5 text-primary" />
                <span className="text-sm">Instant Matching</span>
              </div>
            </div>
          </div>

          <div
            className="animate-hero-slide-left hidden lg:block justify-self-end w-full max-w-[620px] xl:max-w-[700px]"
            style={{ animationDelay: "0.25s" }}
          >
            <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/20 p-2 backdrop-blur-sm shadow-xl lg:-translate-y-4">
              <video
                src={heroVideo}
                className="w-full rounded-xl bg-black/30 object-contain aspect-video"
                autoPlay
                muted
                loop
                playsInline
                preload="none"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
