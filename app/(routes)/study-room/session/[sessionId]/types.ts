export interface RoomContext {
  _id: string
  title: string
  topic: string
  objective?: string
}

export type MessageSource = "voice" | "text"

export interface TranscriptMessage {
  id: string
  role: "tutor" | "learner"
  text: string
  createdAt: number
  source?: MessageSource
}
