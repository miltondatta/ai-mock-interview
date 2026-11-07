import Navbar from "./_components/landing/Navbar";
import HeroSection from "./_components/landing/HeroSection";
import ProductShowcase from "./_components/landing/ProductShowcase";
import HowItWorksSection from "./_components/landing/HowItWorksSection";
import InterviewModesSection from "./_components/landing/InterviewModesSection";
import BenefitsSection from "./_components/landing/BenefitsSection";
import TestimonialsSection from "./_components/landing/TestimonialsSection";
import PricingSection from "./_components/landing/PricingSection";
import FAQSection from "./_components/landing/FAQSection";
import ContactSection from "./_components/landing/ContactSection";
import FinalCTASection from "./_components/landing/FinalCTASection";
import LandingFooter from "./_components/landing/LandingFooter";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-white">
      <Navbar />
      <main>
        <HeroSection />
        <ProductShowcase />
        <HowItWorksSection />
        <InterviewModesSection />
        <BenefitsSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <ContactSection />
        <FinalCTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
