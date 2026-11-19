import type { Doc } from "./_generated/dataModel";

// Profile-to-job matching (M7). Deterministic, rule-based scoring with no AI
// and no external API, so every score can be explained to the user and kept
// up to date without cost.
//
// Score = weighted average of the criteria that CAN be assessed for a
// particular job/profile pair. Criteria with missing data on either side are
// left out rather than counted as 0, because no profile field and no job
// field is mandatory.
//
//   criterion           weight  compares
//   title relevance       35    job title  vs  target role, headline, recent positions
//   skill overlap         35    required skills  vs  skills (+ certifications, project text)
//   experience            15    min/max years  vs  years of experience
//   location              10    remote / location  vs  profile location
//   education & certs      5    education requirement + required certs  vs  education, certifications
//   target company      +5 bonus  company  vs  onboarding target company
//
// A job only counts as a match when the title or the skills overlap
// (MIN_RELEVANCE) and the total reaches MATCH_THRESHOLD. Location or
// experience alone never makes a job relevant.

export const MATCH_THRESHOLD = 40;
const MIN_RELEVANCE = 0.25;

const WEIGHTS = { title: 35, skills: 35, experience: 15, location: 10, qualifications: 5 } as const;
type Criterion = keyof typeof WEIGHTS;

export interface MatchResult {
  score: number; // 0-100
  isMatch: boolean;
  reasons: string[]; // plain-language explanations, strongest first
  matchedSkills: string[];
  missingSkills: string[];
}

type Profile = Doc<"UserProfileTable">;
type Job = Doc<"jobs">;

// --- Text helpers -------------------------------------------------------------

// Seniority and filler words don't say what the job is.
const TITLE_STOPWORDS = new Set([
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "head", "chief", "associate",
  "assistant", "intern", "trainee", "i", "ii", "iii", "iv", "the", "a", "an", "of", "and", "&",
  "for", "to", "in", "at", "with", "-", "remote", "contract", "part", "time", "full",
]);

// Keeps "c++", "c#", ".net" and "node.js" as single tokens.
function tokens(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    // Drop sentence-ending dots ("Node.js." becomes "node.js"). A leading dot stays (".net").
    .map(t => t.replace(/\.+$/, ""))
    .filter(t => t.length > 0);
}

function titleTokens(text: string | undefined): Set<string> {
  return new Set(tokens(text).filter(t => !TITLE_STOPWORDS.has(t)));
}

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9+#. ]/g, "").trim();
}

// Share of the job title's meaningful words that appear in the candidate's title.
function titleSimilarity(jobTitle: string, candidate: string | undefined): number {
  if (!candidate) return 0;
  const job = titleTokens(jobTitle);
  const cand = titleTokens(candidate);
  if (job.size === 0 || cand.size === 0) return 0;
  const jt = jobTitle.toLowerCase();
  const ct = candidate.toLowerCase();
  if (jt.includes(ct) || ct.includes(jt)) return 1;
  let hit = 0;
  for (const t of job) if (cand.has(t)) hit++;
  return hit / job.size;
}

// --- Criteria -----------------------------------------------------------------

function scoreTitle(job: Job, p: Profile) {
  const candidates: { text?: string; label: string }[] = [
    { text: p.targetJobRole, label: "your target role" },
    { text: p.headline, label: "your headline" },
    ...(p.workExperience ?? []).slice(0, 3).map(w => ({ text: w.position, label: "your experience" })),
  ];
  let best = 0;
  let label = "";
  for (const c of candidates) {
    const s = titleSimilarity(job.title, c.text);
    if (s > best) {
      best = s;
      label = c.label;
    }
  }
  const assessable = candidates.some(c => c.text);
  return { assessable, value: best, reason: best >= 0.5 ? `Title matches ${label}` : null };
}

function scoreSkills(job: Job, p: Profile) {
  const required = job.requiredSkills.map(s => ({ raw: s, norm: normalizeSkill(s) })).filter(s => s.norm);
  const userSkills = new Set((p.skills ?? []).map(normalizeSkill));
  // Skills named only in certifications or projects count too, but only as
  // whole words in that text.
  const extraText = " " + [
    ...(p.certifications ?? []).map(c => c.name),
    ...(p.projects ?? []).map(pr => `${pr.title} ${pr.description ?? ""}`),
  ].join(" ").toLowerCase() + " ";
  const assessable = required.length > 0 && (userSkills.size > 0 || extraText.trim().length > 0);
  if (!assessable) return { assessable: false, value: 0, reason: null, matched: [] as string[], missing: [] as string[] };

  const matched: string[] = [];
  const missing: string[] = [];
  for (const s of required) {
    const escaped = s.norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inText = new RegExp(`[^a-z0-9]${escaped}[^a-z0-9]`).test(extraText);
    if (userSkills.has(s.norm) || inText) matched.push(s.raw);
    else missing.push(s.raw);
  }
  const value = matched.length / required.length;
  return {
    assessable,
    value,
    reason: matched.length > 0 ? `${matched.length} of ${required.length} required skills` : null,
    matched,
    missing,
  };
}

function scoreExperience(job: Job, p: Profile) {
  const years = p.yearsOfExperience;
  if (years === undefined || (job.minYearsExperience === undefined && job.maxYearsExperience === undefined)) {
    return { assessable: false, value: 0, reason: null };
  }
  const min = job.minYearsExperience ?? 0;
  const max = job.maxYearsExperience;
  let value: number;
  if (years >= min && (max === undefined || years <= max + 2)) value = 1;
  else if (years < min) value = years >= min - 1 ? 0.6 : years >= min - 2 ? 0.3 : 0;
  else value = 0.6; // well above the range: possibly overqualified
  const range = max !== undefined ? `${min}–${max}` : `${min}+`;
  return { assessable: true, value, reason: value >= 1 ? `Your experience fits (${range} yrs)` : null };
}

function scoreLocation(job: Job, p: Profile) {
  if (job.workMode === "remote") return { assessable: true, value: 1, reason: "Remote" };
  if (!job.location || !p.location) return { assessable: false, value: 0, reason: null };
  const jl = new Set(tokens(job.location));
  const pl = tokens(p.location);
  const overlap = pl.some(t => t.length > 1 && jl.has(t));
  return { assessable: true, value: overlap ? 1 : job.workMode === "hybrid" ? 0.2 : 0, reason: overlap ? `Near ${p.location}` : null };
}

const DEGREE_LEVELS: [RegExp, number][] = [
  [/\b(phd|ph\.d|doctor)/, 4],
  [/\b(master|msc|m\.sc|mba|ms\b|m\.s\b)/, 3],
  [/\b(bachelor|bsc|b\.sc|ba\b|bs\b|b\.s\b|bba|b\.tech|btech|undergraduate)/, 2],
  [/\b(diploma|associate|certificate)/, 1],
];
function degreeLevel(text: string | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  for (const [re, level] of DEGREE_LEVELS) if (re.test(t)) return level;
  return 0;
}

function scoreQualifications(job: Job, p: Profile) {
  const parts: number[] = [];
  const reasons: string[] = [];
  const requiredLevel = degreeLevel(job.educationRequirement);
  if (requiredLevel > 0 && (p.education?.length ?? 0) > 0) {
    const userLevel = Math.max(0, ...(p.education ?? []).map(e => degreeLevel(e.degree)));
    if (userLevel > 0) {
      parts.push(userLevel >= requiredLevel ? 1 : 0.4);
      if (userLevel >= requiredLevel) reasons.push("Meets the education requirement");
    }
  }
  const certs = job.requiredCertifications ?? [];
  if (certs.length > 0 && (p.certifications?.length ?? 0) > 0) {
    const userCerts = (p.certifications ?? []).map(c => c.name.toLowerCase());
    const hits = certs.filter(c => userCerts.some(u => u.includes(c.toLowerCase()) || c.toLowerCase().includes(u)));
    parts.push(hits.length / certs.length);
    if (hits.length > 0) reasons.push(`Has ${hits.length === 1 ? hits[0] : `${hits.length} required certifications`}`);
  }
  if (parts.length === 0) return { assessable: false, value: 0, reason: null };
  return { assessable: true, value: parts.reduce((a, b) => a + b, 0) / parts.length, reason: reasons[0] ?? null };
}

// --- Public -------------------------------------------------------------------

export function matchJob(job: Job, profile: Profile): MatchResult {
  const results: Record<Criterion, { assessable: boolean; value: number; reason: string | null }> = {
    title: scoreTitle(job, profile),
    skills: scoreSkills(job, profile),
    experience: scoreExperience(job, profile),
    location: scoreLocation(job, profile),
    qualifications: scoreQualifications(job, profile),
  };
  const skills = results.skills as ReturnType<typeof scoreSkills>;

  let weighted = 0;
  let totalWeight = 0;
  for (const key of Object.keys(WEIGHTS) as Criterion[]) {
    if (!results[key].assessable) continue;
    weighted += results[key].value * WEIGHTS[key];
    totalWeight += WEIGHTS[key];
  }
  let score = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;

  const reasons = (Object.keys(WEIGHTS) as Criterion[])
    .filter(k => results[k].assessable && results[k].reason)
    .sort((a, b) => results[b].value * WEIGHTS[b] - results[a].value * WEIGHTS[a])
    .map(k => results[k].reason as string);

  if (profile.targetCompany && job.company.toLowerCase().includes(profile.targetCompany.toLowerCase())) {
    score += 5;
    reasons.unshift("Your target company");
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const relevant =
    (results.title.assessable && results.title.value >= MIN_RELEVANCE) ||
    (skills.assessable && skills.value >= MIN_RELEVANCE);

  return {
    score,
    isMatch: relevant && score >= MATCH_THRESHOLD,
    reasons: reasons.slice(0, 3),
    matchedSkills: skills.matched,
    missingSkills: skills.missing,
  };
}
