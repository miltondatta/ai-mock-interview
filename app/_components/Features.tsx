"use client"

import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  MessageSquareText,
  Sparkles,
  Video,
} from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Resume-aware questions",
    description:
      "Upload your resume or paste a job description and get interview questions tailored to the role.",
  },
  {
    icon: Video,
    title: "Live AI avatar sessions",
    description:
      "Practice out loud with a realistic AI interviewer that listens, responds, and keeps the conversation natural.",
  },
  {
    icon: Sparkles,
    title: "Instant feedback",
    description:
      "Get a detailed breakdown of your answers, communication, and areas to improve right after each session.",
  },
  {
    icon: MessageSquareText,
    title: "Unlimited practice",
    description:
      "Retake interviews as many times as you like to build confidence before the real thing.",
  },
];

export default function Features() {
  return (
    <div className="relative mx-auto max-w-7xl px-4 py-10 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
        className="mx-auto max-w-2xl text-center"
      >
        <Badge>Why AI Mock Interview</Badge>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-4xl">
          Everything you need to walk in prepared
        </h2>
        <p className="mt-3 text-muted-foreground">
          A practice ground designed to feel like the real interview, minus the pressure.
        </p>
      </motion.div>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="flex flex-col gap-3 rounded-3xl border border-border bg-muted/40 p-6 shadow-md"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <feature.icon className="size-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {feature.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
