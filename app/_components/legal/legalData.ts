export type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "notice"; text: string }
  | { type: "contact"; lines: string[] };

export type LegalSection = {
  id: string;
  number: number;
  title: string;
  blocks: Block[];
};

export const EFFECTIVE_DATE_PLACEHOLDER = "[Insert Effective Date]";
export const LAST_UPDATED_PLACEHOLDER = "[Insert Last Updated Date]";

export const privacySections: LegalSection[] = [
  {
    id: "introduction",
    number: 1,
    title: "Introduction",
    blocks: [
      { type: "p", text: 'Welcome to **AI Mock Interview** ("we", "our", "us", or the "Platform").' },
      {
        type: "p",
        text: "AI Mock Interview is an AI-powered interview preparation platform designed to help job seekers prepare for employment interviews through resume analysis, personalized interview questions, AI-powered practice sessions, voice-based interview simulations, and performance feedback.",
      },
      {
        type: "p",
        text: "We respect your privacy and are committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, when we share it, how we protect it, and what choices and rights you may have when using our Platform.",
      },
      { type: "p", text: "By accessing or using AI Mock Interview, you acknowledge that you have read this Privacy Policy." },
      {
        type: "contact",
        lines: [
          "Service Provider: [Insert Legal Business or Company Name]",
          "Business Address: [Insert Registered Business Address]",
          "Privacy Contact: [Insert Privacy or Support Email Address]",
          "Website: [Insert Website URL]",
        ],
      },
    ],
  },
  {
    id: "information-we-collect",
    number: 2,
    title: "Information We Collect",
    blocks: [
      { type: "p", text: "We may collect the following categories of information when you use our Platform." },
      { type: "h3", text: "2.1 Account and Profile Information" },
      { type: "p", text: "When you register or use an account, we may collect:" },
      {
        type: "ul",
        items: [
          "Full name",
          "Email address",
          "Account identifier",
          "Profile information you choose to provide",
          "Authentication and account-related information",
          "Account preferences and settings",
          "Subscription and account status",
        ],
      },
      { type: "p", text: "Account authentication may be provided through third-party authentication services." },
      { type: "h3", text: "2.2 Resume and Employment Information" },
      { type: "p", text: "When you use our resume-related features, we may collect and process:" },
      {
        type: "ul",
        items: [
          "Uploaded resumes and CV documents",
          "Resume text and extracted information",
          "Employment history and work experience",
          "Education and qualifications",
          "Skills, certifications, and professional achievements",
          "Job titles and career interests",
          "Job descriptions or job requirements you provide",
          "Resume-to-job matching results and recommendations",
        ],
      },
      { type: "p", text: "Please avoid uploading information that is unnecessary for interview preparation." },
      { type: "h3", text: "2.3 Interview and Practice Information" },
      { type: "p", text: "When you use our interview and practice features, we may collect:" },
      {
        type: "ul",
        items: [
          "Interview questions generated for you",
          "Your written answers and responses",
          "Interview session history",
          "Interview preferences and selected interview modes",
          "Interview duration and session status",
          "AI-generated interview evaluations",
          "Performance scores, recommendations, and improvement feedback",
        ],
      },
      { type: "h3", text: "2.4 Voice, Audio, and Transcript Information" },
      {
        type: "p",
        text: "When you participate in voice-based interview simulations or audio practice sessions, the Platform may process:",
      },
      {
        type: "ul",
        items: [
          "Audio or voice input",
          "Speech-to-text transcripts",
          "AI-generated spoken responses",
          "Voice interaction data",
          "Interview session recordings, if recording is enabled",
          "Technical information associated with voice sessions",
        ],
      },
      {
        type: "p",
        text: "The exact audio and recording information processed depends on the features you use and the configuration of our voice service providers.",
      },
      { type: "h3", text: "2.5 Payment and Subscription Information" },
      { type: "p", text: "If you purchase a paid subscription, we may collect or receive information relating to:" },
      {
        type: "ul",
        items: [
          "Subscription plan",
          "Subscription status",
          "Transaction references",
          "Billing history",
          "Payment status",
          "Renewal and cancellation information",
        ],
      },
      {
        type: "p",
        text: "Payments may be processed by third-party payment providers. We do not intentionally collect or store complete payment card details when payment processing is handled by those providers. Their own privacy policies and terms may also apply.",
      },
      { type: "h3", text: "2.6 Technical and Usage Information" },
      {
        type: "p",
        text: "When you access the Platform, we or our service providers may collect technical and usage information, including:",
      },
      {
        type: "ul",
        items: [
          "IP address",
          "Browser type and version",
          "Device and operating system information",
          "Login and access timestamps",
          "Pages and features accessed",
          "Usage activity and interaction logs",
          "Error reports and diagnostic information",
          "Cookies and similar technologies, where applicable",
        ],
      },
    ],
  },
  {
    id: "how-we-use-information",
    number: 3,
    title: "How We Use Your Information",
    blocks: [
      { type: "p", text: "We use collected information for legitimate operational and service-related purposes, including:" },
      {
        type: "ol",
        items: [
          "Creating and managing user accounts.",
          "Authenticating users and maintaining account security.",
          "Processing uploaded resumes and job descriptions.",
          "Generating resume-to-job compatibility analysis.",
          "Creating personalized interview questions.",
          "Providing AI-powered interview simulations.",
          "Supporting voice-based interview interactions.",
          "Generating interview assessments, scores, and improvement recommendations.",
          "Saving interview history and practice progress.",
          "Managing subscriptions, billing, and account entitlements.",
          "Providing customer support and responding to inquiries.",
          "Monitoring system performance and troubleshooting technical issues.",
          "Detecting fraud, abuse, unauthorized access, and violations of our Terms of Service.",
          "Improving the reliability, usability, and performance of the Platform, subject to applicable law and your choices.",
          "Complying with applicable legal obligations.",
        ],
      },
      {
        type: "p",
        text: "We will not use your personal information for purposes materially different from those described in this Policy without providing appropriate notice or obtaining consent where required.",
      },
    ],
  },
  {
    id: "ai-processing",
    number: 4,
    title: "Artificial Intelligence Processing",
    blocks: [
      {
        type: "p",
        text: "AI Mock Interview uses artificial intelligence technologies to provide interview preparation and assessment features.",
      },
      {
        type: "p",
        text: "Depending on the feature you use, your resume information, job descriptions, interview questions, written responses, and other relevant content may be processed by AI models or third-party AI service providers.",
      },
      { type: "p", text: "AI may be used to:" },
      {
        type: "ul",
        items: [
          "Analyze resume content.",
          "Compare resumes against job requirements.",
          "Identify relevant skills and potential skill gaps.",
          "Generate interview questions and practice scripts.",
          "Simulate interviewer conversations.",
          "Analyze interview responses.",
          "Produce performance assessments and recommendations.",
        ],
      },
      {
        type: "p",
        text: "AI-generated outputs are automated suggestions and assessments. They may be incomplete, inaccurate, or unsuitable for a particular situation.",
      },
      {
        type: "notice",
        text: "**AI Mock Interview does not guarantee employment, interview success, recruitment decisions, or the accuracy of AI-generated assessments.**",
      },
      { type: "p", text: "Please do not submit highly sensitive personal information unless it is necessary for the feature you are using." },
    ],
  },
  {
    id: "how-we-share-information",
    number: 5,
    title: "How We Share Your Information",
    blocks: [
      { type: "p", text: "We do not sell your personal information as a standalone commercial product." },
      {
        type: "p",
        text: "We may share or make information available to the following categories of service providers where necessary to operate the Platform:",
      },
      { type: "h3", text: "5.1 Authentication Providers" },
      { type: "p", text: "We may use third-party authentication services to manage registration, login, and account security." },
      { type: "h3", text: "5.2 AI and Language Processing Providers" },
      {
        type: "p",
        text: "We may share relevant content with AI service providers to generate interview questions, analyze resumes, evaluate answers, and provide other AI-powered functionality.",
      },
      { type: "h3", text: "5.3 Voice and Audio Service Providers" },
      {
        type: "p",
        text: "We may use third-party voice technologies to support speech recognition, voice generation, and real-time interview interactions.",
      },
      { type: "h3", text: "5.4 File Storage and Infrastructure Providers" },
      {
        type: "p",
        text: "We may use cloud hosting, database, file storage, and infrastructure providers to store and process account information, uploaded documents, and application data.",
      },
      { type: "h3", text: "5.5 Payment Providers" },
      { type: "p", text: "Payment-related information may be shared with payment processors to complete transactions and manage subscriptions." },
      { type: "h3", text: "5.6 Legal and Safety Requirements" },
      { type: "p", text: "We may disclose information when reasonably necessary to:" },
      {
        type: "ul",
        items: [
          "Comply with applicable laws, regulations, or legal processes.",
          "Respond to valid legal requests.",
          "Protect the rights, property, or safety of our users, business, or others.",
          "Investigate fraud, security incidents, or misuse of the Platform.",
        ],
      },
      { type: "h3", text: "5.7 Business Transfers" },
      {
        type: "p",
        text: "If our business is involved in a merger, acquisition, restructuring, financing, or sale of assets, relevant information may be transferred as part of that transaction, subject to applicable legal requirements.",
      },
      { type: "p", text: "Service providers are expected to process information in accordance with applicable contractual and legal requirements." },
    ],
  },
  {
    id: "data-storage-retention",
    number: 6,
    title: "Data Storage and Retention",
    blocks: [
      { type: "p", text: "We retain personal information for as long as reasonably necessary to:" },
      {
        type: "ul",
        items: [
          "Provide the Platform and its features.",
          "Maintain your account and service history.",
          "Fulfill the purposes described in this Privacy Policy.",
          "Meet applicable legal, accounting, and regulatory obligations.",
          "Resolve disputes and enforce our agreements.",
        ],
      },
      { type: "p", text: "Retention periods may vary depending on the type of information and the purpose for which it is processed." },
      {
        type: "p",
        text: "Uploaded resumes, interview records, transcripts, audio data, and other user content may be retained according to the Platform's actual storage and retention configuration.",
      },
      {
        type: "p",
        text: "When information is no longer required, we will take appropriate steps to delete, anonymize, or securely dispose of it, subject to applicable legal requirements and legitimate retention needs.",
      },
      {
        type: "notice",
        text: "**[Before publication: Specify the actual retention periods for resumes, interview records, transcripts, audio recordings, account data, and backups.]**",
      },
    ],
  },
  {
    id: "data-security",
    number: 7,
    title: "Data Security",
    blocks: [
      {
        type: "p",
        text: "We use reasonable technical and organizational measures designed to protect personal information against unauthorized access, alteration, disclosure, loss, and misuse.",
      },
      {
        type: "p",
        text: "These measures may include access controls, authentication mechanisms, secure communication protocols, and infrastructure security practices.",
      },
      {
        type: "p",
        text: "However, no internet-based service or electronic storage system can be guaranteed to be completely secure. We cannot guarantee absolute security of information transmitted to or stored by the Platform.",
      },
      {
        type: "p",
        text: "You are responsible for maintaining the confidentiality of your account credentials and notifying us if you suspect unauthorized access to your account.",
      },
    ],
  },
  {
    id: "cookies",
    number: 8,
    title: "Cookies and Similar Technologies",
    blocks: [
      { type: "p", text: "The Platform may use cookies, local storage, and similar technologies to:" },
      {
        type: "ul",
        items: [
          "Maintain login sessions.",
          "Remember user preferences.",
          "Support essential application functionality.",
          "Understand Platform usage.",
          "Improve performance and user experience.",
          "Support analytics, where enabled.",
        ],
      },
      {
        type: "p",
        text: "You may be able to control cookies through your browser settings. Disabling certain cookies may affect the availability or functionality of some Platform features.",
      },
      {
        type: "p",
        text: "Where required by applicable law, we will request consent before using non-essential cookies or similar technologies.",
      },
    ],
  },
  {
    id: "international-transfers",
    number: 9,
    title: "International Data Transfers",
    blocks: [
      {
        type: "p",
        text: "Our service providers or infrastructure may process or store information in countries other than the country in which you reside.",
      },
      { type: "p", text: "As a result, your information may be transferred internationally, subject to applicable data protection requirements." },
      {
        type: "p",
        text: "Where required by law, we will take appropriate measures to ensure that international transfers receive an adequate level of protection.",
      },
    ],
  },
  {
    id: "privacy-rights",
    number: 10,
    title: "Your Privacy Rights and Choices",
    blocks: [
      { type: "p", text: "Depending on your location and applicable law, you may have rights to:" },
      {
        type: "ul",
        items: [
          "Request access to your personal information.",
          "Request correction of inaccurate information.",
          "Request deletion of certain personal information.",
          "Request a copy of information you have provided.",
          "Object to or restrict certain processing activities.",
          "Withdraw consent where processing is based on consent.",
          "Opt out of certain marketing communications.",
          "Lodge a complaint with a relevant data protection authority.",
        ],
      },
      { type: "p", text: "To exercise applicable rights, contact us at **[Insert Privacy Contact Email]**." },
      {
        type: "p",
        text: "We may need to verify your identity before processing certain requests. Some information may need to be retained where required by law or for legitimate business purposes.",
      },
    ],
  },
  {
    id: "account-data-deletion",
    number: 11,
    title: "Account and Data Deletion",
    blocks: [
      {
        type: "p",
        text: "You may request account deletion by contacting us at **[Insert Support or Privacy Email]** or by using an available account deletion feature, if provided.",
      },
      {
        type: "p",
        text: "When an account deletion request is accepted, we will take appropriate steps to delete or anonymize associated personal information, subject to legal obligations, security requirements, unresolved transactions, and legitimate retention needs.",
      },
      { type: "p", text: "Some information may remain in backups for a limited period according to our backup and deletion procedures." },
      {
        type: "notice",
        text: "**[Before publication: Confirm whether account deletion is available directly in the application or only through support.]**",
      },
    ],
  },
  {
    id: "childrens-privacy",
    number: 12,
    title: "Children's Privacy",
    blocks: [
      {
        type: "p",
        text: "AI Mock Interview is intended for individuals who are legally able to use the service under the laws applicable to them.",
      },
      {
        type: "p",
        text: "The Platform is not knowingly designed to collect personal information from children where such collection would require parental consent or otherwise be prohibited by applicable law.",
      },
      {
        type: "p",
        text: "If you believe that a child has provided personal information to us in violation of applicable requirements, please contact us so that we can review the matter and take appropriate action.",
      },
    ],
  },
  {
    id: "third-party-services",
    number: 13,
    title: "Third-Party Services and Links",
    blocks: [
      {
        type: "p",
        text: "The Platform may integrate with or link to third-party websites, applications, authentication services, payment processors, AI providers, and other external services.",
      },
      {
        type: "p",
        text: "We do not control the privacy practices of independent third parties. Your use of those services may be governed by their own privacy policies and terms.",
      },
      { type: "p", text: "We encourage you to review the privacy policies of relevant third-party providers." },
    ],
  },
  {
    id: "changes-to-policy",
    number: 14,
    title: "Changes to This Privacy Policy",
    blocks: [
      {
        type: "p",
        text: "We may update this Privacy Policy from time to time to reflect changes in our services, technology, legal obligations, or business practices.",
      },
      {
        type: "p",
        text: "When we make material changes, we will take reasonable steps to notify users through the Platform, email, or other appropriate channels where required.",
      },
      { type: "p", text: 'The updated version will be published on this page with a revised "Last Updated" date.' },
    ],
  },
  {
    id: "contact-us",
    number: 15,
    title: "Contact Us",
    blocks: [
      {
        type: "p",
        text: "If you have questions, concerns, or requests relating to this Privacy Policy or the handling of your personal information, please contact:",
      },
      {
        type: "contact",
        lines: [
          "[Insert Legal Business or Company Name]",
          "Email: dattamukul05@gmail.com",
          "Address: House-113, Road-2 Block-A Bashundhara R/A Dhaka",
          "Website: [Insert Website URL]",
        ],
      },
      { type: "p", text: "We will review and respond to privacy-related inquiries in accordance with applicable legal requirements." },
    ],
  },
];

export const termsSections: LegalSection[] = [
  {
    id: "introduction-acceptance",
    number: 1,
    title: "Introduction and Acceptance",
    blocks: [
      { type: "p", text: 'Welcome to **AI Mock Interview** ("we", "our", "us", or the "Platform").' },
      {
        type: "p",
        text: 'These Terms of Service ("Terms") govern your access to and use of the AI Mock Interview website, applications, features, and related services.',
      },
      {
        type: "p",
        text: "AI Mock Interview is an AI-powered interview preparation platform that helps users practice employment interviews through resume analysis, personalized question generation, AI-powered interview simulations, voice interaction, and performance feedback.",
      },
      {
        type: "p",
        text: "By creating an account, accessing, or using the Platform, you agree to be bound by these Terms. If you do not agree, you must not use the Platform.",
      },
      {
        type: "contact",
        lines: [
          "Service Provider: [Insert Legal Business or Company Name]",
          "Business Address: [Insert Registered Business Address]",
          "Contact Email: [Insert Support Email Address]",
          "Website: [Insert Website URL]",
        ],
      },
    ],
  },
  {
    id: "eligibility-accounts",
    number: 2,
    title: "Eligibility and User Accounts",
    blocks: [
      { type: "h3", text: "2.1 Eligibility" },
      {
        type: "p",
        text: "You may use the Platform only if you are legally eligible to enter into a binding agreement under the laws applicable to you.",
      },
      { type: "p", text: "You are responsible for ensuring that your use of the Platform complies with applicable laws and regulations." },
      { type: "h3", text: "2.2 Account Registration" },
      { type: "p", text: "Some features require you to create an account." },
      { type: "p", text: "When registering, you agree to:" },
      {
        type: "ul",
        items: [
          "Provide accurate and current information.",
          "Keep your account information up to date.",
          "Maintain the confidentiality of your login credentials.",
          "Use your account only for authorized purposes.",
          "Notify us promptly if you suspect unauthorized access.",
        ],
      },
      {
        type: "p",
        text: "You are responsible for activities conducted through your account, except to the extent that applicable law provides otherwise.",
      },
      { type: "h3", text: "2.3 Account Security" },
      { type: "p", text: "You must not share, sell, rent, transfer, or otherwise provide unauthorized access to your account." },
      {
        type: "p",
        text: "We may use authentication, session management, device controls, or other security measures to protect accounts and subscriptions.",
      },
      { type: "p", text: "We may restrict or suspend access where we reasonably believe an account has been compromised or misused." },
    ],
  },
  {
    id: "description-of-services",
    number: 3,
    title: "Description of Services",
    blocks: [
      { type: "p", text: "AI Mock Interview may provide some or all of the following features:" },
      { type: "h3", text: "3.1 Resume Management" },
      { type: "p", text: "Users may upload, store, manage, and reuse resumes or CV documents for interview preparation." },
      { type: "h3", text: "3.2 Resume Match Analyzer" },
      {
        type: "p",
        text: "The Platform may analyze a user's resume against a job description and generate compatibility scores, skill comparisons, identified gaps, and recommendations.",
      },
      { type: "p", text: "These results are informational estimates and do not represent an official recruitment assessment." },
      { type: "h3", text: "3.3 AI Practice Coach" },
      {
        type: "p",
        text: "The Platform may generate personalized practice scripts, interview questions, suggested answers, and other preparation materials based on information supplied by the user.",
      },
      { type: "h3", text: "3.4 AI Mock Interview" },
      {
        type: "p",
        text: "Users may participate in simulated interviews with an AI-powered interviewer. The Platform may generate questions, process user responses, and provide feedback on interview performance.",
      },
      { type: "h3", text: "3.5 Voice-Based Interview Services" },
      {
        type: "p",
        text: "Some interview sessions may use voice recognition, speech processing, and AI-generated speech to provide interactive interview experiences.",
      },
      { type: "h3", text: "3.6 Interview Reports and Feedback" },
      {
        type: "p",
        text: "The Platform may generate interview summaries, performance scores, observations, and improvement recommendations based on user responses.",
      },
      { type: "h3", text: "3.7 Changes to Services" },
      {
        type: "p",
        text: "We may add, modify, suspend, or discontinue features from time to time. Where required by applicable law or our contractual commitments, we will provide appropriate notice.",
      },
    ],
  },
  {
    id: "ai-content-limitations",
    number: 4,
    title: "AI-Generated Content and Important Limitations",
    blocks: [
      {
        type: "p",
        text: "The Platform uses artificial intelligence to generate questions, analyze resumes, simulate interviews, and provide feedback.",
      },
      { type: "p", text: "You acknowledge and agree that:" },
      {
        type: "ol",
        items: [
          "AI-generated content may contain errors, inaccuracies, omissions, or outdated information.",
          "AI-generated interview questions and suggested answers are for preparation and practice purposes.",
          "Resume match scores are estimates based on the information and methods available to the Platform.",
          "Interview scores and feedback are not official employer evaluations.",
          "AI-generated responses do not guarantee that a candidate will be selected, shortlisted, or hired.",
          "The Platform does not guarantee employment, interview success, salary outcomes, or career advancement.",
          "You should independently review and verify important AI-generated information before relying on it.",
        ],
      },
      {
        type: "p",
        text: "AI Mock Interview is an interview preparation tool. It is not an employer, recruitment agency, staffing agency, or employment placement service.",
      },
      {
        type: "notice",
        text: "**You remain responsible for your interview answers, job applications, career decisions, and use of AI-generated materials.**",
      },
    ],
  },
  {
    id: "user-content-responsibilities",
    number: 5,
    title: "User Content and Responsibilities",
    blocks: [
      {
        type: "p",
        text: '"User Content" means information, documents, text, audio, responses, and other materials that you upload, submit, record, or otherwise provide through the Platform.',
      },
      { type: "p", text: "You retain ownership of your User Content, subject to the rights and permissions necessary to operate the Platform." },
      { type: "p", text: "You represent and warrant that:" },
      {
        type: "ul",
        items: [
          "You have the right to upload and use the materials you submit.",
          "Your content does not knowingly violate another person's intellectual property, privacy, or other legal rights.",
          "Your use of the Platform complies with applicable laws.",
          "You will not upload malicious software or harmful files.",
          "You will not submit content that you are not authorized to disclose.",
        ],
      },
      {
        type: "p",
        text: "You are responsible for ensuring that your resume, job descriptions, and other submitted materials do not contain confidential or sensitive information that you are not authorized to share.",
      },
    ],
  },
  {
    id: "license-to-process",
    number: 6,
    title: "License to Process User Content",
    blocks: [
      {
        type: "p",
        text: "To provide the Platform's services, you grant us a limited, non-exclusive, worldwide, and royalty-free license to host, store, reproduce, transmit, and process your User Content as reasonably necessary to:",
      },
      {
        type: "ul",
        items: [
          "Operate and maintain your account.",
          "Provide resume analysis and interview preparation features.",
          "Generate questions, practice scripts, and interview feedback.",
          "Enable voice and other interactive services.",
          "Provide customer support.",
          "Maintain the security and reliability of the Platform.",
          "Comply with applicable legal obligations.",
        ],
      },
      { type: "p", text: "This license is limited to the purposes described in these Terms and our Privacy Policy." },
      {
        type: "p",
        text: "We do not acquire ownership of your resumes, personal documents, or interview responses merely because you use the Platform.",
      },
    ],
  },
  {
    id: "acceptable-use",
    number: 7,
    title: "Acceptable Use",
    blocks: [
      { type: "p", text: "You agree not to:" },
      {
        type: "ol",
        items: [
          "Use the Platform for unlawful, fraudulent, or deceptive activities.",
          "Attempt to gain unauthorized access to accounts, systems, or data.",
          "Share, sell, rent, or commercially exploit access to your account without authorization.",
          "Reverse engineer, decompile, or attempt to extract the source code of the Platform except where applicable law permits.",
          "Interfere with or disrupt the operation or security of the Platform.",
          "Upload malicious code, viruses, or harmful files.",
          "Use automated methods to scrape, extract, or collect Platform data without authorization.",
          "Circumvent subscription restrictions, usage limits, or security controls.",
          "Misrepresent AI-generated assessments as official employer or recruitment decisions.",
          "Use the Platform in a manner that violates the rights of other individuals or organizations.",
        ],
      },
      { type: "p", text: "We reserve the right to investigate suspected violations and take appropriate action." },
    ],
  },
  {
    id: "subscriptions-fees-payments",
    number: 8,
    title: "Subscriptions, Fees, and Payments",
    blocks: [
      { type: "h3", text: "8.1 Subscription Plans" },
      {
        type: "p",
        text: "AI Mock Interview may offer free and paid subscription plans with different features, usage allowances, and access levels.",
      },
      { type: "p", text: "The features, prices, billing periods, and applicable limits will be displayed on the Platform before purchase." },
      { type: "h3", text: "8.2 Payment Processing" },
      { type: "p", text: "Payments may be processed through third-party payment service providers." },
      {
        type: "p",
        text: "By purchasing a subscription, you authorize the applicable payment provider to process the transaction using the payment method you select.",
      },
      { type: "p", text: "Your payment may also be subject to the payment provider's terms and policies." },
      { type: "h3", text: "8.3 Automatic Renewal" },
      {
        type: "p",
        text: "If a subscription is configured to renew automatically, it will renew at the end of the applicable billing period unless you cancel it before the renewal date.",
      },
      { type: "p", text: "The applicable renewal price and billing frequency will be displayed at the time of purchase." },
      { type: "h3", text: "8.4 Cancellation" },
      {
        type: "p",
        text: "You may cancel a subscription according to the cancellation process made available through the Platform or the applicable payment provider.",
      },
      {
        type: "p",
        text: "Cancellation generally prevents future renewals. Access to paid features may continue until the end of the already-paid billing period, unless otherwise stated at purchase or required by law.",
      },
      { type: "h3", text: "8.5 Refunds" },
      {
        type: "p",
        text: "Refund eligibility is governed by the refund terms displayed at the time of purchase and applicable consumer protection laws.",
      },
      { type: "p", text: "Nothing in these Terms limits any mandatory refund or cancellation rights that you may have under applicable law." },
      {
        type: "notice",
        text: "**[Before publication: Insert the actual refund policy, including any trial, cancellation, and refund conditions. Do not promise or exclude refunds without confirming the applicable law and payment configuration.]**",
      },
      { type: "h3", text: "8.6 Changes to Pricing" },
      {
        type: "p",
        text: "We may change subscription prices or plan features. Where required, we will provide advance notice before changes apply to an existing subscription.",
      },
    ],
  },
  {
    id: "intellectual-property",
    number: 9,
    title: "Intellectual Property Rights",
    blocks: [
      {
        type: "p",
        text: "The Platform, including its software, interface, design, branding, logos, visual elements, documentation, and proprietary technology, is owned by or licensed to [Insert Legal Business or Company Name] and is protected by applicable intellectual property laws.",
      },
      {
        type: "p",
        text: "Except as expressly permitted by these Terms, you may not copy, modify, distribute, publish, sell, or commercially exploit any part of the Platform without our prior written permission.",
      },
      {
        type: "p",
        text: "You retain ownership of your User Content. Subject to applicable law and the rights granted under these Terms, AI-generated outputs are provided to you for your personal or permitted business use. We do not guarantee that every AI-generated output is unique or eligible for intellectual property protection.",
      },
    ],
  },
  {
    id: "third-party-services",
    number: 10,
    title: "Third-Party Services",
    blocks: [
      {
        type: "p",
        text: "The Platform may integrate with third-party services, including authentication, AI processing, voice technologies, cloud storage, hosting, analytics, and payment services.",
      },
      {
        type: "p",
        text: "These services may be subject to separate terms, privacy policies, availability conditions, and technical limitations.",
      },
      {
        type: "p",
        text: "We are not responsible for the independent operation, policies, or availability of third-party services, except where responsibility cannot be excluded under applicable law.",
      },
    ],
  },
  {
    id: "service-availability",
    number: 11,
    title: "Service Availability and Maintenance",
    blocks: [
      {
        type: "p",
        text: "We aim to provide a reliable service but do not guarantee that the Platform will always be available, uninterrupted, error-free, or compatible with every device or browser.",
      },
      { type: "p", text: "The Platform may occasionally be unavailable due to:" },
      {
        type: "ul",
        items: [
          "Scheduled maintenance.",
          "Software updates.",
          "Infrastructure or network failures.",
          "Third-party service interruptions.",
          "Security incidents.",
          "Events outside our reasonable control.",
        ],
      },
      { type: "p", text: "We may temporarily restrict access to specific features to maintain or improve the Platform." },
    ],
  },
  {
    id: "disclaimer-of-warranties",
    number: 12,
    title: "Disclaimer of Warranties",
    blocks: [
      {
        type: "p",
        text: 'To the maximum extent permitted by applicable law, the Platform is provided on an "as is" and "as available" basis.',
      },
      { type: "p", text: "We do not warrant that:" },
      {
        type: "ul",
        items: [
          "The Platform will be uninterrupted or error-free.",
          "AI-generated results will always be accurate or complete.",
          "Resume match scores will reflect an employer's actual recruitment criteria.",
          "Interview feedback will predict real-world interview performance.",
          "The Platform will result in employment, promotion, or any particular career outcome.",
          "All features will remain available indefinitely.",
        ],
      },
      { type: "p", text: "Nothing in these Terms excludes warranties or rights that cannot legally be excluded under applicable law." },
    ],
  },
  {
    id: "limitation-of-liability",
    number: 13,
    title: "Limitation of Liability",
    blocks: [
      {
        type: "p",
        text: "To the maximum extent permitted by applicable law, [Insert Legal Business or Company Name] will not be liable for indirect, incidental, special, consequential, or punitive damages, including loss of profits, opportunities, data, goodwill, or employment opportunities arising from your use of or inability to use the Platform.",
      },
      {
        type: "p",
        text: "Our total liability arising from or relating to the Platform will be limited to the amount you paid to us for the relevant service during the twelve (12) months immediately preceding the event giving rise to the claim, or the minimum amount permitted by applicable law, whichever is greater.",
      },
      { type: "p", text: "This limitation does not apply to liability that cannot legally be limited or excluded under applicable law." },
    ],
  },
  {
    id: "indemnification",
    number: 14,
    title: "Indemnification",
    blocks: [
      {
        type: "p",
        text: "To the extent permitted by applicable law, you agree to indemnify and hold harmless [Insert Legal Business or Company Name], its officers, employees, contractors, and service providers from claims, liabilities, damages, and reasonable expenses arising from:",
      },
      {
        type: "ul",
        items: [
          "Your unlawful use of the Platform.",
          "Your violation of these Terms.",
          "Your infringement of another person's rights.",
          "Your User Content where you lacked the necessary rights or authorization.",
        ],
      },
      {
        type: "p",
        text: "This provision does not apply to the extent a claim results from our own unlawful conduct or liability that cannot legally be transferred to you.",
      },
    ],
  },
  {
    id: "suspension-termination",
    number: 15,
    title: "Suspension and Termination",
    blocks: [
      { type: "p", text: "You may stop using the Platform at any time." },
      { type: "p", text: "We may suspend or terminate your access if:" },
      {
        type: "ul",
        items: [
          "You materially violate these Terms.",
          "Your account is used for fraudulent or unlawful purposes.",
          "Your activities threaten the security or operation of the Platform.",
          "We are required to do so by law.",
          "We discontinue the relevant service.",
        ],
      },
      {
        type: "p",
        text: "Where reasonably possible and legally permitted, we will provide notice and an opportunity to address the issue before taking action.",
      },
      {
        type: "p",
        text: "Upon termination, your right to access the Platform will end. Provisions that by their nature should survive termination, including intellectual property, disclaimers, limitations of liability, and dispute-related provisions, will continue to apply.",
      },
    ],
  },
  {
    id: "privacy-personal-information",
    number: 16,
    title: "Privacy and Personal Information",
    blocks: [
      {
        type: "p",
        text: "Your use of the Platform is also governed by our Privacy Policy, which explains how we collect, use, store, and share personal information.",
      },
      { type: "p", text: "By using the Platform, you acknowledge that you have had the opportunity to review our Privacy Policy." },
      { type: "p", text: "**Privacy Policy:** [Insert Privacy Policy URL]" },
    ],
  },
  {
    id: "governing-law",
    number: 17,
    title: "Governing Law and Dispute Resolution",
    blocks: [
      {
        type: "p",
        text: "These Terms will be governed by the laws of **[Insert Applicable Jurisdiction]**, without regard to conflict-of-law principles, except where mandatory consumer protection laws provide otherwise.",
      },
      {
        type: "p",
        text: "Any dispute arising from or relating to these Terms or the Platform will be handled by the competent courts or dispute resolution bodies of **[Insert Applicable Jurisdiction]**, subject to mandatory rights available under applicable law.",
      },
      {
        type: "notice",
        text: "**[Before publication: Select the governing jurisdiction based on your actual business structure, target markets, and legal advice. Do not assume one jurisdiction's law applies to every user.]**",
      },
    ],
  },
  {
    id: "changes-to-terms",
    number: 18,
    title: "Changes to These Terms",
    blocks: [
      {
        type: "p",
        text: "We may update these Terms from time to time to reflect changes in our services, business operations, or legal requirements.",
      },
      { type: "p", text: 'Updated Terms will be published on this page with a revised "Last Updated" date.' },
      { type: "p", text: "Where required by applicable law, we will notify users of material changes before they take effect." },
      {
        type: "p",
        text: "Your continued use of the Platform after the effective date of updated Terms constitutes acceptance of the revised Terms, to the extent permitted by law.",
      },
    ],
  },
  {
    id: "severability",
    number: 19,
    title: "Severability",
    blocks: [
      {
        type: "p",
        text: "If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will continue in effect to the maximum extent permitted by law.",
      },
    ],
  },
  {
    id: "entire-agreement",
    number: 20,
    title: "Entire Agreement",
    blocks: [
      {
        type: "p",
        text: "These Terms, together with the Privacy Policy and any additional terms presented to you for specific services or purchases, constitute the agreement between you and us concerning your use of the Platform.",
      },
    ],
  },
  {
    id: "contact-information",
    number: 21,
    title: "Contact Information",
    blocks: [
      { type: "p", text: "For questions about these Terms, subscriptions, or use of the Platform, please contact:" },
      {
        type: "contact",
        lines: [
          "[Insert Legal Business or Company Name]",
          "Email: [Insert Support Email Address]",
          "Address: [Insert Business Address]",
          "Website: [Insert Website URL]",
        ],
      },
    ],
  },
];
