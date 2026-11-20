# AI Profile Setup: Implementation Progress

## Status

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Backend foundation: schema, Convex queries/mutations, Clerk-authenticated API routes | ✅ Done (not tested, per instructions) |
| **M2** | Five-step onboarding wizard (`/onboarding`) + dashboard redirect | ✅ Done (not tested, per instructions) |
| **M3** | Professional Profile form (`/profile`) + resume import (PDF/DOCX → fields) | ✅ Done (not tested, per instructions) |
| **M4** | Profile view page (`/profile`), edit workflow (`/profile/edit`), Settings + sidebar entry points | ✅ Done (not tested, per instructions) |
| **M5** | Signup and existing-user onboarding integration (optional set-up, welcome screen, dashboard prompt) | ✅ Done (not tested, per instructions) |
| **M6** | Dashboard profile completion invitation | ✅ Done (not tested, per instructions) |
| **M7** | Jobs module (admin-managed) + profile-based job recommendations ("Jobs for you") | ✅ Done (not tested, per instructions) |
| **M8** | Interview date picker; Study Planner pre-fill + interview-driven schedule distribution; Jobs application deadlines | ✅ Done (not tested, per instructions) |
| Next (unscheduled) | Pre-fill Create Interview from the profile; Settings > Profile alignment; optional external job feed | ⏳ Not started |

**Last work done:** M8 complete.

---

## M7: Personalized job recommendations

### Data source decision
The spec assumed an existing Jobs module. **None existed**: no jobs table, no Jobs page, no job API. The only "job" data in the app is the job descriptions users paste into Resume Match, which are their own inputs, not listings. After this was raised, the product owner chose **admin-managed jobs**. So M7 adds a small Jobs module with no external or paid API: every listing is entered by an admin, so nothing is invented.

### Jobs module
- **Table `jobs`** (`convex/schema.ts`):
  - **Basics:** title, company, location, workMode (`onsite`/`remote`/`hybrid`), employmentType.
  - **Salary:** salaryMin/Max/Currency/Period.
  - **Requirements:** description, requiredSkills[], min/maxYearsExperience, educationRequirement, requiredCertifications[].
  - **Listing:** source, applyUrl, active, postedAt, updatedAt.
  - **Index:** `by_active_posted`.
- **Admin:** a new **Admin > Jobs** page (`/admin/jobs`, nav item added to `AdminShell`) to add, edit, hide or delete jobs, modelled on Admin > Subscription.
  - Writes go through `/api/admin/jobs` (admin cookie session), and Convex re-checks the token with `requireSession`. That function was exported from `convex/admin.ts` with no behaviour change.
  - Validation in `convex/Jobs.ts`: required title, company and http(s) apply link; length limits; salary and experience ranges (max ≥ min); 3-letter currency; de-duplicated skills and certifications.
- **Users:** a new **`/jobs`** page (sidebar item **Jobs**, the target of "See all") lists active jobs with search. With a complete profile, jobs are sorted by match and there's a "Strong matches only" filter.
- **Job card** (`JobCard.tsx`): title, company, location/work mode, salary, employment type, source ("via …", falling back to the apply link's host name), and an **Apply** link (new tab, `rel="noopener noreferrer"`). Required skills are highlighted when they're already in the user's profile.

### Matching approach (`convex/jobMatching.ts`)
Deterministic and rule-based, with no AI, so it's transparent, free and easy to adjust. Each criterion produces a 0–1 value. The score is the **weighted average of only the criteria that can be assessed** for that pair, because no profile or job field is mandatory.

| Criterion | Weight | Compares |
|---|---|---|
| Title relevance | 35 | job title vs target role (onboarding), headline, 3 most recent positions. Word overlap ignoring seniority and filler words; a full containment scores 1 |
| Skill overlap | 35 | required skills vs profile skills, plus whole-word mentions in certifications and project text. Score = share of required skills matched |
| Experience | 15 | min/max years vs onboarding `yearsOfExperience`. In range = 1; 1–2 years short = partial; far above the max = 0.6 |
| Location | 10 | remote = 1; otherwise word overlap between job and profile location (hybrid with no overlap = 0.2) |
| Education & certifications | 5 | degree level (diploma < bachelor < master < PhD) vs education degrees; required certs vs profile certifications |
| Target company | +5 bonus | job company vs onboarding target company |

- **Relevance gate:** a job is a **match** only if title or skill overlap is ≥ 25% **and** the score is ≥ `MATCH_THRESHOLD` (40). Location or experience alone never makes a job relevant.
- **Explanations:** each match returns up to 3 plain-language reasons ("Title matches your target role", "4 of 6 required skills", "Remote") plus the matched and missing skills, which the UI shows.
- **Attributes used:** target role, headline, skills, years of experience, work experience, education, certifications, projects, location and target company. The summary isn't used directly; the structured fields carry the same information more reliably. This is noted as a possible future refinement.

### Dashboard "Jobs for you" (`app/(routes)/dashboard/JobsForYou.tsx`)
Placed below the interview list and above the Resume Match history. Nothing else on the dashboard changed.

| State | Shown |
|---|---|
| Profile complete, matches found | **"Jobs for you"**: up to 3 matches with % score and reasons, plus **See all** → `/jobs` |
| Profile complete, no matches | "No strong matches right now", with links to add skills or browse all openings |
| Profile incomplete | The **M6 invitation** above it, and this section titled **"Latest jobs"** with the 3 newest openings, **no scores** and no personalization claim |
| No jobs posted | "No job openings have been posted yet. Check back soon." |

### Performance
- `GetJobsForUser` is a Convex **query**, so results are cached and pushed reactively. Matching re-runs only when the `jobs` table or the user's profile row changes, never on a plain dashboard re-render. This also means recommendations update automatically right after the user saves their profile.
- It scans at most the **300 newest active jobs** through the `by_active_posted` index. Scoring is simple string and set work, so cost grows linearly and is small at that size.

### Files (M7)
- **Added:**
  - `convex/Jobs.ts`, `convex/jobMatching.ts`
  - `app/(routes)/jobs/page.tsx`, `app/(routes)/jobs/_components/JobCard.tsx`
  - `app/(routes)/dashboard/JobsForYou.tsx`
  - `app/admin/(protected)/jobs/{page,JobsManager}.tsx`, `app/api/admin/jobs/route.ts`
  - `utils/jobs/format.ts`
- **Modified:**
  - `convex/schema.ts`: `jobs` table
  - `convex/admin.ts`: `export` on `requireSession` only
  - `app/admin/_components/AdminShell.tsx`: Jobs nav item
  - `app/(routes)/_components/Sidebar.tsx`: Jobs nav item
  - `app/(routes)/dashboard/page.tsx`: `<JobsForYou />`
- **Not touched:** Mock Interview, Study Room, Clerk authentication, billing/subscriptions, Resume Match.

### Remaining limitations
- **Content:** listings exist only once admins add them, so until then users see the "no openings yet" states.
- **Ranking:** matching is keyword-based. Synonyms such as "JS" vs "JavaScript" or "SWE" vs "Software Engineer" aren't linked, so admins should use common skill names. A synonym map or an optional AI re-ranker (needs authorization) could be added later.
- **Location:** matching is word-level (city/country words). There's no geocoding or distance.
- **Scale:** only the 300 newest active jobs are considered per user. Beyond that, precomputing matches would be needed.
- **Expiry:** there's no application tracking or expiry date on listings. Admins hide or delete jobs manually.

---

## M6: Dashboard profile completion invitation

### Approach: one invitation, not two
M5 already put a set-up card on the dashboard. Adding M6 as a second card would have shown two invitations, so `app/(routes)/dashboard/ProfileSetupPrompt.tsx` was **turned into** the M6 invitation. The dashboard page itself is unchanged since M5, with the same single `<ProfileSetupPrompt />` placed under the welcome header and above the interview list.

### Content
- **Heading:** "Get personalized job recommendations"
- **Message:** "Complete your professional profile to discover job opportunities that match your skills, experience, qualifications and career interests."
- **Primary:** **Set Up My Profile** → `/profile/edit` (the existing M3/M4 form, pre-filled with any saved data).
- **Secondary:** **Maybe Later**, a temporary dismissal.
- **Progress:** a bar ("40% complete") appears once the profile has been started.
- **Wizard shortcut:** a small "Or start with 5 quick questions" / "Or continue the quick setup questions" link to the M2 wizard, shown only while onboarding isn't complete. This keeps the M5 behaviour inside the same card.
- **Layout:** theme tokens only (primary gradient, existing `Button`). Stacked on mobile, in a row from `md`. It doesn't block anything below it.

### Behaviour and dismissal policy
| State (all from Convex `GetOnboardingStatus`) | Shown |
|---|---|
| Professional profile complete | **Nothing.** The invitation disappears automatically once the profile is completed, because the query is reactive |
| Dismissed within the last **7 days** | A one-line link: "Complete your profile for personalized job recommendations →" |
| Otherwise (never dismissed, or 7+ days since the last dismissal) | The full invitation card |

- **Maybe Later** calls `DismissProfilePrompt`, which now **always** updates `profilePromptDismissedAt` to the current time, so each dismissal starts a new 7-day snooze. "Skip for Now" on `/welcome` uses the same mechanism.
- Dismissal never changes `profileCompleted`, the completion value or `onboardingStatus`.
- **Data source:** completion comes from Convex: `isProfileComplete` and `profileCompletionPercent` are computed server-side from profile data. Dismissal is stored server-side too. The only browser input is the current time, used to check whether the 7-day snooze has passed (a Convex query result doesn't refresh as time passes).

### Backend changes (additive)
- `DismissProfilePrompt` now refreshes the timestamp on every call. Previously it was set only once, which made dismissal permanent.
- `GetOnboardingStatus` also returns `profileCompletionPercent` and `profilePromptDismissedAt`. `profilePromptDismissed` is still returned for compatibility.

### Note
- At M6 time the app had **no Jobs module**, so the "job recommendations" copy promised a feature that didn't exist yet. **M7 added it** (admin-managed jobs + "Jobs for you"), so the copy is now accurate.

### Files (M6)
- **Modified:** `app/(routes)/dashboard/ProfileSetupPrompt.tsx` (rewritten as the M6 invitation), `convex/ProfessionalProfile.ts` (`DismissProfilePrompt`, `GetOnboardingStatus`)
- **Not touched:** dashboard layout and other dashboard features, Mock Interview, Study Room, subscriptions.

---

## M5: Signup and existing-user integration

The M2 wizard and M3/M4 profile pages are reused as they are. M5 adds entry points and state handling only.

### New user signup
- **The one Clerk integration point** is `signUpForceRedirectUrl="/welcome"` on `<ClerkProvider>` in `app/layout.tsx`. It only applies after a **new account** is created, which covers:
  - the `/sign-up` page
  - the landing-page `SignUpButton` modals
  - a first-time social sign-in that creates an account

  Sign-in redirects, verification, `proxy.ts` and the sign-in/sign-up pages are unchanged. Using the provider instead of page props was needed so the landing-page modals are covered too.
- **`/welcome`** (`app/welcome/page.tsx`, full-screen, Clerk-protected by `proxy.ts`):
  - **Continue to Profile Setup** opens the M2 wizard at `/onboarding`. The label is "Continue Profile Setup" if progress exists.
  - **Skip for Now** calls `DismissProfilePrompt` and then goes to `/dashboard`. If saving the skip fails, the user is sent to the dashboard anyway.
  - A user whose onboarding or profile is already complete is redirected straight to `/dashboard`.
- **Leaving the wizard:** `/onboarding` has a **Skip for now** link in its header that goes to `/dashboard`. Progress is already saved step by step, so nothing is lost.

### Existing users (no forced redirects anymore)
The M2 `OnboardingRedirect` was **removed**. `app/(routes)/dashboard/ProfileSetupPrompt.tsx` shows an optional card instead:

| State (from `GetOnboardingStatus`) | Dashboard shows |
|---|---|
| Professional profile complete | **Nothing.** No signup or onboarding prompts again |
| Onboarding completed, profile incomplete | "Complete your professional profile" → `/profile/edit`. The wizard is **not** repeated, and onboarding answers are untouched |
| Onboarding in progress | "Finish setting up your profile" → `/onboarding`, which resumes at the saved step |
| No onboarding data | "Set up your profile" → `/onboarding` |

- **Dismissing the card** (the ✕ button, or Skip for Now on `/welcome`) turns it into a one-line link, so set-up stays reachable from the dashboard. Dismissal is stored per user (`profilePromptDismissedAt`), so it survives refreshes, sign-out and other devices. *(M6 replaced this card with the profile completion invitation. Dismissal is now a 7-day snooze; see M6.)*
- **Other ways in:** Settings > Profile → Profile Setup card (M4), and the My Profile sidebar item, which shows the M4 empty state with Set Up Profile.

### Completion state
There are three independent values, and none implies another:
- `onboardingStatus`: `not_started` / `in_progress` / `completed`. Only the wizard's Finish (or Skip on its last step) sets `completed`.
- `profileCompleted`, plus the live `completion` value: computed only from professional-profile data (M1 rules).
- `profilePromptDismissedAt`: "postponed set-up". It's **not** an onboarding status and **not** completion. Skipping never completes anything.

### Redirect loops
- `/welcome` → `/dashboard` only when onboarding or the profile is complete.
- `/onboarding` → `/dashboard` only when onboarding was already completed at first load.
- `/dashboard`, `/profile` and `/profile/edit` **never redirect**.

No cycle is possible.

### Session and authentication
- **Clerk identity:** every record is keyed to the `UserTable` row created from the signed-in Clerk user (`app/Provider.tsx`), and server routes resolve it with `currentUser()`.
- **Refreshes:** all onboarding and profile state lives in Convex, so a refresh resumes at the same place (`onboardingStep`, saved answers, dismissal).
- **Sign-out, then sign-in:** `app/Provider.tsx` now clears the cached Convex user when Clerk reports a sign-out (`user === null`). Before this, a different user signing in on the same tab without a reload could briefly have per-user queries run with the previous user's id. This is a small fix and changes nothing else.
- **Ownership:** every Convex function only reads or writes the caller's own row, and no profile-document ids are accepted.
- **Known limitation, unchanged since M1:** Convex isn't set up to verify Clerk JWTs, so Convex functions trust the `userId` the client sends, as they do across the whole app. `resolveCaller` already enforces a verified identity's email if `convex/auth.config.ts` + `ConvexProviderWithClerk` are added later.

### Backend changes (additive)
- `UserProfileTable.profilePromptDismissedAt` (optional number).
- `ProfessionalProfile.DismissProfilePrompt({userId})`: sets it once and creates the row if it's missing (still one per user). It changes nothing else.
- `GetOnboardingStatus` now also returns `profilePromptDismissed`.

### Files (M5)
- **Added:** `app/welcome/page.tsx`, `app/(routes)/dashboard/ProfileSetupPrompt.tsx`
- **Removed:** `app/(routes)/dashboard/OnboardingRedirect.tsx` (M2 forced redirect)
- **Modified:**
  - `app/layout.tsx`: one `signUpForceRedirectUrl` prop
  - `app/Provider.tsx`: clear `userDetail` on sign-out
  - `app/(routes)/dashboard/page.tsx`: swapped the redirect for `<ProfileSetupPrompt />`
  - `app/onboarding/page.tsx`: "Skip for now" header link
  - `convex/schema.ts`, `convex/ProfessionalProfile.ts`
- **Not touched:** the Clerk sign-in/sign-up pages and verification, `proxy.ts`, Mock Interview, Study Room, billing.

---

## M4: Profile viewing and editing

### Routes
| Route | Purpose |
|---|---|
| `/profile` | **Read-only view** (`app/(routes)/profile/page.tsx`) |
| `/profile/edit` | The **M3 form** (moved from `/profile` to `app/(routes)/profile/edit/page.tsx`), used for both first-time set-up and editing |

### View page
- **Header:** avatar, full name (Clerk), headline, then a contact row (email from Clerk, location, phone) and LinkedIn/GitHub/Website link chips (open in a new tab with `rel="noopener noreferrer"`; URLs were already validated as http(s) by the backend). An **Edit** button links to `/profile/edit`.
- **Sections:** Summary, Work Experience (timeline with responsibilities as bullets), Education, Skills (chips), Certifications (name, issuer, year, credential link), Projects (cards with optional link), and the linked Resume (with a link to Manage Resume).
- **Empty handling:**
  - Each section is hidden when it has no data.
  - A user with no professional details sees a **"Set up your professional profile"** empty state with **Set Up Profile**.
  - An incomplete profile shows a progress bar ("Profile 60% complete. Add …") with **Complete profile**.
- **What counts as having a profile:** `hasProfessionalData()` in `_lib/formState.ts`. The profile row existing isn't enough, because onboarding (M2) can create the row without any professional data.

### Editing
- Edit opens `/profile/edit`, which loads **every** saved section from `GetMyProfile`. Entries can be added, edited and deleted. Saving goes through `ProfessionalProfile.UpdateProfile` and then **navigates back to `/profile`**.
- **Cancel** returns to `/profile`, and asks for confirmation if there are unsaved edits. A "Back to profile" link sits above the card.
- The page header's own **Edit** on `/profile/edit` still edits the Clerk name inline (M3 behaviour).
- Certification chips now show **"Name, Issuer, Year"**, as in `profile_view_03.png`.

### Data integrity
- **Onboarding information:** never sent. `UpdateProfile` only writes professional fields.
- **Resume reference:** only sent when it actually changed (link or explicit unlink), so a normal edit never clears or rewrites it.
- **Unrelated fields kept:**
  - **Work dates:** work-experience `startDate`/`endDate`/`isCurrent`/`duration` are now carried through the form (`WorkRow.original`) and sent back unchanged unless the duration text was edited. This fixes an M3 gap where those dates would have been lost on save.
  - **Certifications and projects:** issuer, year, credential URL and project URLs are kept.
  - **Settings-only fields:** `experienceLevel` (Settings > Profile) is never sent, so it's untouched.
- **No duplicate records:** `UpdateProfile` patches the user's single `by_user` row, or creates it only when missing.

### Settings integration
- A **Profile Setup** card (`app/(routes)/settings/ProfileSetupCard.tsx`) was added inside the existing **Settings > Profile** tab, below the photo row. It shows **Set Up Profile** when no professional details are saved, or **Edit Profile** plus the completion status. Both buttons go to `/profile/edit`, which loads any saved data.
- Nothing else in Settings changed: the same tabs, layout and existing profile form, with one import and one element added in `ProfileSettings.tsx`.

### Sidebar integration
- The only profile navigation item is the **"My Profile"** entry added in M3. It already points to `/profile`, which is now the view page, so no new item was added. It also stays highlighted on `/profile/edit`, because the active state uses `startsWith`.

### Not implemented from the references
- `profile_view_05.png` shows a **Logout** link at the bottom of the card. It wasn't requested in the M4 spec and touches authentication, so it was left out. Sign-out is still available from the existing Clerk user menu.

### Files (M4)
- **Added:** `app/(routes)/profile/page.tsx` (view), `app/(routes)/profile/edit/page.tsx` (form page, moved from `/profile`), `app/(routes)/settings/ProfileSetupCard.tsx`
- **Modified:**
  - `app/(routes)/profile/_lib/formState.ts`: `certLabel`, `hasProfessionalData`, work-date preservation
  - `app/(routes)/profile/_components/ProfileForm.tsx`: navigate to `/profile` after save, Cancel button, certification labels
  - `app/(routes)/settings/ProfileSettings.tsx`: renders `<ProfileSetupCard />` only
- **Not touched:** the Convex backend, onboarding, Mock Interview, Study Room, billing, authentication.

---

## M3: Professional Profile form + resume import

### Page
`/profile` (`app/(routes)/profile/page.tsx`) sits inside the normal app shell, and a **"My Profile"** link was added to the sidebar. The layout follows `prof_images/profile_setup_from_settings.png`: a header card, Professional Profile, the two import buttons, basic fields, the repeating sections, and Save Profile. It uses the app's own theme tokens and existing `Button`/`Input`/`Textarea`/`Dialog` components.

**Settings > Profile is untouched.** I placed the form on its own page instead of replacing that tab, to keep existing functionality unchanged. Both write the same `UserProfileTable` row (headline, location, phone, summary/`bio`, LinkedIn are shared), so they stay consistent.

### Sections
- **Header:** full name and email from Clerk (`useUser`). **Edit** switches to inline first/last-name fields saved through `user.update()`, and `app/Provider.tsx` copies the change into `UserTable`. Email is shown read-only, because changing it needs Clerk verification (Settings > Account).
- **Basic info:** headline, location, phone, summary (stored as `bio`), LinkedIn, GitHub, Website.
- **Work experience:** position, company, employment duration (free text, stored in `duration`), responsibilities (one per line, stored as an array). **Add role** and a delete button on each row. Older rows that only have start/end dates show them as the duration text, and saving keeps them as `duration`.
- **Education:** institution, degree, field of study, graduation year. **Add education** and delete.
- **Skills:** tag input. Enter or comma adds a skill, typed text is also added on blur, Backspace removes the last tag, and duplicates are ignored regardless of case.
- **Certifications:** tag input stored as `{name}` objects. Existing issuer/year/URL details on a certification are kept.
- **Projects:** title and description. **Add project** and delete. A stored project URL is kept.

### Resume import ("Upload resume to fill" / "Use existing resume")
- **Route:** `POST /api/profile/resume-import`. The user is resolved from the Clerk session, the file signature is checked (not just the extension), and files are capped at 10 MB.
  - **PDF upload:** saved through the existing `addResumeToLibrary` (ImageKit + SHA-256 duplicate detection), so there's no new storage, then the resume is linked to the profile.
  - **DOCX upload:** text is read with `utils/profile/docxText.ts` (a ZIP reader using Node's built-in `zlib`, no new dependency). DOCX files are **not** added to the resume library, because Create Interview, Practice Coach and Resume Match all expect PDF there.
  - **Existing resume:** a dialog lists `GET /api/resumes`. The chosen file is loaded through `getLibraryResume`, which checks ownership.
- **Extraction:** `utils/profile/resumeExtractor.ts` calls Gemini with a JSON response schema, using the same direct-Gemini pattern as `utils/studyPlanner` and `utils/questionBank`, with its own client (`GEMINI_API_KEY`; model override `GEMINI_PROFILE_IMPORT_MODEL`, default `gemini-2.5-flash`). PDFs are sent natively and DOCX as text. The prompt allows only facts present in the resume and treats the resume text as data, not instructions. Output is trimmed and checked against the same limits the M1 backend enforces.
  - **Why a new extractor:** the app had no reusable resume-to-fields parser. The n8n webhooks only return interview questions or job-match analyses, and changing them was out of scope. This doesn't add a second storage system.
- **Merge rules** (`mergeExtracted` in `app/(routes)/profile/_lib/formState.ts`). **Nothing is overwritten silently:**
  - An empty text field is filled.
  - A filled field with a different value becomes a **conflict card** ("Keep mine" / "Use resume value"), and the user's value is kept until they choose.
  - List sections only get new entries appended. Roles are matched by position + company, education by institution + degree, projects by title, and skills/certifications by name regardless of case. Existing rows are never edited.
  - The import result appears in an **"Imported from …"** panel. Nothing is saved until the user reviews and clicks **Save Profile**.

### Save
- Client validation matches the server rules: URLs, phone characters, required position/company/institution/project title for non-blank rows, graduation-year range, and length limits. Errors appear next to their fields, and focus moves to the first invalid one.
- Saving calls `ProfessionalProfile.UpdateProfile` for the authenticated user with every professional section. Blank rows are dropped, and the resume is sent only when its link changed.
- There's a loading spinner, success/error feedback, an in-flight guard, and the form and buttons are disabled while saving or importing. An "unsaved changes" hint and a `beforeunload` warning cover unsaved edits.
- After a successful save, the user **stays on the form** with a success message plus live completion status ("Profile 60% complete. Still missing: …"), because the view page is M4.
- Onboarding fields and status are never touched. `profileCompleted` is still computed on the server from profile data only.

### Files (M3)
- **Added:** `app/(routes)/profile/page.tsx`, `app/(routes)/profile/_lib/formState.ts`, `app/(routes)/profile/_components/{ProfileForm,ProfileHeader,TagInput,ExistingResumeDialog}.tsx`, `app/api/profile/resume-import/route.ts`, `utils/profile/{types,resumeExtractor,docxText}.ts`
- **Modified:** `app/(routes)/_components/Sidebar.tsx` (one "My Profile" menu entry only)
- **Not touched:** Mock Interview, Study Room, Settings, resume library/ImageKit utilities, the n8n integrations, and the Convex backend (no M1 changes were needed).

### Notes for M4
- ✅ Done in M4: after saving, the form navigates to `/profile`.

---

## M2: Onboarding wizard

### Flow (follows the reference screenshots `profile_setup_01`–`11`)
0. **Intent screen** (unnumbered, as in the screenshot): "How will you use AI Mock Interview?" with two cards. Clicking a card saves the intent and moves on.
1. **Role**: searchable title input with ranked, typo-tolerant autocomplete (`JobTitleCombobox`, about 140 local titles, arrow/Enter/Escape keys), six popular-role chips, and any custom title.
2. **Experience**: years (numeric input with +/− and ↑/↓ keys, 0–60) and an optional target company.
3. **Timeline + availability**: selectable cards (5 timeline options, 3 availability options with hints).
4. **Resume (optional)**: drag-and-drop or click to upload. It's uploaded through the existing library route `/api/resume-match/upload-resume` (ImageKit + duplicate detection) and linked with `UpdateProfile({resumeId})`. Remove only unlinks it from the profile, and the file stays in the library.
5. **Referral**: 12 single-choice options, then **Finish**.

After Finish, a full-screen "Personalizing AI Mock Interview for you!" loader is shown (at least 1.5 s), then the user is sent to `/dashboard` with `router.replace`.

### Decisions and deviations
- **Step order follows the screenshots, not the written step list.** The screenshots put intent on an unnumbered first screen and include an **"Add your resume (optional)"** step as numbered step 4. Timeline and availability share step 3. The written spec listed intent as step 1 and didn't mention the resume step. The indicator still has five steps.
- **Resume formats:** the screenshot says "PDF or DOCX", but the existing upload backend only accepts PDF, and changing it was out of scope. The UI says "PDF, up to 10 MB".
- **Hiring intent:** the intent is recorded, but no employer features or permissions exist or are enabled. Hiring users skip steps 1–4 (which are candidate-specific), see a "screening tools aren't available yet" note, and answer only the referral question. The progress indicator is hidden for them.
- **Theme:** the screenshots' blue is replaced by the app's own `--primary` (orange) tokens and existing `Button`/`Input` components. The brand name comes from the sidebar ("AI Mock Interview").
- **Referral icons:** lucide-react 1.x has no brand logos, so `ReferralIcon.tsx` draws simple brand-coloured marks rather than official logos.
- **Interview date:** "I have a date" is stored as a timeline choice only. No date picker is shown (none in the reference, and there's no schema field for it).

### Navigation behaviour
- **Next** is disabled until the step is valid: role must be non-empty, years must be 0–60, and both timeline and availability are needed. On the referral step, **Finish** needs a selection.
- **Back** keeps everything typed. All answers live in wizard state, including those on skipped steps. Back from step 1 returns to the intent screen.
- **Skip** (**Skip for now** on the resume step) moves on without saving that step's answers. Skip on step 5 finishes onboarding without a referral answer.
- **Saving:** every Next/Skip calls `SaveOnboarding` with that step's answers and the `currentStep` being moved to. The wizard only advances once the save succeeds.
- **Duplicate submissions:** a synchronous in-flight ref guard plus disabled buttons and spinners while saving or uploading.
- **Resume:** `/onboarding` reopens at the saved `onboardingStep`, with all saved answers and the linked resume pre-filled. A user who has already completed onboarding is redirected to `/dashboard`.
- **Profile completion:** finishing onboarding sets `onboardingStatus = completed` only. `profileCompleted` is still decided purely by profile data (M1 rules).

### Entry point
- ~~`app/(routes)/dashboard/OnboardingRedirect.tsx` forced users with unfinished onboarding to `/onboarding`.~~ **Replaced in M5:** onboarding is optional. See the M5 section for the welcome screen and dashboard prompt.

### Backend changes in M2 (additive)
- `UserProfileTable.onboardingStep` (optional number, 0–5) stores the screen to resume at.
- `SaveOnboarding` accepts `currentStep` (validated integer 0–5).
- `SaveOnboarding({markCompleted:true})` **no longer requires `targetJobRole`**, because the role step can be skipped. Only `userIntent` is required.
- `GetOnboardingStatus` also returns `onboardingStep`.

### Files (M2)
- **Added:** `app/onboarding/page.tsx`, `app/onboarding/constants.ts`, `app/onboarding/_components/{OnboardingWizard,StepIndicator,SelectCard,JobTitleCombobox,ReferralIcon}.tsx`, `app/(routes)/dashboard/OnboardingRedirect.tsx`
- **Modified:** `convex/schema.ts` (`onboardingStep`), `convex/ProfessionalProfile.ts` (`currentStep`, relaxed completion rule, status field), `app/(routes)/dashboard/page.tsx` (import + `<OnboardingRedirect />` only)

---

## 1. Existing architecture discovered

- **Auth model.** Clerk handles authentication, and `proxy.ts` requires a session for every non-public route. Convex has **no** Clerk JWT integration: there's no `convex/auth.config.ts`, and the app uses `ConvexProvider` rather than `ConvexProviderWithClerk`, so `ctx.auth.getUserIdentity()` is always null today.
  - Client side, `app/Provider.tsx` upserts the Clerk user into `UserTable` (`users.CreateNewUser`, matched by email) and exposes the row through `UserDetailContext`. Every Convex function takes `userId: v.id('UserTable')` and scopes its work to that id.
  - Server side, routes resolve the user with Clerk `currentUser()` and then `users.GetUserByEmail` (see `app/api/resumes/route.ts`), never from a client-supplied id.
- **Existing profile data.** `UserProfileTable` (Settings > Profile, `convex/UserProfile.ts`, used by `app/(routes)/settings/ProfileSettings.tsx`) is one row per user with `phone, headline, location, experienceLevel, linkedinUrl, bio, updatedAt`. It had no index; lookups used `.filter`.
- **Resume storage.** The shared library is `ResumeTable` (one row per distinct file, with ImageKit `fileUrl` + `imagekitFileId` and a SHA-256 `contentHash`) plus `UserResumeTable` (user-to-resume ownership mapping). Uploads go through `utils/resumeLibrary.ts#addResumeToLibrary` (ImageKit). Public queries deliberately leave out `fileUrl`; server routes resolve it with `Resumes.GetUserResume`, which checks ownership.
- **Jobs module.** None exists in the codebase. Job title/description are only free-text fields on interview sessions, Practice Coach and Resume Match rows, so there was nothing to reuse or link.

## 2. Schema changes (`convex/schema.ts`)

All changes are **additive and optional**, so existing rows stay valid.

- New exported validators: `PROFILE_USER_INTENT` (`interview_preparation | hiring`), `PROFILE_ONBOARDING_STATUS` (`not_started | in_progress | completed`), `profileWorkExperienceValidator`, `profileEducationValidator`, `profileCertificationValidator`, `profileProjectValidator`.
- **`UserProfileTable` extended in place** (no second profile table, so there's still only one data source):
  - Onboarding: `userIntent, targetJobRole, yearsOfExperience (number), targetCompany, interviewTimeline, weeklyAvailability, referralSource, onboardingStatus, onboardingCompletedAt`
  - Professional: `githubUrl, websiteUrl`. These existing fields are reused: `headline, location, phone, linkedinUrl`, and **`bio` = professional summary**.
  - Repeating sections: `workExperience[] {position, company, startDate?, endDate?, isCurrent?, duration?, responsibilities?[]}`, `education[] {institution, degree?, fieldOfStudy?, graduationYear?}`, `skills[]`, `certifications[] {name, issuer?, year?, credentialUrl?}`, `projects[] {title, description?, url?}`
  - Resume: `resumeId (id ResumeTable)`, `resumeLinkedAt`. ImageKit metadata is **not copied**. It's read from `ResumeTable` when needed.
  - System: `profileCompleted, profileCompletedAt, createdAt` (plus the existing `updatedAt`)
  - New index: `by_user` on `userId`

## 3. Queries and mutations (`convex/ProfessionalProfile.ts`)

| Function | Type | Purpose |
|---|---|---|
| `GetMyProfile({userId})` | query | Full profile, or `null`. Returns `professionalSummary` (from `bio`), the linked resume summary (ownership re-checked, no file URL), and a live `completion {isComplete, percent, missing[]}` |
| `GetOnboardingStatus({userId})` | query | `{hasProfile, status, isOnboardingComplete, onboardingCompletedAt, userIntent, isProfileComplete}`. Never null. |
| `CreateProfile({userId, ...fields})` | mutation | Idempotent. If a row exists, returns `{profileId, created:false}` and changes nothing. |
| `UpdateProfile({userId, ...partial})` | mutation | Partial update of professional fields. Creates the row if it's missing. Recalculates `profileCompleted`. |
| `SaveOnboarding({userId, ...partial, currentStep?, markCompleted?})` | mutation | Partial save, which sets status to `in_progress`. `markCompleted` requires `userIntent` (the `targetJobRole` requirement was removed in M2). A completed onboarding isn't reopened by later edits. |
| `UpdateProfileCompletionStatus({userId})` | mutation | Recalculates the stored flag from the data. The client can't set it directly. |

**Rules enforced**
- **One profile per user.** Lookups go through the `by_user` index, and creation is look-up-then-insert inside a serializable Convex transaction. If older duplicate rows exist, the oldest is used, matching `UserProfile.GetUserProfile`.
- **Ownership.** Every function only touches the row matching the caller's `userId`. No function accepts a profile document id. Linking a resume requires a `UserResumeTable` mapping for that user. If Convex auth is configured later, `resolveCaller` also rejects a verified identity whose email doesn't match the user row.
- **Partial-update semantics.** An omitted argument leaves the field unchanged. `""` or `[]` clears a text or list field. `null` clears `yearsOfExperience` or `resumeId`. Repeating arrays are replaced as a whole.
- **Validation.** Strings are trimmed and length-capped. URLs must be http(s) and get `https://` added if no scheme is given. Phone numbers are restricted to a character set. Years of experience must be 0–60. Year fields are checked against a range, and dates use `YYYY` or `YYYY-MM` with end ≥ start. Arrays have count caps. Blank array rows are dropped. Rows missing a required field are rejected. Skills are de-duplicated without regard to case.
- **Completeness.** A profile is complete when it has headline, summary, location, ≥1 skill, and ≥1 work experience **or** education entry. Onboarding answers never count toward this, so a partly onboarded user is not marked complete.
- `convex/UserProfile.ts` (Settings > Profile) is **unchanged** and still works on the same row. Its saves don't refresh `profileCompleted`, but `GetMyProfile.completion` is always live, and `UpdateProfileCompletionStatus` can refresh the stored flag.

## 4. Clerk-authenticated API routes

Optional server entry points for M2 and M3 that resolve the user from the Clerk session (`currentUser()` → `GetUserByEmail`). Any `userId` in the request body is ignored.
- `GET /api/profile` returns the profile. `POST /api/profile` creates it. `PATCH /api/profile` applies a partial update.
- `GET /api/profile/onboarding` returns the status. `POST /api/profile/onboarding` saves answers and accepts `markCompleted`.
- Helper: `utils/profileAuth.ts`.

The UI can also call the Convex functions directly with `userDetail._id`, the same way every other screen does.

## 5. Files modified / added

- **Modified:** `convex/schema.ts` (new validators, `UserProfileTable` fields + `by_user` index)
- **Added:** `convex/ProfessionalProfile.ts`, `utils/profileAuth.ts`, `app/api/profile/route.ts`, `app/api/profile/onboarding/route.ts`, this file
- `convex/_generated/api.d.ts` was regenerated by Convex codegen to include `ProfessionalProfile`.
- **Not touched:** Mock Interview, Study Room, Study Planner, interview generation, authentication (`proxy.ts`, Clerk/Convex providers), billing/subscriptions, `convex/UserProfile.ts`, `convex/Resumes.ts`.

## 6. Notes for the next milestones

- **M2:** ✅ Done (see the M2 section above).
- **M3:** ✅ Done (see the M3 section above).
- Consider switching Settings > Profile to `UpdateProfile` so it keeps `profileCompleted` current. That was deliberately left out of M1 to stay within scope.
- Hardening, if ever needed: add `convex/auth.config.ts` + `ConvexProviderWithClerk`. `resolveCaller` already handles a verified identity.

## 7. M8: Interview date + Study Planner/Jobs integration

M8 connects the onboarding timeline/availability answers to an actual calendar date, and wires that data into the
Study Planner and Jobs modules. See `STUDY_PLANNER_IMPLEMENTATION_PROGRESS.md`'s M8 section for the scheduling
engine details - this section covers the Profile Setup side and the cross-module wiring.

### Interview date picker
- New field `interviewDate` on `UserProfileTable` (`convex/schema.ts`), `"YYYY-MM-DD"`, same string convention as
  every other date field in the app (never parsed into a `Date` object - see M4's schedule work for why).
- Only meaningful alongside `interviewTimeline === "have_date"`: `convex/ProfessionalProfile.ts`'s
  `cleanInterviewDate` rejects it otherwise, and `buildOnboardingPatch` clears a stale date automatically when the
  timeline is switched away from `"have_date"`, even if the client forgets to send `interviewDate` itself.
- Past dates are rejected using the **candidate's own local date**, sent from the client as `clientToday` (new
  optional arg on `SaveOnboarding`/`CreateProfile`) via `utils/localDate.ts`'s `todayLocalDateString()` - the
  server can't know the browser's timezone, and the milestone specifically asked for local-timezone interpretation.
- `app/onboarding/_components/OnboardingWizard.tsx`: a native `<Input type="date">` appears under "When is your
  interview?" only when "I have a date" is selected (matches `issue/issue05.png`'s existing layout, no redesign).
  `canAdvance` for that step now also requires the date when that option is chosen.
- No new date-picker dependency - follows the same native-input convention already used in 8+ Study Planner files.

### Study Planner pre-fill (`app/(routes)/study-planner/create/CreateStudyPlanAITab.tsx`)
- Loads the profile once and pre-fills subject/level/date-range/hours-per-day/preferred-days from
  `targetJobRole`/`yearsOfExperience`/`interviewTimeline`+`interviewDate`/`weeklyAvailability` the first time the
  form mounts - gated by a ref so it never runs twice and never overwrites a field the candidate already edited.
- Mapping logic lives in `utils/studyPlanner/interviewTimeline.ts` (client) and is duplicated (not imported) into
  `convex/StudyPlanner.ts` for the actual distribution engine, so the Convex deployment has no import outside
  `convex/`. Keep the two in sync if the mapping ever changes:
  - `have_date` -> the stored `interviewDate`; `within_week` -> +7 days; `2_4_weeks` -> +21 days (midpoint);
    `1_3_months` -> +60 days (midpoint); `no_date` -> a 12-week **pacing estimate only**, never shown or stored as
    a real interview date (the milestone explicitly says not to invent one).
  - `about_2_hours`/`about_5_hours`/`10_plus_hours` map to weekly/daily-minute caps (120/60, 300/120, 600/180) used
    by the real distribution engine, plus a simple day-count/hours-per-day default for the one-shot AI form.

### Jobs application deadlines
- New optional `applicationDeadline` (`"YYYY-MM-DD"`) on the `jobs` table, admin-entered via `/admin/jobs`
  (`JobsManager.tsx`). Once past, `convex/Jobs.ts`'s `GetJobsForUser` excludes the listing from active results
  automatically - the admin's own `active` toggle is left untouched.
- Deadlines affect display and sort only (`utils/jobs/format.ts`'s `formatDeadline`/`daysUntilDeadline`, a
  "Closing soon first" sort on `/jobs`, a badge on `JobCard.tsx` shown on both the full and compact/dashboard
  cards) - never the match score, per "do not use interview preparation availability... to fabricate job matching
  scores."

### Files touched
- `convex/schema.ts`, `convex/ProfessionalProfile.ts` (interviewDate); `convex/Jobs.ts`,
  `app/api/admin/jobs/route.ts`, `app/admin/(protected)/jobs/JobsManager.tsx` (deadlines).
- `app/onboarding/_components/OnboardingWizard.tsx`; `app/(routes)/study-planner/create/CreateStudyPlanAITab.tsx`.
- `app/(routes)/jobs/page.tsx`, `app/(routes)/jobs/_components/JobCard.tsx`, `utils/jobs/format.ts`.
- New: `utils/localDate.ts`, `utils/studyPlanner/interviewTimeline.ts`.
- **Not touched:** Mock Interview, interview evaluation, the ElevenLabs agent, the AI Study Room voice agent,
  Study Room canonical session management, Whiteboard/Code Editor/Notes, Clerk auth, billing/subscriptions.

### Known limitations
- The "no interview date yet" pacing window (12 weeks) is an internal default for bounding AI generation only -
  it's never persisted to the profile or displayed as "your interview date."
- `clientToday` is trusted input (not re-derived from a verified source) - acceptable here since it only loosens
  or tightens a soft "not in the past" validation, not an authorization check.
- Not tested, per instructions - `npx convex dev`/`deploy` needs to run to push the schema changes and new/changed
  functions (`interviewDate`, `RedistributeSchedule`, `applicationDeadline`, etc.) before any of this works end to
  end.
