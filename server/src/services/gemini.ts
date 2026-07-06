// ─── Gemini 2.0 Flash AI Service ─────────────────────────────────────────────
// Uses the free-tier Gemini API to generate text completions.
// Model: gemini-2.0-flash  (generous free quota, fast, low latency)
// Docs: https://ai.google.dev/api/generate-content

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

export function buildSummarizePrompt(
  roomName: string,
  versionA: { name: string; createdAt: Date; docContent: string },
  versionB: { name: string; createdAt: Date; docContent: string },
): string {
  return `You are a collaborative workspace assistant.

A user wants a summary of changes between two saved versions of a collaborative document in room "${roomName}".

**Version A** (older — "${versionA.name}", saved ${versionA.createdAt.toISOString()}):
\`\`\`
${versionA.docContent.slice(0, 4000) || '(empty)'}
\`\`\`

**Version B** (newer — "${versionB.name}", saved ${versionB.createdAt.toISOString()}):
\`\`\`
${versionB.docContent.slice(0, 4000) || '(empty)'}
\`\`\`

Write a concise, structured summary of what changed between these two versions. Use bullet points. Focus on meaningful content changes, not whitespace. Be specific and precise. Format as Markdown.`;
}
