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
      resumeFileName: v.optional(v.string()),
      jobTitle: v.optional(v.string()),
      jobDescription: v.optional(v.string()),
      userId: v.id('UserTable'),
      status: v.string(),
      elevenlabsConversationId: v.optional(v.string()),
      transcript: v.optional(v.any()),
      feedback: v.optional(v.any())
    })
});