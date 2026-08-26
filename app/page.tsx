import Header from "./_components/Header";
import Hero from "./_components/Hero";
import Features from "./_components/Features";
import CtaSection from "./_components/CtaSection";
import Footer from "./_components/Footer";
import BackgroundDecoration from "./_components/BackgroundDecoration";

export default function Home() {
  return (
    <div>
      <BackgroundDecoration />
      <Header />
      <Hero />
      <Features />
      <CtaSection />
      <Footer />
    </div>
  );
}
