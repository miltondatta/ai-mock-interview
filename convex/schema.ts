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
});