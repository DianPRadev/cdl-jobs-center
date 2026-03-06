import { motion } from "framer-motion";
import { Star, BadgeCheck, ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const TopCompanies = () => {
  const { data: companies = [] } = useQuery({
    queryKey: ["top-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_profiles")
        .select("id, company_name, logo_url, is_verified")
        .eq("is_verified", true)
        .order("company_name");
      if (error) throw error;
      return (data ?? []).filter((c) => c.company_name?.trim());
    },
  });

  if (companies.length === 0) return null;

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row md:items-end md:justify-between mb-16"
        >
          <div>
            <span className="text-primary font-medium text-sm uppercase tracking-widest">Partners</span>
            <h2 className="font-display text-4xl md:text-5xl font-bold mt-3">
              Top <span className="text-gradient">Companies</span>
            </h2>
          </div>
          <Button variant="ghost" className="mt-4 md:mt-0 text-primary group" asChild>
            <Link to="/companies">
              View All Companies
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {companies.slice(0, 8).map((company, i) => (
            <motion.div
              key={company.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                to={`/companies/${company.id}`}
                className="glass rounded-2xl p-6 block hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group text-center sm:text-left"
              >
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt={company.company_name}
                    className="h-16 w-16 rounded-2xl object-cover mb-4 mx-auto sm:mx-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-cdl-amber/20 flex items-center justify-center mb-4 text-2xl font-display font-bold text-primary mx-auto sm:mx-0">
                    {company.company_name?.charAt(0) || <Building2 className="h-8 w-8" />}
                  </div>
                )}
                <h3 className="font-display font-semibold text-lg mb-2">{company.company_name}</h3>
                <div className="flex items-center justify-center sm:justify-start gap-1 mb-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-cdl-amber text-cdl-amber" />
                  ))}
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-primary">
                  <BadgeCheck className="h-4 w-4" />
                  Verified Company
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TopCompanies;
