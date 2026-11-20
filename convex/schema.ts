import { defineSchema,defineTable } from "convex/server";
import { v } from "convex/values";

// Study Planner - learning resources attached to a studyPlanTasks row (see
// the field comment on studyPlanTasks.learningResources). Exported so
// convex/StudyPlanner.ts validates writes against exactly the same shape.
const RESOURCE_SEARCH_STATUS = v.union(v.literal('found'), v.literal('none_found'), v.literal('unavailable'));
export const taskLearningResourcesValidator = v.object({
  taskType: v.union(
    v.literal('video'),
    v.literal('reading'),
    v.literal('practice'),
    v.literal('quiz'),
    v.literal('project'),
    v.literal('revision')
  ),
  // The task title the resources were found for - lets the UI flag them as
  // possibly outdated after the task is renamed, without UpdateTask having
  // to know anything about resources.
  generatedForTitle: v.string(),
  generatedAt: v.number(),
  videoSearchStatus: RESOURCE_SEARCH_STATUS,
  readingSearchStatus: RESOURCE_SEARCH_STATUS,
  videos: v.array(
    v.object({
      videoId: v.string(),
      title: v.string(),
      channel: v.optional(v.string()),
      url: v.string(),
    })
  ),
  readings: v.array(
    v.object({
      title: v.string(),
      url: v.string(),
      source: v.string(),
    })
  ),
  guide: v.optional(
    v.object({
      overview: v.string(),
      steps: v.array(v.string()),
      examples: v.array(v.string()),
      expectedOutcomes: v.array(v.string()),
      deliverables: v.array(v.string()),
    })
  ),
  quiz: v.optional(
    v.array(
      v.object({
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
      })
    )
  ),
});

// Professional Profile (UserProfileTable). Exported so
// convex/ProfessionalProfile.ts validates writes against the same shapes.
export const PROFILE_USER_INTENT = v.union(v.literal('interview_preparation'), v.literal('hiring'));
export const PROFILE_ONBOARDING_STATUS = v.union(
  v.literal('not_started'),
  v.literal('in_progress'),
  v.literal('completed')
);
export const profileWorkExperienceValidator = v.object({
  position: v.string(),
  company: v.string(),
  // "YYYY-MM" (or "YYYY") strings. If isCurrent is true, endDate is left empty.
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  isCurrent: v.optional(v.boolean()),
  // Free-text duration, e.g. "2 yrs 3 mos", for when exact dates are unknown.
  duration: v.optional(v.string()),
  responsibilities: v.optional(v.array(v.string())),
});
export const profileEducationValidator = v.object({
  institution: v.string(),
  degree: v.optional(v.string()),
  fieldOfStudy: v.optional(v.string()),
  graduationYear: v.optional(v.number()),
});
export const profileCertificationValidator = v.object({
  name: v.string(),
  issuer: v.optional(v.string()),
  year: v.optional(v.number()),
  credentialUrl: v.optional(v.string()),
});
export const profileProjectValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
});

export default defineSchema({
    UserTable: defineTable({
      name: v.string(),
      imageUrl: v.string(),
      email: v.string(),
    }),
    InterviewSessionTable:defineTable({
      interviewQuestion: v.any(),
      resumeUrl: v.optional(v.string()),
      // Resume library entry the resumeUrl came from (convex/Resumes.ts).
      resumeId: v.optional(v.id('ResumeTable')),
      resumeFileName: v.optional(v.string()),
      jobTitle: v.optional(v.string()),
      jobDescription: v.optional(v.string()),
      mode: v.optional(v.string()),
      level: v.optional(v.string()),
      qno: v.optional(v.number()),
      // ISO 639-1 code (e.g. "bn") the candidate picked on the Language Settings
      // step - carried through to the live ElevenLabs conversation so the agent
      // speaks/listens in that language instead of always defaulting to English.
      lang: v.optional(v.string()),
      // Feedback Language picked on Create Interview - the language the
      // feedback report is generated in (see app/api/interview/end).
      feedbackLang: v.optional(v.string()),
      userId: v.id('UserTable'),
      status: v.string(),
      elevenlabsConversationId: v.optional(v.string()),
      transcript: v.optional(v.any()),
      feedback: v.optional(v.any())
    }),

    // --- Admin panel (see app/admin) -----------------------------------------
    // Single-row credential store for the admin panel login. The password is
    // never stored in plain text - the Next.js API routes hash it with PBKDF2
    // and only the salt + digest land here.
    AdminTable: defineTable({
      username: v.string(),
      passwordHash: v.string(),
      passwordSalt: v.string(),
      mustChangePassword: v.boolean(),
      updatedAt: v.number(),
    }),
    // Opaque session tokens minted on a successful admin login and stored in an
    // httpOnly cookie. Rows past expiresAt are treated as invalid.
    AdminSessionTable: defineTable({
      token: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
    }),
    // Key/value bag backing the admin Settings page.
    AdminSettingsTable: defineTable({
      key: v.string(),
      value: v.any(),
    }),
    // Subscription plans managed from the admin Subscription page.
    AdminPlanTable: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      price: v.number(),
      currency: v.string(),
      interval: v.string(),
      features: v.array(v.string()),
      active: v.boolean(),
      sortOrder: v.number(),
      updatedAt: v.number(),
    }),
    // Languages managed from admin Settings > Language. Codes are the ISO
    // 639-1 (or ElevenLabs-specific, e.g. "fil") language codes ElevenLabs uses.
    AdminLanguageTable: defineTable({
      code: v.string(),
      label: v.string(),
      flag: v.string(),
      // Interview opening greeting for languages without a built-in one in
      // utils/elevenlabsContext.ts - auto-translated with Gemini when the
      // language is added, editable by the admin. Uses {name}/{role} placeholders.
      greeting: v.optional(v.string()),
      // Used for {role} when the interview has no job title, e.g. "this position".
      roleFallback: v.optional(v.string()),
      createdAt: v.number(),
    }),
    // Interview Modes managed from admin Settings > Interview Preferences and
    // listed on Create Interview / Settings > Interview Preferences.
    InterviewModeTable: defineTable({
      value: v.string(),
      label: v.string(),
      sortOrder: v.number(),
      createdAt: v.number(),
    }),

    // Candidate-facing Settings page (app/(routes)/settings) - Language tab.
    // One row per user; upserted on save rather than appended.
    UserSettingsTable: defineTable({
      userId: v.id('UserTable'),
      interviewLanguage: v.optional(v.string()),
      feedbackLanguage: v.optional(v.string()),
      practiceCoachLanguage: v.optional(v.string()),
      // Settings > Interview Preferences - pre-selected on Create Interview.
      defaultInterviewMode: v.optional(v.string()),
      defaultInterviewLevel: v.optional(v.string()),
      defaultQuestionCount: v.optional(v.string()),
      updatedAt: v.number(),
    }),

    // Settings > Profile: professional details beyond the name/email/avatar
    // that Clerk owns. One row per user.
    UserProfileTable: defineTable({
      userId: v.id('UserTable'),
      phone: v.optional(v.string()),
      headline: v.optional(v.string()),
      location: v.optional(v.string()),
      experienceLevel: v.optional(v.string()),
      linkedinUrl: v.optional(v.string()),
      // Professional summary. Kept under its original name so Settings >
      // Profile and the Professional Profile feature share one field.
      bio: v.optional(v.string()),
      updatedAt: v.number(),

      // --- Professional Profile / Onboarding (convex/ProfessionalProfile.ts) -
      // Every field below is optional so rows created by Settings > Profile
      // before this feature existed stay valid.

      // Onboarding answers. Saved as the user goes, so any subset may be set.
      userIntent: v.optional(PROFILE_USER_INTENT),
      targetJobRole: v.optional(v.string()),
      yearsOfExperience: v.optional(v.number()),
      targetCompany: v.optional(v.string()),
      interviewTimeline: v.optional(v.string()),
      // Set only when interviewTimeline === "have_date". "YYYY-MM-DD", the
      // candidate's own local date - never parsed into a Date object, so
      // there's no timezone-shift risk (same convention as every other date
      // field in this schema).
      interviewDate: v.optional(v.string()),
      weeklyAvailability: v.optional(v.string()),
      referralSource: v.optional(v.string()),
      // Missing means not_started. Separate from profileCompleted, so finishing
      // onboarding never marks the professional profile itself as complete.
      onboardingStatus: v.optional(PROFILE_ONBOARDING_STATUS),
      onboardingCompletedAt: v.optional(v.number()),
      // Wizard screen to return to when an unfinished onboarding is resumed
      // (0 = intent screen, 1-5 = numbered steps). This is UI state only.
      onboardingStep: v.optional(v.number()),
      // When the user chose "Skip for now" on the post-signup welcome screen
      // or dismissed the dashboard set-up prompt (M5). It only controls how
      // prominent the prompt is. It's neither an onboarding status nor
      // profile completion.
      profilePromptDismissedAt: v.optional(v.number()),

      // Extra professional details. headline, location, phone, linkedinUrl and
      // bio (summary) above are reused.
      githubUrl: v.optional(v.string()),
      websiteUrl: v.optional(v.string()),

      // Repeating sections. Each one is replaced as a whole when updated.
      workExperience: v.optional(v.array(profileWorkExperienceValidator)),
      education: v.optional(v.array(profileEducationValidator)),
      skills: v.optional(v.array(v.string())),
      certifications: v.optional(v.array(profileCertificationValidator)),
      projects: v.optional(v.array(profileProjectValidator)),

      // Points to the shared resume library (ResumeTable + UserResumeTable)
      // instead of copying it. ImageKit metadata (fileUrl, imagekitFileId,
      // fileName, ...) is read from ResumeTable, which stays the only source.
      resumeId: v.optional(v.id('ResumeTable')),
      resumeLinkedAt: v.optional(v.number()),

      // System fields. createdAt is optional because older rows don't have it.
      profileCompleted: v.optional(v.boolean()),
      profileCompletedAt: v.optional(v.number()),
      createdAt: v.optional(v.number()),
    })
      .index('by_user', ['userId']),

    // Jobs module (M7): job openings posted by admins from /admin/jobs. There's
    // no external job API. Every listing is entered by an admin, so nothing is
    // invented. Users see active rows on /jobs and in the dashboard's
    // "Jobs for you" (convex/Jobs.ts, matching in convex/jobMatching.ts).
    jobs: defineTable({
      title: v.string(),
      company: v.string(),
      location: v.optional(v.string()),
      workMode: v.optional(v.union(v.literal('onsite'), v.literal('remote'), v.literal('hybrid'))),
      employmentType: v.optional(v.string()),
      salaryMin: v.optional(v.number()),
      salaryMax: v.optional(v.number()),
      salaryCurrency: v.optional(v.string()),
      salaryPeriod: v.optional(v.union(v.literal('hour'), v.literal('month'), v.literal('year'))),
      description: v.optional(v.string()),
      requiredSkills: v.array(v.string()),
      minYearsExperience: v.optional(v.number()),
      maxYearsExperience: v.optional(v.number()),
      // Free text, e.g. "Bachelor's in Computer Science".
      educationRequirement: v.optional(v.string()),
      requiredCertifications: v.optional(v.array(v.string())),
      // Where the listing comes from, e.g. "Company website" or "LinkedIn".
      source: v.optional(v.string()),
      // "YYYY-MM-DD". Once past, GetJobsForUser excludes the listing from
      // active results automatically - admins don't need to also flip `active`.
      applicationDeadline: v.optional(v.string()),
      applyUrl: v.string(),
      active: v.boolean(),
      postedAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_active_posted', ['active', 'postedAt']),

    // Practice Coach: one row per "Generate Video" call, recording what was sent
    // to the N8N webhook and the response it returned.
    PracticeCoachTable: defineTable({
      userId: v.id('UserTable'),
      resumeUrl: v.optional(v.string()),
      // Resume library entry the resumeUrl came from (convex/Resumes.ts).
      resumeId: v.optional(v.id('ResumeTable')),
      jobTitle: v.optional(v.string()),
      jobDescription: v.optional(v.string()),
      selectedQuestions: v.optional(v.array(v.string())),
      // Practice Coach language the script was generated in, e.g. "bn" - also
      // picks the narrated greeting's language when audio is (re)generated.
      lang: v.optional(v.string()),
      // Per-question narration start times (seconds into audioUrl), used to
      // show only the question currently being read during playback.
      questionTimeline: v.optional(
        v.array(v.object({ question: v.string(), startTime: v.number() }))
      ),
      webhookResponse: v.any(),
      audioUrl: v.optional(v.string()),
      createdAt: v.number(),
    }),

    // Resume library shared by Create Interview, Practice Coach and the Resume
    // Match Analyzer (see convex/Resumes.ts). One row per distinct file - a
    // re-upload of the same PDF (same contentHash) reuses the existing row
    // instead of creating a duplicate.
    ResumeTable: defineTable({
      // Legacy: rows created before UserResumeTable existed carried the owner
      // here. Ownership now lives only in UserResumeTable.
      userId: v.optional(v.id('UserTable')),
      // Original filename as uploaded by the candidate.
      fileName: v.string(),
      fileUrl: v.string(),
      fileType: v.string(),
      fileSize: v.optional(v.number()),
      // SHA-256 of the file bytes - how duplicates are detected.
      contentHash: v.optional(v.string()),
      imagekitFileId: v.optional(v.string()),
      uploadedAt: v.number(),
    }),

    // Which user owns which resume. A candidate only ever sees, and can only
    // use, resumes mapped to them here.
    UserResumeTable: defineTable({
      userId: v.id('UserTable'),
      resumeId: v.id('ResumeTable'),
      // Copied from ResumeTable so per-user duplicate checks are one index lookup.
      contentHash: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_user_hash', ['userId', 'contentHash'])
      .index('by_user_resume', ['userId', 'resumeId']),

    // Resume Match Analyzer: one row per analysis the candidate chose to save.
    // `analysis` is the normalized n8n response (utils/resumeMatchAnalysis.ts) -
    // the extracted resume text is never stored.
    ResumeMatchAnalysisTable: defineTable({
      userId: v.id('UserTable'),
      // Resume reference as listed by GetUserResumes, e.g. "resume:<id>".
      resumeId: v.string(),
      resumeUrl: v.string(),
      resumeFileName: v.optional(v.string()),
      jobTitle: v.string(),
      jobDescription: v.optional(v.string()),
      jobDescriptionUrl: v.optional(v.string()),
      lang: v.string(),
      analysis: v.any(),
      createdAt: v.number(),
    })
      .index('by_user', ['userId']),

    // --- AI Question Bank (app/(routes)/question-bank) -----------------------
    // Independent module: a "collection" is one Generate click (a Skill or Job
    // topic set), holding its questions; each question's detailed answer is
    // generated on demand (see convex/QuestionBank.ts) and cached here so
    // re-expanding a question never re-calls the LLM.
    questionBankCollections: defineTable({
      userId: v.id('UserTable'),
      title: v.string(),
      generationMode: v.union(v.literal('skill'), v.literal('job')),
      topics: v.array(v.string()),
      jobTitle: v.optional(v.string()),
      jobDescription: v.optional(v.string()),
      totalQuestions: v.number(),
      beginnerCount: v.number(),
      intermediateCount: v.number(),
      advancedCount: v.number(),
      language: v.string(),
      generationStatus: v.union(v.literal('ready'), v.literal('failed')),
      isShared: v.boolean(),
      shareToken: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_shareToken', ['shareToken']),

    questionBankQuestions: defineTable({
      collectionId: v.id('questionBankCollections'),
      question: v.string(),
      difficulty: v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced')),
      order: v.number(),
      answerStatus: v.union(v.literal('idle'), v.literal('generating'), v.literal('ready'), v.literal('error')),
      createdAt: v.number(),
    })
      .index('by_collection', ['collectionId'])
      .index('by_collection_order', ['collectionId', 'order']),

    questionBankAnswers: defineTable({
      questionId: v.id('questionBankQuestions'),
      collectionId: v.id('questionBankCollections'),
      // Rich-text answer as GFM markdown (rendered client-side with
      // react-markdown; raw HTML is never parsed, so this can't inject markup).
      structuredAnswer: v.string(),
      generatedAt: v.number(),
      modelMetadata: v.optional(v.any()),
    })
      .index('by_question', ['questionId'])
      .index('by_collection', ['collectionId']),

    questionBankGenerationLogs: defineTable({
      userId: v.id('UserTable'),
      collectionId: v.optional(v.id('questionBankCollections')),
      questionId: v.optional(v.id('questionBankQuestions')),
      kind: v.union(v.literal('questions'), v.literal('answer')),
      model: v.string(),
      usageMetadata: v.optional(v.any()),
      generationStatus: v.union(v.literal('success'), v.literal('failed')),
      error: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_collection', ['collectionId']),

    // --- Study Planner (app/(routes)/study-planner) --------------------------
    // Independent module - does not depend on Interview, Question Bank or any
    // future AI Study Room feature. M1 shipped this schema plus read-only
    // dashboard queries; M2 adds AI/manual creation (convex/StudyPlanner.ts
    // CreateStudyPlan) and the fields below it needs. Editing mutations for
    // an existing plan still land in M3.
    // One row per plan a candidate is working through (e.g. "Learn Python in
    // 30 Days"). `progress`/`totalTasks`/`completedTasks` are a denormalized
    // cache for future milestones to maintain as tasks change - the M1
    // dashboard never trusts them and always recomputes live from
    // studyPlanTasks (see convex/StudyPlanner.ts) so these three fields are
    // safe to leave at 0 until a later milestone starts writing them.
    studyPlans: defineTable({
      userId: v.id('UserTable'),
      title: v.string(),
      description: v.optional(v.string()),
      learningGoal: v.optional(v.string()),
      status: v.union(
        v.literal('active'),
        v.literal('paused'),
        v.literal('completed'),
        v.literal('archived')
      ),
      startDate: v.optional(v.string()),
      targetEndDate: v.optional(v.string()),
      progress: v.number(),
      totalTasks: v.number(),
      completedTasks: v.number(),
      // M2 - captured from the Create Study Plan form (both AI and manual;
      // AI also feeds these back from what it generated) so a future "edit
      // plan" screen has the original inputs to work from.
      currentLevel: v.optional(
        v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced'))
      ),
      targetLevel: v.optional(
        v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced'))
      ),
      availableHoursPerDay: v.optional(v.number()),
      preferredStudyDays: v.optional(v.array(v.string())),
      learningPreferences: v.optional(v.array(v.string())),
      additionalInstructions: v.optional(v.string()),
      generationMethod: v.optional(v.union(v.literal('ai'), v.literal('manual'))),
      // M8 - last time RedistributeSchedule (convex/StudyPlanner.ts) ran for
      // this plan, from the AI's initial generation or a candidate-triggered
      // regeneration. Metadata only; never read to gate anything.
      scheduleGeneratedAt: v.optional(v.number()),
      // The profile's interviewTimeline/interviewDate/weeklyAvailability at
      // the moment RedistributeSchedule last read them (only set when it ran
      // without explicit overrides). The plan detail page compares these
      // against the live profile to offer "your interview details changed -
      // regenerate?" without forcing a regeneration on every profile edit.
      scheduleBasisTimeline: v.optional(v.string()),
      scheduleBasisInterviewDate: v.optional(v.string()),
      scheduleBasisWeeklyAvailability: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_user_status', ['userId', 'status']),

    // A learning phase/week within a plan. M2 writes these on plan creation;
    // M3 (Study Plan Details) is where they're browsed/edited afterward.
    studyPlanPhases: defineTable({
      studyPlanId: v.id('studyPlans'),
      userId: v.id('UserTable'),
      title: v.string(),
      description: v.optional(v.string()),
      order: v.number(),
      status: v.union(
        v.literal('not_started'),
        v.literal('in_progress'),
        v.literal('completed')
      ),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      // M2 - learning objectives for the phase, from the AI response or
      // typed manually.
      objectives: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_studyPlan', ['studyPlanId'])
      .index('by_studyPlan_order', ['studyPlanId', 'order']),

    // An individual study task (M2 creates them; M3/M4 add task management,
    // schedule, task details). `phaseId` is optional since a task can belong
    // directly to a plan before phases are organized. Progress and "next
    // upcoming task" for the M1 dashboard are computed live from this table.
    studyPlanTasks: defineTable({
      studyPlanId: v.id('studyPlans'),
      phaseId: v.optional(v.id('studyPlanPhases')),
      userId: v.id('UserTable'),
      title: v.string(),
      description: v.optional(v.string()),
      status: v.union(
        v.literal('pending'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('skipped')
      ),
      priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
      estimatedDuration: v.optional(v.number()),
      scheduledDate: v.optional(v.string()),
      // M4 - an optional time-of-day (e.g. "14:30", 24h) alongside
      // scheduledDate for the Study Schedule / Task Details screens. A task
      // can have a date with no specific time; it can never have a time
      // without a date (the UI only exposes it once a date is set).
      scheduledTime: v.optional(v.string()),
      // M8 - set when the candidate manually moves this task's date/time
      // (Day/Week view or a phase's task row). RedistributeSchedule always
      // skips a locked task unless the candidate explicitly opts in, so
      // automatic rescheduling never silently overwrites a manual choice.
      scheduleLockedByUser: v.optional(v.boolean()),
      order: v.number(),
      // M2 - "what done looks like" for this task, from the AI response or
      // typed manually.
      completionCriteria: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      // Learning resources for the Task Details screen, discovered on demand
      // by app/api/study-planner/task-resources. Every URL here was resolved
      // and verified server-side (YouTube via oEmbed, articles via a live
      // fetch) - the AI never writes URLs or resource titles directly. The
      // guide/quiz text is AI-written and labelled as such in the UI.
      // Purely informational: nothing here ever changes the task's status.
      learningResources: v.optional(taskLearningResourcesValidator),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_studyPlan', ['studyPlanId'])
      .index('by_phase', ['phaseId'])
      .index('by_user', ['userId'])
      // M4 - Study Schedule's Day/Week/Month views query a user's tasks
      // within a date range across every plan at once.
      .index('by_user_scheduledDate', ['userId', 'scheduledDate']),

    // A milestone/achievement marker within a plan. M2 writes these on plan
    // creation; M3 (Study Plan Details) is where they're browsed/edited.
    studyPlanMilestones: defineTable({
      studyPlanId: v.id('studyPlans'),
      userId: v.id('UserTable'),
      title: v.string(),
      description: v.optional(v.string()),
      targetDate: v.optional(v.string()),
      status: v.union(v.literal('pending'), v.literal('achieved')),
      // M2 - from the AI response or typed manually.
      completionCriteria: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_studyPlan', ['studyPlanId'])
      .index('by_user', ['userId']),

    // --- AI Study Room (app/(routes)/study-room) -----------------------------
    // Independent module - does not depend on Study Planner, Question Bank or
    // Interview, and is never required by them (see convex/StudyRoom.ts for
    // the "Keep AI Study Room independent" note). M1 ships this schema plus
    // room/session CRUD and read-only dashboard queries. The AI Tutor,
    // Whiteboard, Code Editor, Notes, conversation transcript and
    // AI-generated session summary are all later milestones - the optional
    // fields on studyRoomSessions below exist now only so those milestones
    // can start writing to this same row without another schema migration;
    // M1 never reads or writes any of them.
    // One row per learning room a user creates (e.g. "Mastering System
    // Design"). A room is a reusable container the learner can return to
    // and start another session in - it intentionally has no
    // active/completed/paused status of its own (only active/archived);
    // "in progress" / "completed" belongs to a *session*, not the room.
    studyRooms: defineTable({
      userId: v.id('UserTable'),
      title: v.string(),
      topic: v.string(),
      objective: v.optional(v.string()),
      category: v.optional(v.string()),
      difficulty: v.optional(
        v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced'))
      ),
      learningPreferences: v.optional(v.array(v.string())),
      additionalInstructions: v.optional(v.string()),
      status: v.union(v.literal('active'), v.literal('archived')),
      lastAccessedAt: v.optional(v.number()),
      // M5 - optional references to the existing record this room was
      // started from, if any. These are *references only* (ids), never a
      // copy of the source module's own data - the Tutor pulls the live
      // record at session-start time (see app/api/study-room/tutor/start)
      // instead of this row duplicating it. A room with none of these set
      // was created independently, which remains the default path.
      // Exception: deleting a whole Study Plan also deletes the rooms
      // started from it or its tasks (StudyPlanner.DeleteStudyPlan).
      // Deleting any other source record is never cascaded here, and every
      // place that resolves one of these ids treats "not found" as
      // "unavailable" rather than an error - see resolveLinkedSource.
      studyPlanId: v.optional(v.id('studyPlans')),
      studyTaskId: v.optional(v.id('studyPlanTasks')),
      questionBankCollectionId: v.optional(v.id('questionBankCollections')),
      questionBankQuestionIds: v.optional(v.array(v.id('questionBankQuestions'))),
      resumeMatchAnalysisId: v.optional(v.id('ResumeMatchAnalysisTable')),
      interviewReviewId: v.optional(v.id('InterviewSessionTable')),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_user_status', ['userId', 'status'])
      .index('by_studyTask', ['studyTaskId'])
      .index('by_studyPlan', ['studyPlanId']),

    // One row per learning session started inside a room. M1 only ever
    // created a row (status "in_progress") and let the learner explicitly
    // end it. M2 adds the live AI Tutor voice/text conversation on top of
    // the same row - `elevenlabsConversationId` is set once the Tutor's
    // ElevenLabs session connects (same convention as
    // InterviewSessionTable.elevenlabsConversationId). `transcript` was a
    // M1 placeholder for the conversation; M2 supersedes it with the
    // dedicated, queryable `studyRoomMessages` table below instead (a single
    // growing blob doesn't fit "retrieve history / search / paginate" as
    // well as Study Planner's own precedent of giving related data its own
    // table) - it is left in place, unused, rather than removed, in case a
    // later milestone still wants a denormalized snapshot.
    studyRoomSessions: defineTable({
      studyRoomId: v.id('studyRooms'),
      userId: v.id('UserTable'),
      // M4 - `abandoned` is now actually set (tab closed/connection dropped
      // without an explicit End Session click, via EndStudyRoomSession's
      // `reason` arg) rather than only being a defined-but-unused literal.
      // `completed` stays reserved for an explicit, learner-initiated end.
      status: v.union(v.literal('in_progress'), v.literal('completed'), v.literal('abandoned')),
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
      durationSeconds: v.optional(v.number()),
      // M2 - set once the Tutor's ElevenLabs conversation connects. A
      // session can reconnect multiple times (pause/resume), so this always
      // holds the *current/most recent* conversation id, not a history of
      // every reconnect - that history is implicit in studyRoomMessages'
      // own timestamps.
      elevenlabsConversationId: v.optional(v.string()),
      // M1 placeholder, still unused - superseded by studyRoomMessages (M2)
      // and the dedicated workspace tables (M3). Left in place rather than
      // removed.
      transcript: v.optional(v.any()),
      workspaceState: v.optional(v.any()),
      // M4 - AI-generated lesson summary. `summary` holds the structured
      // payload (see utils/studyRoom/summarySchema.ts) once `summaryStatus`
      // is "ready"; `summaryStatus`/`summaryGeneratedAt` let the UI and the
      // generation route check/transition state without reading the whole
      // blob, and let BeginSummaryGeneration (convex/StudyRoom.ts) guard
      // against two concurrent generations for the same session.
      summary: v.optional(v.any()),
      summaryStatus: v.optional(
        v.union(v.literal('none'), v.literal('generating'), v.literal('ready'), v.literal('failed'))
      ),
      summaryGeneratedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_studyRoom', ['studyRoomId'])
      .index('by_user', ['userId'])
      .index('by_user_status', ['userId', 'status']),

    // M2 - one row per Tutor/learner conversation turn, in send order.
    // `source` records whether a *learner* turn arrived as a transcribed
    // voice utterance or a typed message (via ElevenLabs' sendUserMessage,
    // which injects straight into the same live session - voice and text
    // are two input channels on one conversation, never two separate
    // conversations). Left undefined for tutor turns, which are always
    // spoken and transcribed together. No raw audio is ever stored here or
    // anywhere else - only the transcribed text.
    studyRoomMessages: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      role: v.union(v.literal('tutor'), v.literal('learner')),
      text: v.string(),
      source: v.optional(v.union(v.literal('voice'), v.literal('text'))),
      createdAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId'])
      .index('by_session_createdAt', ['studyRoomSessionId', 'createdAt']),

    // M3 - Whiteboard, Code Editor and Notes workspace persistence, plus the
    // Tutor's own tool-action audit trail (convex/StudyRoomWorkspace.ts).
    // Everything here is scoped to a single *session*, not the room -
    // "reopen a session with its previous workspace content" means exactly
    // that session's content; starting a new session in the same room
    // starts every tool empty again, same as studyRoomMessages already
    // works per-session.

    // One row per session. `snapshot` is an Excalidraw scene (elements plus
    // a small appState subset) saved verbatim as JSON on every debounced
    // client-side change - Excalidraw's own scene shape, never reinterpreted
    // here, so no parallel shape schema needs to be maintained by hand.
    studyRoomWhiteboards: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      snapshot: v.any(),
      updatedAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId']),

    // One row per code file/tab open in a session's Code Editor. `order`
    // controls tab order; a session can have several files side by side.
    // M4 - `lastRun` persists only the most recent execution's
    // output/metadata per file (not a full run history - "where
    // appropriate" per the M4 spec, and a full per-run log would be an
    // unbounded, never-asked-for table), so reopening a session still shows
    // what the code last did without re-running it.
    studyRoomCodeFiles: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      filename: v.string(),
      language: v.string(),
      content: v.string(),
      order: v.number(),
      lastRun: v.optional(
        v.object({
          stdout: v.string(),
          stderr: v.string(),
          exitCode: v.optional(v.number()),
          ranAt: v.number(),
        })
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId'])
      .index('by_session_order', ['studyRoomSessionId', 'order']),

    // One Notes document per session. `content` is the TipTap document as
    // JSON (editor.getJSON(), stringified) - search/copy/export all work
    // off the rendered text client-side rather than a second stored copy.
    studyRoomNotes: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      title: v.string(),
      content: v.string(),
      updatedAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId']),

    // Which tools are open and how the panels are arranged, so reopening a
    // session restores the workspace layout itself, not only each tool's
    // content. M4 - `panelWeights` and `maximizedTool` actually get
    // saved/restored now (M3 defined a `panelSizes` array for this but
    // never wired it up - replaced here with a clearer per-tool object
    // instead of a position-indexed array, since nothing had started
    // depending on the old shape yet).
    studyRoomWorkspaceLayout: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      openTools: v.array(v.union(v.literal('whiteboard'), v.literal('code'), v.literal('notes'))),
      activeTool: v.optional(v.union(v.literal('whiteboard'), v.literal('code'), v.literal('notes'))),
      maximizedTool: v.optional(v.union(v.literal('whiteboard'), v.literal('code'), v.literal('notes'))),
      panelWeights: v.optional(
        v.object({ whiteboard: v.number(), code: v.number(), notes: v.number() })
      ),
      updatedAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId']),

    // Audit trail of every Tutor-initiated tool action - applied, rejected
    // by the learner, or timed out waiting for approval. Stores a short
    // human-readable summary only, never the full payload. Nothing reads
    // this yet; it exists so a future "what did the Tutor do here" view
    // (or M4 session summary) has something to read without another schema
    // migration.
    studyRoomToolActions: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      tool: v.union(v.literal('whiteboard'), v.literal('code'), v.literal('notes')),
      actionType: v.string(),
      summary: v.string(),
      status: v.union(v.literal('applied'), v.literal('rejected'), v.literal('timed_out')),
      createdAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId']),

    // Phase 1 (audio stability) - single-active-tab lease for a session's
    // live Tutor. At most one row per session. `clientId` is a per-browser-tab
    // id; the owning tab renews `expiresAt` on a heartbeat, so a tab that
    // crashes or closes without releasing simply lets the lease go stale.
    // Kept in its own table (not on studyRoomSessions) so the frequent
    // heartbeat writes don't invalidate every query that reads the session.
    studyRoomTutorLeases: defineTable({
      studyRoomSessionId: v.id('studyRoomSessions'),
      userId: v.id('UserTable'),
      clientId: v.string(),
      expiresAt: v.number(),
      updatedAt: v.number(),
    })
      .index('by_session', ['studyRoomSessionId']),
});