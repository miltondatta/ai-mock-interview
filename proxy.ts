import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Everything except the landing page, Clerk's own auth pages, the separately
// (non-Clerk) authenticated admin panel, and the external Tavus webhook
// requires a signed-in Clerk session - signed-out visitors get bounced to
// sign-in instead of being able to reach any in-app page or data route.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/__clerk(.*)',
  '/admin(.*)',
  '/api/admin(.*)',
  '/api/tavus/webhook(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for Clerk's auto-proxy path
    '/__clerk/:path*',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};