import FeaturesSection from "@/components/landing/FeaturesSection";
import IntegrationsSection from "@/components/landing/IntegrationsSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import Footer from "@/components/landing/Footer";
import HeroSection from "@/components/landing/HeroSection";
import StatsSection from "@/components/landing/StatsSection";
import MoreFeaturesSection from "@/components/landing/MoreFeaturesSection";
import CTASection from "@/components/landing/CTASection";
import React from "react";


export default function Home() {
  return (

    <div className="min-h-screen bg-black">
      <HeroSection />
      <FeaturesSection />
      <IntegrationsSection />
      <HowItWorksSection />
      <StatsSection />
      <MoreFeaturesSection />
      {/* <CTASection /> */}
      <Footer />
    </div>
  );
}