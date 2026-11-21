import { internalQuery, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";

// Reusable, deterministic skill-extraction utility (J4). Identifies which
// skills from a vocabulary of known skill names appear, as whole words, in
// a job description's free text. Built for the Himalayas adapter
// (convex/himalayasSync.ts) but written provider-agnostic, so a future
// Jobicy/Remotive adapter can import the same functions rather than a
// second implementation - see JOB_SEARCH_TECHNICAL_DESIGN.md section 9.
//
// No AI/LLM call of any kind - purely local, synchronous string matching.
// It mirrors the whole-word-boundary technique convex/jobMatching.ts's
// scoreSkills() already uses for skills named only in certifications/
// project text, duplicated locally (not imported) since jobMatching.ts is
// explicitly not to be modified in this milestone - this file stays
// independently reviewable and that engine stays untouched.

// A small, optional baseline so extraction isn't limited to whatever skills
// users have already typed into their own profiles - important before any
// profile mentions a given term at all (e.g. the very first synced job
// should still be able to recognize "TypeScript"). Deliberately short and
// generic; extend sparingly rather than letting this list sprawl.
export const CURATED_SKILLS: readonly string[] = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin",
  "React", "React.js", "Next.js", "Vue.js", "Angular", "Node.js", "Express.js", "Django", "Flask", "Ruby on Rails",
  "HTML", "CSS", "Tailwind CSS", "GraphQL", "REST API",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Git",
  "Figma", "Salesforce", "HubSpot", "Excel", "Tableau", "Power BI",
  "Project Management", "Agile", "Scrum", "Product Management",
  "Machine Learning", "Data Analysis", "SEO",
];

// Vocabulary-scan safety cap (Phase 6: handle input safely without
// unnecessary complexity). Generous for a few hundred distinct profile
// skills plus the curated list above - a deployment actually approaching
// this would be a reasonable trigger to revisit, not something to design
// around speculatively now.
const MAX_VOCABULARY_SIZE = 500;

export const skillVocabularyEntryValidator = v.object({
  display: v.string(), // original casing/format, used for output
  norm: v.string(),
});
export type SkillVocabularyEntry = Infer<typeof skillVocabularyEntryValidator>;

// Mirrors convex/jobMatching.ts's normalizeSkill() exactly, so a skill
// recognized here normalizes the same way it's later compared there.
function normalizeSkillTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9+#. ]/g, "").trim();
}

// De-duplicates a raw list of skill strings (any casing/whitespace) into a
// vocabulary keyed by normalized form, keeping the first display form seen -
// e.g. a user-entered "react" doesn't produce a separate entry from
// "React" typed by someone else, or from the curated list's "React".
// Call this ONCE per run (see loadSkillVocabulary) - not per job.
export function buildSkillVocabulary(rawTerms: Iterable<string>): SkillVocabularyEntry[] {
  const seen = new Map<string, string>(); // norm -> display
  for (const raw of rawTerms) {
    const display = raw.trim();
    if (!display) continue;
    const norm = normalizeSkillTerm(display);
    if (!norm || seen.has(norm)) continue;
    seen.set(norm, display);
    if (seen.size >= MAX_VOCABULARY_SIZE) break;
  }
  return Array.from(seen, ([norm, display]) => ({ norm, display }));
}

// Pure, deterministic, synchronous - no DB/network access, so any provider
// adapter can call it directly during normalization. Returns [] for a
// missing/empty description or empty vocabulary rather than throwing
// (Phase 6). `vocabulary` should already be the output of
// buildSkillVocabulary/loadSkillVocabulary - normalization happens once per
// run, not once per job, to avoid repeating that work for every listing.
export function extractSkillsFromDescription(
  description: string | undefined,
  vocabulary: readonly SkillVocabularyEntry[]
): string[] {
  const text = (description ?? "").trim();
  if (!text || vocabulary.length === 0) return [];

  // Padded the same way jobMatching.ts's scoreSkills() pads its own
  // candidate text, so a boundary match at the very start/end still works.
  const padded = ` ${text.toLowerCase()} `;

  const found: string[] = [];
  for (const { norm, display } of vocabulary) {
    if (!norm) continue;
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Same whole-word boundary technique as jobMatching.ts's scoreSkills():
    // requires a non-alphanumeric character on both sides, so a vocabulary
    // entry like "Java" never matches inside "JavaScript".
    const pattern = new RegExp(`[^a-z0-9]${escaped}[^a-z0-9]`);
    if (pattern.test(padded)) found.push(display);
  }
  return found;
}

// Merges a provider's own structured skill list (if it reliably has one)
// with locally-extracted skills, de-duplicating case-insensitively and
// keeping the structured entry's display form when both name the same
// skill. Himalayas has no structured skill list (see
// JOB_SEARCH_IMPLEMENTATION_PROGRESS.md), so its adapter passes [] for
// `structured` - this exists so a future provider with one doesn't need a
// second merge/dedupe implementation.
export function combineSkills(structured: readonly string[], extracted: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const skill of [...structured, ...extracted]) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    const norm = normalizeSkillTerm(trimmed);
    if (!norm || seen.has(norm)) continue;
    seen.set(norm, trimmed);
  }
  return Array.from(seen.values());
}

// Reads every distinct skill already typed into any user's Professional
// Profile, plus the small curated baseline above. There is no Convex
// "distinct" aggregate query, so this does read every UserProfileTable row
// once per call - callers are expected to call it ONCE per sync/backfill
// run and reuse the result for every job in that run, not call it per job
// or per page (Phase 6: avoid unnecessary repeated database scans).
export async function loadSkillVocabulary(ctx: QueryCtx | MutationCtx): Promise<SkillVocabularyEntry[]> {
  const profiles = await ctx.db.query("UserProfileTable").collect();
  const profileSkills = profiles.flatMap((p) => p.skills ?? []);
  return buildSkillVocabulary([...profileSkills, ...CURATED_SKILLS]);
}

// Thin query wrapper so an action (which has no ctx.db of its own) can load
// the vocabulary via ctx.runQuery once at the start of a sync/backfill run.
// Not exposed to the browser.
export const GetSkillVocabulary = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await loadSkillVocabulary(ctx);
  },
});
