import { benefits } from "./data";

export default function BenefitsSection() {
  return (
    <section id="about" className="bg-stone-900 py-20 sm:py-28 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-orange-400">
            Why Choose Us
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Why Choose AI Mock Interview?
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:bg-white/[0.07]"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-base font-semibold text-white">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{benefit.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
