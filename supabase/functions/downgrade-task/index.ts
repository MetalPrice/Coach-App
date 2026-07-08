import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization bearer token" }, 401);
  }

  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) {
    return jsonResponse({ error: "Invalid bearer token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Supabase environment variables are missing" }, 500);
  }
  if (!groqApiKey) {
    return jsonResponse({ error: "GROQ_API_KEY is not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    console.error("Failed to authenticate user from JWT:", userError);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let taskId = "";
  let title = "";
  let description = "";

  try {
    const body = await req.json();
    taskId = typeof body?.id === "string" ? body.id.trim() : "";
    title = typeof body?.title === "string" ? body.title.trim() : "";
    description = typeof body?.description === "string"
      ? body.description.trim()
      : "";
  } catch (error) {
    console.error("Failed to parse request JSON:", error);
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!taskId || !title || !description) {
    return jsonResponse(
      { error: "Missing required fields: id, title, description" },
      400,
    );
  }

  const systemPrompt =
    "You are a supportive, practical coach. " +
    "A person is stuck on a task and has said they can't do it right now. " +
    "Instead of making the task smaller, help them actually move forward on it. " +
    "Choose whichever of these fits best given the task, and generate accordingly: " +
    "1) Break it into one small, concrete first step that removes the hardest part of starting. " +
    "2) Give one specific, practical tip or reframe that makes the task feel more doable. " +
    "3) Identify what's likely making it feel hard and address that blocker directly. " +
    "Respond with warmth but be genuinely useful, not just sympathetic. Avoid generic encouragement. " +
    "Return JSON only with exactly these fields: " +
    "reframe_message (one warm sentence), guidance (2-3 sentences max, concrete and specific), task_still_active (boolean, always true).";

  const userPrompt =
    `A person is stuck on this task: "${title}" -- ${description}. ` +
    "They've indicated they can't do it right now. " +
    "Instead of making the task smaller, help them actually move forward on it. " +
    "Return JSON only.";

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
        temperature: 0.4,
        max_tokens: 512,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
  );

  if (!groqResponse.ok) {
    const groqErrorText = await groqResponse.text();
    console.error("Groq downgrade-task request failed:", groqErrorText);
    return jsonResponse(
      { error: "Guidance generation failed", details: groqErrorText },
      502,
    );
  }

  const groqPayload = await groqResponse.json();
  const content = groqPayload?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    console.error("Groq returned empty downgrade-task content:", groqPayload);
    return jsonResponse({ error: "Model returned no guidance content" }, 502);
  }

  let parsed: {
    reframe_message?: string;
    guidance?: string;
    task_still_active?: boolean;
  };

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse downgrade-task JSON:", error, content);
    return jsonResponse({ error: "Model returned invalid JSON" }, 502);
  }

  const reframeMessage = typeof parsed.reframe_message === "string"
    ? parsed.reframe_message.trim()
    : "";
  const guidance = typeof parsed.guidance === "string"
    ? parsed.guidance.trim()
    : "";

  if (!reframeMessage || !guidance) {
    return jsonResponse(
      { error: "Model response missing reframe_message or guidance" },
      502,
    );
  }

  const { data: updatedTask, error: updateError } = await supabase
    .from("tasks")
    .update({
      reframe_message: reframeMessage,
      guidance,
      is_downgraded: true,
    })
    .eq("id", taskId)
    .select("*")
    .single();

  if (updateError) {
    console.error("Failed to update task with guidance:", updateError);
    return jsonResponse({ error: "Failed to update task" }, 500);
  }

  return jsonResponse({
    task: updatedTask,
    guidance: {
      reframe_message: reframeMessage,
      guidance,
      task_still_active: true,
    },
  });
});
