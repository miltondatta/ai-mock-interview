// Shape of the details pulled from a resume by the profile import
// (app/api/profile/resume-import). Shared by the server route and the
// client merge logic, so it must stay free of server-only imports.

export interface ExtractedWorkExperience {
    position: string;
    company: string;
    duration: string;
    responsibilities: string[];
}

export interface ExtractedEducation {
    institution: string;
    degree: string;
    fieldOfStudy: string;
    graduationYear?: number;
}

export interface ExtractedProject {
    title: string;
    description: string;
}

export interface ExtractedProfile {
    headline: string;
    location: string;
    phone: string;
    summary: string;
    linkedinUrl: string;
    githubUrl: string;
    websiteUrl: string;
    workExperience: ExtractedWorkExperience[];
    education: ExtractedEducation[];
    skills: string[];
    certifications: string[];
    projects: ExtractedProject[];
}

export interface ResumeImportResponse {
    extracted: ExtractedProfile;
    // The library resume the details came from, or null for a DOCX upload.
    // DOCX files are read but not added to the resume library, because the
    // other library features only handle PDF.
    resume: { id: string; fileName: string } | null;
    sourceFileName: string;
}
