import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { productSections } from "./data";

export default function ProductShowcase() {
  return (
    <section id="features" className="bg-white py-20 sm:py-28 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold text-orange-700">
            Inside the Platform
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
            Everything You Need to Prepare, in One Place
          </h2>
          <p className="mt-4 text-base text-stone-600 sm:text-lg">
            Real tools from the AI Mock Interview platform — built to take you from resume to offer.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-20 sm:mt-20 sm:gap-28">
          {productSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                id={section.id}
                className={`flex scroll-mt-20 flex-col items-center gap-10 lg:flex-row lg:gap-16 ${
                  section.reverse ? "lg:flex-row-reverse" : ""
                }`}
              >
                <div className="w-full lg:w-1/2">
                  <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-lg shadow-stone-900/5">
                    <Image
                      src={section.imageSrc}
                      alt={section.imageAlt}
                      width={section.width}
                      height={section.height}
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="h-auto w-full object-contain"
                    />
                  </div>
                </div>

                <div className="w-full lg:w-1/2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                    <Icon className="size-3.5" />
                    {section.eyebrow}
                  </span>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                    {section.heading}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-stone-600">
                    {section.description}
                  </p>

                  <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    {section.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-stone-700">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={section.href}
                    className="mt-8 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
                  >
                    {section.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
