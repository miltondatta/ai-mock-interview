import { defineSchema,defineTable } from "convex/server";
import { v } from "convex/values";

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
      bio: v.optional(v.string()),
      updatedAt: v.number(),
    }),

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
      order: v.number(),
      // M2 - "what done looks like" for this task, from the AI response or
      // typed manually.
      completionCriteria: v.optional(v.string()),
      completedAt: v.optional(v.number()),
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
});