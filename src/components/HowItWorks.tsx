import { motion } from "framer-motion";
import { ClipboardList, Bot, Truck, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/auth";

const driverSteps = [
  {
    icon: ClipboardList,
    title: "Fill Out the Application",
    description: "Complete our simple, mobile-friendly application in under 5 minutes.",
    step: "01",
  },
  {
    icon: Bot,
    title: "AI Matches You",
    description: "Our AI instantly matches you with companies that fit your criteria and preferences.",
    step: "02",
  },
  {
    icon: Truck,
    title: "Start Driving",
    description: "Get hired and hit the road with a company that values you.",
    step: "03",
  },
];

const companySteps = [
  {
    icon: ClipboardList,
    title: "Post Your Job",
    description: "Create a job listing in minutes with our simple posting form.",
    step: "01",
  },
  {
    icon: Bot,
    title: "AI Matches Drivers",
    description: "Our AI instantly connects your listing with qualified CDL drivers who match your requirements.",
    step: "02",
  },
  {
    icon: Users,
    title: "Hire & Onboard",
    description: "Review applicants, manage your pipeline, and get drivers on the road.",
    step: "03",
  },
];

const HowItWorks = () => {
  const { user } = useAuth();
  const isCompany = user?.role === "company";
  const steps = isCompany ? companySteps : driverSteps;
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/5 to-transparent" />
      <div className="container mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-primary font-medium text-sm uppercase tracking-widest">How It Works</span>
          <h2 className="font-display text-4xl md:text-5xl font-bold mt-3">
            Three Steps to Your <span className="text-gradient">{isCompany ? "Next Hire" : "Dream Job"}</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative group"
            >
              <div className="glass rounded-2xl p-8 h-full hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <span className="font-display text-6xl font-bold text-primary/10 dark:text-primary/25 absolute top-4 right-6">
                  {step.step}
                </span>
                <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                  <step.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </div>

              {/* Connector line */}
              {i < 2 && (
                <div className="hidden md:block absolute top-1/2 -right-4 w-8 border-t-2 border-dashed border-primary/20" />
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center mt-14"
        >
          <Button size="lg" className="text-lg px-8 group" asChild>
            <Link to={isCompany ? "/dashboard" : "/apply"}>
              {isCompany ? "Post a Job Now" : "Get Started Today"}
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
