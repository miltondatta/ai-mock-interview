export const RESUME_UPLOAD_LIMITS = {
  formats: "PDF",
  maxSize: "10 MB",
  maxBytes: 10 * 1024 * 1024,
}

// Mirrors the limits enforced by app/api/resume-match/analyze.
export const JOB_TITLE_MAX_LENGTH = 200
export const JOB_DESCRIPTION_MIN_LENGTH = 100
export const JOB_DESCRIPTION_MAX_LENGTH = 10000

export const PLACEHOLDER_MESSAGES = {
  mockInterview: "Targeted mock interview integration will be implemented in a later phase. No interview was created.",
  downloadReport: "Report generation will be implemented in a later phase. No file was downloaded.",
  resumeMenu: "Resume actions will be available in a later phase.",
}
