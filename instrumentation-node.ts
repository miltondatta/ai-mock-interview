import dns from "node:dns"

// Local development only (gated in instrumentation.ts). On some home
// networks the IPv6 route to Cloudflare-fronted services (Convex, etc.)
// drops connections mid-TLS-handshake, so server-side fetches - e.g.
// ConvexHttpClient in app/api/study-room/tutor/start - fail at random with
// "TypeError: fetch failed ... read ECONNRESET". Node tries IPv6 first by
// default; resolving IPv4 addresses first avoids the broken route. Opt out
// with PREFER_IPV4=false in .env.local if your network's IPv6 is healthy.
if (process.env.PREFER_IPV4 !== "false") {
  dns.setDefaultResultOrder("ipv4first")
}
