"use client"

import React from "react"
import { PricingTable } from "@clerk/nextjs"

function Upgrade() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Upgrade</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          Choose the plan that fits you
        </h1>
      </div>

      <div className="mt-10">
        <PricingTable
          appearance={{
            variables: {
              colorPrimary: "var(--primary)",
              colorBackground: "var(--card)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted-foreground)",
              colorInput: "var(--input)",
              colorInputForeground: "var(--foreground)",
              colorNeutral: "var(--muted-foreground)",
              colorDanger: "var(--destructive)",
              colorSuccess: "var(--success)",
              colorWarning: "var(--warning)",
              borderRadius: "var(--radius)",
              fontFamily: "inherit",
            },
            elements: {
              card: "border border-border shadow-none",
            },
          }}
        />
      </div>
    </div>
  )
}

export default Upgrade
