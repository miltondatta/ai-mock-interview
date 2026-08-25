import Image from "next/image"

function HowItWorks() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-sm font-medium text-muted-foreground">How it works</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          Your journey to interview success
        </h1>
      </div>

      <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-muted/40 p-4 shadow-md">
        <div className="w-full overflow-hidden rounded-xl border border-border">
          <Image
            src="/how-it-works.png"
            alt="How AI Mock Interview works, from sign up to reviewing your results"
            className="h-auto w-full object-cover"
            width={1693}
            height={929}
            priority
          />
        </div>
      </div>
    </div>
  )
}

export default HowItWorks
