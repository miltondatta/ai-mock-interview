// import arcjet, { tokenBucket } from "@arcjet/next";
//
// export const aj = arcjet({
//   key: process.env.ARCJET_KEY!, // Get your site key from https://app.arcjet.com
//   rules: [
//     // Create a token bucket rate limit. Other algorithms are supported.
//     tokenBucket({
//       mode: "LIVE", // will block requests. Use "DRY_RUN" to log only
//       characteristics: ["userId"], // track requests by a custom user ID
//       refillRate: 5, // refill 5 tokens per interval
//       interval: 86400, // refill every 24 hours
//       capacity: 10, // bucket maximum capacity of 10 tokens
//       // To re-test enforcement: interval: 180 (3 min refill), capacity: 3 (below the route's
//       // `requested: 5` cost, so the bucket can never have enough tokens — every request must be
//       // denied; if it still allows, enforcement is broken on Arcjet's side, not here).
//     }),
//   ],
// });
