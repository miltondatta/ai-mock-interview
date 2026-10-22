"use client"

import React, { useCallback, useContext, useEffect, useRef, useState } from "react"
import { useQuery } from "convex/react"
import { CircleAlert, Info, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import { UserDetailContext } from "@/context/UserDetailContext"
import type { ResumeMatchAnalysis } from "@/utils/resumeMatchAnalysis"
import ResumeSelector, { type ResumeOption } from "./ResumeSelector"
import JobDescriptionInput, { type JobInputMode } from "./JobDescriptionInput"
import MatchScoreCard from "./MatchScoreCard"
import MatchSummaryCard from "./MatchSummaryCard"
import SkillSummaryCards from "./SkillSummaryCards"
import RequirementMatchTable from "./RequirementMatchTable"
import AiRecommendationCard from "./AiRecommendationCard"
import SkillComparisonTab from "./SkillComparisonTab"
import DetailedAssessmentTab from "./DetailedAssessmentTab"
import RecommendationsTab from "./RecommendationsTab"
import { EmptyPanel, LoadingPanel, formatAnalysisDate, matchTone, type MatchTone } from "./shared"
import {
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_DESCRIPTION_MIN_LENGTH,
  PLACEHOLDER_MESSAGES,
  RESUME_UPLOAD_LIMITS,
} from "./constants"

const ANALYSIS_TABS = [
  { id: "result", name: "Analysis Result" },
  { id: "skills", name: "Skill Comparison" },
  { id: "assessment", name: "Detailed Assessment" },
  { id: "recommendations", name: "Recommendations" },
] as const

type AnalysisTabId = (typeof ANALYSIS_TABS)[number]["id"]

// Slightly over the analyze route's own 280s webhook timeout.
const ANALYZE_TIMEOUT_MS = 295000

const BADGE_VARIANT: Record<MatchTone, "success" | "warning" | "destructive" | "secondary"> = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  muted: "secondary",
}

interface DisplayedAnalysis {
  analysis: ResumeMatchAnalysis
  createdAt: number
}

// Headline and summary sentence for the insight panel. Only describes what
// n8n returned (its match level and the status of each requirement).
function buildInsight(analysis: ResumeMatchAnalysis) {
  const level = analysis.matchLevel?.toLowerCase() ?? ""
  const headline = level.startsWith("strong") ? "Great match!"
    : level.startsWith("good") ? "Good match"
    : level.startsWith("partial") ? "Partial match"
    : level.startsWith("low") ? "Low match"
    : "Analysis complete"

  const reqs = analysis.requirements
  const count = (status: string) => reqs.filter((r) => r.status === status).length
  const description = reqs.length > 0
    ? `Your resume was compared against ${reqs.length} requirements from this job description: ${count("matched")} matched, ${count("partial")} partially matched, ${count("unclear")} unclear and ${count("not-evidenced")} not evidenced in your resume.`
    : "The category scores below show how your resume compares with this job description."
  return { headline, description }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function ResumeMatchAnalyzerPage() {
  const { userDetail } = useContext(UserDetailContext)
  const userId = userDetail?._id
  // Loaded through /api/resumes, which identifies the candidate
  // from their Clerk session - undefined while loading.
  const [resumes, setResumes] = useState<ResumeOption[] | undefined>(undefined)
  const latestSaved = useQuery(api.ResumeMatch.GetLatestResumeMatchAnalysis, userId ? { userId } : "skip")

  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [jobInputMode, setJobInputMode] = useState<JobInputMode>("text")
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [jobUrl, setJobUrl] = useState("")
  const [activeTab, setActiveTab] = useState<AnalysisTabId>("result")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<DisplayedAnalysis | null>(null)
  // The candidate's last saved analysis is shown until they start a new one.
  const [showSaved, setShowSaved] = useState(true)
  const analyzingRef = useRef(false)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const loadResumes = useCallback(async () => {
    try {
      const res = await fetch("/api/resumes", { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data?.resumes)) {
        setResumes([])
        setNotice(data?.error ?? "Unable to load your resumes. Please refresh the page.")
        return
      }
      setResumes(data.resumes)
    } catch {
      setResumes([])
      setNotice("Unable to load your resumes. Please check your connection and refresh the page.")
    }
  }, [])

  useEffect(() => {
    loadResumes()
  }, [loadResumes])

  // Preselect the most recent resume once the list loads.
  useEffect(() => {
    if (selectedResumeId === null && resumes && resumes.length > 0) {
      setSelectedResumeId(resumes[0].id)
    }
  }, [resumes, selectedResumeId])

  const displayed: DisplayedAnalysis | null =
    result ??
    (showSaved && !isAnalyzing && latestSaved
      ? { analysis: latestSaved.analysis as ResumeMatchAnalysis, createdAt: latestSaved.createdAt }
      : null)

  const resetForm = () => {
    if (analyzingRef.current) return
    setSelectedResumeId(resumes?.[0]?.id ?? null)
    setJobInputMode("text")
    setJobTitle("")
    setJobDescription("")
    setJobUrl("")
    setActiveTab("result")
    setError(null)
    setResult(null)
    setShowSaved(false)
  }

  const validate = (): string | null => {
    if (!selectedResumeId || !resumes?.some((r) => r.id === selectedResumeId)) {
      return "Please select a resume, or upload a new one."
    }
    if (!jobTitle.trim()) return "Please enter the job title."
    if (jobInputMode === "text") {
      const length = jobDescription.trim().length
      if (length < JOB_DESCRIPTION_MIN_LENGTH) {
        return `Please paste the full job description (at least ${JOB_DESCRIPTION_MIN_LENGTH} characters).`
      }
      if (length > JOB_DESCRIPTION_MAX_LENGTH) {
        return `The job description must be ${JOB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`
      }
    } else if (!isHttpUrl(jobUrl.trim())) {
      return "Please enter a valid job posting URL starting with http:// or https://."
    }
    return null
  }

  const runAnalysis = async () => {
    if (analyzingRef.current) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    analyzingRef.current = true
    setIsAnalyzing(true)
    setError(null)
    setResult(null)
    setShowSaved(false)
    setActiveTab("result")

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS)
    try {
      const res = await fetch("/api/resume-match/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: selectedResumeId,
          mode: jobInputMode,
          jobTitle,
          jobDescription: jobInputMode === "text" ? jobDescription : "",
          jobDescriptionUrl: jobInputMode === "url" ? jobUrl.trim() : "",
        }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.analysis) {
        setError(data?.error ?? "The analysis could not be completed. Please try again.")
        return
      }
      setResult({ analysis: data.analysis, createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now() })
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "The analysis took too long to complete. Please try again."
          : "Unable to reach the server. Please check your connection and try again."
      )
    } finally {
      clearTimeout(timer)
      analyzingRef.current = false
      setIsAnalyzing(false)
    }
  }

  const uploadResume = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      setNotice("Only PDF files are supported for your resume. Please upload a .pdf file.")
      return
    }
    if (file.size > RESUME_UPLOAD_LIMITS.maxBytes) {
      setNotice(`Your resume must be ${RESUME_UPLOAD_LIMITS.maxSize} or smaller.`)
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/resume-match/upload-resume", { method: "POST", body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.resumeId) {
        setNotice(data?.error ?? "Unable to upload your resume. Please try again.")
        return
      }
      await loadResumes()
      setSelectedResumeId(data.resumeId)
      setNotice(`${file.name} uploaded and selected.`)
    } catch {
      setNotice("Unable to upload your resume. Please check your connection and try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const renderTab = (content: (current: DisplayedAnalysis) => React.ReactNode) => {
    if (isAnalyzing) return <LoadingPanel />
    if (!displayed) {
      return (
        <EmptyPanel
          title="No analysis yet"
          description="Select a resume, add a job title and description, then click Analyze Match to see how well they match."
        />
      )
    }
    return content(displayed)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Resume Match Analyzer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See how well your resume matches a job description and get personalized insights.
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="border-primary/40 px-3 text-primary hover:text-primary"
          disabled={isAnalyzing}
          onClick={resetForm}
        >
          <Plus />
          New Analysis
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ResumeSelector
          resumes={resumes}
          selectedId={selectedResumeId}
          onSelect={setSelectedResumeId}
          onUpload={uploadResume}
          isUploading={isUploading}
          disabled={isAnalyzing}
          onMenuClick={() => setNotice(PLACEHOLDER_MESSAGES.resumeMenu)}
        />
        <JobDescriptionInput
          mode={jobInputMode}
          onModeChange={setJobInputMode}
          jobTitle={jobTitle}
          onJobTitleChange={setJobTitle}
          description={jobDescription}
          onDescriptionChange={setJobDescription}
          url={jobUrl}
          onUrlChange={setJobUrl}
          onAnalyze={runAnalysis}
          isAnalyzing={isAnalyzing}
        />
      </div>

      {error && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="hover:opacity-70">
            <X className="size-4" />
          </button>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AnalysisTabId)}
        className="mt-8 gap-6"
      >
        <div className="overflow-x-auto border-b border-border">
          <TabsList variant="line" className="h-auto gap-4 p-0 sm:gap-8">
            {ANALYSIS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex-none px-1 pt-1 pb-3 data-active:text-primary after:bg-primary group-data-horizontal/tabs:after:bottom-0"
              >
                {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="result">
          {renderTab(({ analysis, createdAt }) => {
            const tone = matchTone(analysis.matchLevel)
            return (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex min-w-0 flex-col gap-5">
                  <MatchScoreCard
                    score={analysis.overallScore}
                    matchLevel={analysis.matchLevel}
                    tone={tone}
                    insight={buildInsight(analysis)}
                    categoryScores={analysis.categoryScores}
                  />
                  <SkillSummaryCards
                    matchedSkills={analysis.matchedSkills}
                    missingSkills={analysis.missingSkills}
                    unclearSkills={analysis.unclearSkills}
                    onShowRecommendations={() => setActiveTab("recommendations")}
                    onShowAssessment={() => setActiveTab("assessment")}
                  />
                  <RequirementMatchTable requirements={analysis.requirements} />
                </div>
                <div className="grid grid-cols-1 content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
                  <MatchSummaryCard
                    jobTitle={analysis.jobTitle}
                    analysisDate={formatAnalysisDate(createdAt)}
                    matchLevel={analysis.matchLevel}
                    matchLevelVariant={BADGE_VARIANT[tone]}
                    keyStrengths={analysis.matchedSkills.slice(0, 3).map((s) => s.name)}
                    mainGaps={analysis.missingSkills.slice(0, 3).map((s) => s.name)}
                  />
                  <AiRecommendationCard
                    recommendation={analysis.recommendations[0] ?? null}
                    onStartMockInterview={() => setNotice(PLACEHOLDER_MESSAGES.mockInterview)}
                    onDownloadReport={() => setNotice(PLACEHOLDER_MESSAGES.downloadReport)}
                  />
                </div>
              </div>
            )
          })}
        </TabsContent>
        <TabsContent value="skills">
          {renderTab(({ analysis }) => <SkillComparisonTab requirements={analysis.requirements} />)}
        </TabsContent>
        <TabsContent value="assessment">
          {renderTab(({ analysis }) => (
            <DetailedAssessmentTab categoryScores={analysis.categoryScores} requirements={analysis.requirements} />
          ))}
        </TabsContent>
        <TabsContent value="recommendations">
          {renderTab(({ analysis }) => <RecommendationsTab analysis={analysis} />)}
        </TabsContent>
      </Tabs>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6">
        {notice && (
          <div
            role="status"
            className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="flex-1">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ResumeMatchAnalyzerPage
