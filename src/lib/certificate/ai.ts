// AI-assisted field editing. The user supplies their own API key (kept only
// in their browser's localStorage, never persisted server-side); we relay
// the request through a server function purely to avoid browser CORS
// restrictions on the Groq / Gemini APIs.

import { createServerFn } from "@tanstack/react-start";

export type AiProvider = "groq" | "gemini";

export const AI_MODELS: Record<AiProvider, { id: string; label: string }[]> = {
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (versatile)" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast)" },
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
    { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (fast)" },
  ],
  gemini: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (fast)" },
  ],
};

export type AiFieldInput = { id: string; label: string; value: string };
export type AiFieldEdit = { id: string; text: string };

const SYSTEM_PROMPT = `You edit certificate/document text fields on behalf of a user.
You will be given a JSON list of fields, each with an "id", a "label" (what the field represents,
usually the original template text) and its current "value".
The user will describe in plain language what they want changed.
Reply with ONLY a JSON object of the exact shape:
{"edits":[{"id":"<field id>","text":"<new text for that field>"}]}
Only include fields that should change. Never invent field ids that were not given to you.
Keep replacement text concise and in the same style/case as the original unless asked otherwise.
Do not include any explanation, markdown, or text outside the JSON object.`;

function buildUserPrompt(fields: AiFieldInput[], instruction: string) {
  return `Fields:\n${JSON.stringify(fields, null, 2)}\n\nInstruction: ${instruction}`;
}

function extractJson(text: string): { edits?: AiFieldEdit[] } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(slice) as { edits?: AiFieldEdit[] };
  } catch {
    throw new Error("The model didn't return valid JSON. Try rephrasing your instruction.");
  }
}

type SuggestInput = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  fields: AiFieldInput[];
  instruction: string;
};

async function callGroq(model: string, apiKey: string, prompt: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response.");
  return content;
}

async function callGemini(model: string, apiKey: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!content) throw new Error("Gemini returned an empty response.");
  return content;
}

export const suggestFieldEdits = createServerFn({ method: "POST" })
  .validator((data: SuggestInput) => data)
  .handler(async ({ data }): Promise<{ edits: AiFieldEdit[] }> => {
    const { provider, model, apiKey, fields, instruction } = data;
    if (!apiKey.trim()) throw new Error("Add your API key first.");
    if (!instruction.trim()) throw new Error("Describe what you want changed.");
    if (fields.length === 0) throw new Error("No editable fields were detected on this document.");

    const prompt = buildUserPrompt(fields, instruction);
    const content =
      provider === "groq"
        ? await callGroq(model, apiKey, prompt)
        : await callGemini(model, apiKey, prompt);

    const parsed = extractJson(content);
    const validIds = new Set(fields.map((f) => f.id));
    const edits = (parsed.edits ?? []).filter(
      (e): e is AiFieldEdit =>
        Boolean(e) && typeof e.id === "string" && typeof e.text === "string" && validIds.has(e.id),
    );
    return { edits };
  });

const KEY_STORAGE_PREFIX = "shirtificate:ai-key:";

export function loadStoredApiKey(provider: AiProvider): string {
  try {
    return localStorage.getItem(KEY_STORAGE_PREFIX + provider) ?? "";
  } catch {
    return "";
  }
}

export function storeApiKey(provider: AiProvider, key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE_PREFIX + provider, key);
    else localStorage.removeItem(KEY_STORAGE_PREFIX + provider);
  } catch {
    // localStorage unavailable (private browsing, etc.) — silently skip persistence.
  }
}
