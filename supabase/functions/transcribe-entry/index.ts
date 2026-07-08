import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

  let audioFile: File | null = null;
  try {
    const formData = await req.formData();
    const audioPart = formData.get("audio");
    if (audioPart instanceof File) {
      audioFile = audioPart;
    }
  } catch (error) {
    console.error("Failed to parse multipart form data:", error);
    return jsonResponse({ error: "Invalid multipart/form-data body" }, 400);
  }

  if (!audioFile) {
    return jsonResponse({ error: "Expected an audio file in 'audio' field" }, 400);
  }

  const groqForm = new FormData();
  groqForm.append("file", audioFile, audioFile.name || "entry.webm");
  groqForm.append("model", "whisper-large-v3");

  const groqResponse = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: groqForm,
    },
  );

  if (!groqResponse.ok) {
    const groqErrorText = await groqResponse.text();
    console.error("Groq transcription request failed:", groqErrorText);
    return jsonResponse(
      { error: "Transcription failed", details: groqErrorText },
      502,
    );
  }

  const groqPayload = await groqResponse.json();
  const transcript = typeof groqPayload?.text === "string"
    ? groqPayload.text
    : "";

  if (!transcript) {
    return jsonResponse({ error: "Transcription returned empty text" }, 502);
  }

  const { error: insertError } = await supabase.from("entries").insert({
    coachee_id: user.id,
    transcript,
  });

  if (insertError) {
    console.error("Failed to insert transcript into entries:", insertError);
    return jsonResponse({ error: "Failed to save transcript" }, 500);
  }

  return jsonResponse({ success: true, transcript });
});
