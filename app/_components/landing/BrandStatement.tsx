// Brand statement, directly below the navigation bar. The inner wrapper
// carries mx-auto + max-w-7xl + the same px-4 sm:px-6 lg:px-8 padding as
// Navbar's <nav> element, all on one node - splitting that across an outer
// padded <section> and a separately-centered inner <div> double-applies the
// padding on wide screens and shifts this text left of the logo above it.
// Background runs FEFCFA -> F7F2EF -> FEFCFA so it blends with the navbar
// above and the white Hero section below, instead of leaving a visible seam.
export default function BrandStatement() {
  return (
    <section
      aria-label="Brand statement"
      className="bg-gradient-to-b from-[#FEFCFA] via-[#F7F2EF] to-[#FEFCFA] pb-3 pt-1 sm:pb-4 sm:pt-1.5"
    >
      <div className="mx-auto max-w-7xl px-4 text-left sm:px-6 lg:px-8">
        <h2 className="text-xs font-extrabold leading-snug tracking-tight text-[#1C1917] sm:text-sm lg:text-base">
          Your <span className="text-[#F14F00]">AI</span>. Your{" "}
          <span className="text-[#F14F00]">Career</span>. Your{" "}
          <span className="bg-gradient-to-r from-[#EA580C] to-[#F59E0B] bg-clip-text text-transparent">
            Future
          </span>
          .
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-600 sm:whitespace-nowrap sm:text-sm">
          A clear connection between AI technology and personalized career growth.
        </p>
      </div>
    </section>
  );
}
