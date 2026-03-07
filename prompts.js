export const RESUME_PARSE_PROMPT = `
You are an ATS resume parser.

Extract the candidate's information from the uploaded PDF resume.
Return only valid JSON.

Schema:
{
  "name": string,
  "degrees": string[],
  "education_levels": string[],
  "majors": string[],
  "skills": string[],
  "tools": string[],
  "programming_languages": string[],
  "frameworks": string[],
  "work_authorization_signals": string[],
  "experience_keywords": string[],
  "projects": string[],
  "summary": string
}

Rules:
- Do not invent information.
- Normalize degree abbreviations and synonyms:
  - BS, B.S., Bachelor of Science => Bachelor of Science
  - BA, B.A., Bachelor of Arts => Bachelor of Arts
  - MS, M.S., Master of Science => Master of Science
  - MA, M.A., Master of Arts => Master of Arts
  - MEng, M.Eng. => Master of Engineering
  - PhD, Ph.D., Doctorate => PhD
- Keep skill names concise and deduplicated.
- If information is missing, return empty arrays.
- Return JSON only.
`.trim();

export function buildMatchPrompt(candidateProfile, jobDescriptionText) {
  return `
You are simulating an ATS screening engine.

Compare the candidate profile JSON against the job description text.

Return only valid JSON.

Schema:
{
  "match_score": number,
  "skills_score": number,
  "degree_score": number,
  "experience_score": number,
  "degree_fit": "strong" | "partial" | "weak" | "unclear",
  "skills_matched": string[],
  "skills_missing": string[],
  "authorization_risk": "low" | "medium" | "high",
  "authorization_reasons": string[],
  "blocker": boolean,
  "verdict": "strong fit" | "possible fit" | "weak fit" | "disqualified by authorization",
  "ats_summary": string
}

Scoring rules:
- Prioritize hard requirements over preferences.
- If job explicitly says no sponsorship, citizenship required, or must be authorized to work without sponsorship, reflect that strongly.
- Degree abbreviations and synonyms should be normalized.
- Do not hallucinate.
- Return JSON only.

Candidate profile JSON:
${JSON.stringify(candidateProfile, null, 2)}

Job description:
${jobDescriptionText}
`.trim();
}