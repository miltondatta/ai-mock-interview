export type WorkspaceTool = "whiteboard" | "code" | "notes";

export const WORKSPACE_TOOLS: { id: WorkspaceTool; label: string }[] = [
  { id: "whiteboard", label: "Whiteboard" },
  { id: "code", label: "Code Editor" },
  { id: "notes", label: "Notes" },
];

export interface PendingApproval {
  tool: WorkspaceTool;
  description: string;
}

export interface CodeRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  compile?: { stdout: string; stderr: string } | null;
  error?: string;
}

// Canonical language ids this app supports end to end: the value sent to
// the execution sandbox (Piston's own language name), the id Monaco needs
// for syntax highlighting, and a human label for the dropdown.
export const CODE_LANGUAGE_OPTIONS: { value: string; monacoLanguage: string; label: string; extension: string }[] = [
  { value: "python", monacoLanguage: "python", label: "Python", extension: "py" },
  { value: "javascript", monacoLanguage: "javascript", label: "JavaScript", extension: "js" },
  { value: "typescript", monacoLanguage: "typescript", label: "TypeScript", extension: "ts" },
  { value: "java", monacoLanguage: "java", label: "Java", extension: "java" },
  { value: "cpp", monacoLanguage: "cpp", label: "C++", extension: "cpp" },
  { value: "c", monacoLanguage: "c", label: "C", extension: "c" },
  { value: "csharp", monacoLanguage: "csharp", label: "C#", extension: "cs" },
  { value: "go", monacoLanguage: "go", label: "Go", extension: "go" },
  { value: "rust", monacoLanguage: "rust", label: "Rust", extension: "rs" },
  { value: "ruby", monacoLanguage: "ruby", label: "Ruby", extension: "rb" },
  { value: "php", monacoLanguage: "php", label: "PHP", extension: "php" },
  { value: "bash", monacoLanguage: "shell", label: "Bash", extension: "sh" },
];

export function getLanguageOption(value: string) {
  return CODE_LANGUAGE_OPTIONS.find((l) => l.value === value) ?? CODE_LANGUAGE_OPTIONS[0];
}
