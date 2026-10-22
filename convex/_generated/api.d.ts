/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as Interview from "../Interview.js";
import type * as InterviewModes from "../InterviewModes.js";
import type * as Languages from "../Languages.js";
import type * as PracticeCoach from "../PracticeCoach.js";
import type * as ResumeMatch from "../ResumeMatch.js";
import type * as Resumes from "../Resumes.js";
import type * as UserProfile from "../UserProfile.js";
import type * as UserSettings from "../UserSettings.js";
import type * as admin from "../admin.js";
import type * as rateLimit from "../rateLimit.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  Interview: typeof Interview;
  InterviewModes: typeof InterviewModes;
  Languages: typeof Languages;
  PracticeCoach: typeof PracticeCoach;
  ResumeMatch: typeof ResumeMatch;
  Resumes: typeof Resumes;
  UserProfile: typeof UserProfile;
  UserSettings: typeof UserSettings;
  admin: typeof admin;
  rateLimit: typeof rateLimit;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
