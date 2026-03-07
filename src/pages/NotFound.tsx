import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { usePageTitle, useNoIndex } from "@/hooks/usePageTitle";

const NotFound = () => {
  usePageTitle("Page Not Found");
  useNoIndex();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="text-center max-w-md">
          <p className="font-display text-6xl font-bold text-primary mb-4">404</p>
          <h1 className="font-display text-xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground text-sm mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/">Go Home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/jobs">Browse Jobs</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
