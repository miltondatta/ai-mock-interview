"use client"

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Show, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";

export default function CtaSection() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-border bg-primary/10 px-6 py-14 text-center shadow-md md:py-20"
      >
        <div className="absolute inset-x-0 top-0 mx-auto h-px w-40 bg-gradient-to-r from-transparent via-primary to-transparent" />

        <h2 className="mx-auto max-w-xl text-2xl font-bold tracking-tight text-foreground md:text-4xl">
          Ready to ace your next interview?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Start a free mock interview session today and see where you stand.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button size="lg">Get Started for Free</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          </Show>
        </div>
      </motion.div>
    </div>
  );
}
