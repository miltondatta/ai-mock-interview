import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs'
import { ConvexClientProvider } from "./ConvexClientProvider";
const outfit = Outfit({
  // variable: "--font-geist-sans",
  subsets: ["latin"]
});

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "AI Mock Interview",
  description: "Practice job interviews with AI-powered mock interview sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
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
          card: "shadow-lg border border-border rounded-3xl",
          modalContent: "rounded-3xl",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted-foreground",
          formButtonPrimary:
            "bg-primary text-primary-foreground hover:bg-primary/80 text-sm normal-case shadow-none",
          formFieldInput: "border-border focus:border-ring",
          socialButtonsBlockButton:
            "!border !border-border !bg-card !text-foreground hover:!bg-muted !shadow-sm !opacity-100",
          socialButtonsBlockButtonText: "!text-foreground !font-medium !opacity-100",
          socialButtonsProviderIcon: "!opacity-100",
          footerActionLink: "text-primary hover:text-primary/80",
          userButtonPopoverCard: "rounded-2xl border border-border shadow-lg",
          userButtonPopoverActionButton: "hover:bg-muted rounded-lg",
          userButtonPopoverActionButtonText: "text-foreground",
          userButtonPopoverMain: "bg-card",
          userPreviewMainIdentifier: "text-foreground",
          navbar: "bg-muted/40",
          navbarButton: "text-foreground",
          profileSectionPrimaryButton:
            "text-primary hover:text-primary/80",
          badge: "bg-primary/10 text-primary",
          avatarBox: "rounded-full ring-2 ring-border",
        },
      }}
    >
    <html
      lang="en"
      // className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // className="{outfit.className}"
    >
      <body className={outfit.className} suppressHydrationWarning>
        <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
    </html>
    </ClerkProvider>
  );
}
