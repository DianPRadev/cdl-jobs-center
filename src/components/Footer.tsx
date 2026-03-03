import { Link } from "react-router-dom";
import { Phone, MapPin, Facebook, Instagram } from "lucide-react";
import { useAuth } from "@/context/auth";

const Footer = () => {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";
  return (
    <footer className="bg-secondary pt-16 pb-8">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-4 gap-10 mb-12">

          {/* For Drivers */}
          <div>
            <h2 className="font-display font-semibold text-secondary-foreground mb-4 text-base">For Drivers</h2>
            <div className="flex flex-col gap-2">
              {[
                { label: "Browse Jobs", path: "/jobs" },
                { label: "Apply Now", path: "/apply" },
                { label: "Company Directory", path: "/companies" },
                { label: "Driver Dashboard", path: "/driver-dashboard" },
                { label: "Driver Sign In", path: "/signin" },
                ...(!isDriver ? [{ label: "Pricing", path: "/pricing" }] : []),
              ].map((item) => (
                <Link key={item.label} to={item.path} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* For Companies */}
          <div>
            <h2 className="font-display font-semibold text-secondary-foreground mb-4 text-base">For Companies</h2>
            <div className="flex flex-col gap-2">
              {[
                { label: "Company Login", path: "/signin" },
                { label: "Post Jobs", path: "/dashboard" },
                { label: "Subscription Plans", path: "/pricing" },
                { label: "Privacy Policy", path: "/privacy" },
                { label: "Terms of Service", path: "/terms" },
              ].map((item) => (
                <Link key={item.label} to={item.path} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* About + Follow Us */}
          <div>
            <h2 className="font-display font-semibold text-secondary-foreground mb-4 text-base">About</h2>
            <p className="text-sm text-muted-foreground mb-4">
              CDL Job Center connects CDL drivers with top trucking companies across the United States using AI-powered matching.
            </p>
            <p className="text-xs text-muted-foreground mb-6">© {new Date().getFullYear()} CDL Job Center</p>
            <h2 className="font-display font-semibold text-secondary-foreground mb-3 text-base">Follow Us</h2>
            <div className="flex items-center gap-3">
              <a
                href="https://www.facebook.com/profile.php?id=100087216585082"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow CDL Jobs Center on Facebook"
                className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
              >
                <Facebook className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="https://www.instagram.com/cdljobscenter/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow CDL Jobs Center on Instagram"
                className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
              >
                <Instagram className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Contact Us */}
          <div>
            <h2 className="font-display font-semibold text-secondary-foreground mb-4 text-base">Contact Us</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                1975 E Sunrise Blvd, Fort Lauderdale, FL 33304
              </div>
              <a href="tel:+16189360241" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Phone className="h-4 w-4" /> +1618-936-0241
              </a>
            </div>
          </div>

        </div>

        <div className="border-t border-border/20 pt-8 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            © Copyright {new Date().getFullYear()} - CDL Job Center
          </p>
          <p className="text-sm text-muted-foreground">
            All Rights Reserved —{" "}
            <Link to="/privacy" className="text-secondary-foreground underline hover:text-primary">Privacy Policy</Link>
            {" "}&{" "}
            <Link to="/terms" className="text-secondary-foreground underline hover:text-primary">Terms of Service</Link>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
