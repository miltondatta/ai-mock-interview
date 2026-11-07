import { interviewModes } from "./data";

export default function InterviewModesSection() {
  return (
    <section id="modes" className="bg-white py-20 sm:py-28 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold text-orange-700">
            Interview Modes
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
            Prepare for Any Type of Interview
          </h2>
          <p className="mt-4 text-base text-stone-600 sm:text-lg">
            Eleven realistic interview formats to match exactly what you&apos;re facing next.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {interviewModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <div
                key={mode.title}
                className="group flex items-start gap-4 rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 transition-colors group-hover:bg-orange-600 group-hover:text-white">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">{mode.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{mode.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
