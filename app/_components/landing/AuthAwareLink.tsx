"use client";

import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";

interface AuthAwareLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
  /** Which Clerk modal opens for a signed-out visitor. Defaults to sign-up,
   * matching the rest of the landing page's primary "get started" CTAs. */
  authMode?: "sign-up" | "sign-in";
}

// Every in-app destination on this site (besides the landing page, auth
// pages, legal pages and the admin panel) requires a signed-in Clerk session
// - proxy.ts already enforces that at the route level. This component makes
// landing-page CTAs that point into the app check sign-in state up front and
// open the matching Clerk modal instead of letting a signed-out click fall
// through to a page load that the server then bounces to sign-in.
export default function AuthAwareLink({ href, className, children, authMode = "sign-up" }: AuthAwareLinkProps) {
  const ModalButton = authMode === "sign-in" ? SignInButton : SignUpButton;

  return (
    <>
      <Show when="signed-out">
        <ModalButton mode="modal">
          <button type="button" className={className}>
            {children}
          </button>
        </ModalButton>
      </Show>
      <Show when="signed-in">
        <Link href={href} className={className}>
          {children}
        </Link>
      </Show>
    </>
  );
}
