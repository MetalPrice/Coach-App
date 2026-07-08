import "@supabase/functions-js/edge-runtime.d.ts";
const MAX_NOTES_CHARS = 32000;
const MAX_RESPONSE_TOKENS = 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function tryParseTasks(content: string) {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        title: typeof item.title === "string" ? item.title.trim() : "",
        description: typeof item.description === "string"
          ? item.description.trim()
          : "",
      }))
      .filter((item) => item.title && item.description);
  } catch (_error) {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    return jsonResponse({ error: "GROQ_API_KEY is not configured" }, 500);
  }

  let notes = "";
  try {
    const body = await req.json();
    notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  } catch (error) {
    console.error("Failed to parse request JSON:", error);
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!notes) {
    return jsonResponse({ error: "Missing 'notes' text in request body" }, 400);
  }

  if (notes.length > MAX_NOTES_CHARS) {
    console.warn(
      `Truncating meeting notes for Groq: ${notes.length} chars -> ${MAX_NOTES_CHARS} chars`,
    );
    notes = notes.slice(0, MAX_NOTES_CHARS);
  }

  const systemPrompt =
    "You extract concrete, actionable tasks from coaching or meeting notes. Return JSON only. " +
    "Do not include markdown, explanations, or extra keys. " +
    "Return an array of objects. Each object must have exactly: " +
    "title (short, action-oriented) and description (one sentence of context). " +
    "Include only tasks that genuinely make sense from the notes, whether explicit or strongly implied. " +
    "Do not force a fixed number of tasks. If no actionable tasks exist, return [].";

  const groqResponse = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: MAX_RESPONSE_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content:
              'Extract actionable tasks from these notes and return JSON with the shape {"tasks":[{"title":"...","description":"..."}]} only.\n\n' +
              notes,
          },
        ],
      }),
    },
  );

  if (!groqResponse.ok) {
    const groqErrorText = await groqResponse.text();
    console.error("Groq task extraction request failed:", groqErrorText);
    return jsonResponse(
      { error: "Task extraction failed", details: groqErrorText },
      502,
    );
  }

  const groqPayload = await groqResponse.json();
  const content = groqPayload?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    console.error("Groq returned empty task content:", groqPayload);
    return jsonResponse({ error: "Model returned no task content" }, 502);
  }

  let tasks: Array<{ title: string; description: string }> = [];

  try {
    const parsed = JSON.parse(content);
    const rawTasks = Array.isArray(parsed) ? parsed : parsed?.tasks;

    if (!Array.isArray(rawTasks)) {
      tasks = tryParseTasks(content);
    } else {
      tasks = rawTasks
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          title: typeof item.title === "string" ? item.title.trim() : "",
          description: typeof item.description === "string"
            ? item.description.trim()
            : "",
        }))
        .filter((item) => item.title && item.description);
    }
  } catch (error) {
    console.error("Failed to parse model task JSON:", error, content);
    tasks = tryParseTasks(content);
  }

  return jsonResponse({ tasks });
});
