import "@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "unpdf";

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

  let pdfFile: File | null = null;

  try {
    const formData = await req.formData();
    const filePart = formData.get("file") ?? formData.get("pdf");

    if (filePart instanceof File) {
      pdfFile = filePart;
    }
  } catch (error) {
    console.error("Failed to parse multipart/form-data:", error);
    return jsonResponse({ error: "Invalid multipart/form-data body" }, 400);
  }

  if (!pdfFile) {
    return jsonResponse(
      { error: "Expected a PDF file in the 'file' or 'pdf' field" },
      400,
    );
  }

  const mimeType = pdfFile.type?.toLowerCase();
  if (mimeType && mimeType !== "application/pdf") {
    return jsonResponse(
      { error: `Unsupported file type: ${pdfFile.type}. Expected application/pdf.` },
      400,
    );
  }

  try {
    const buffer = await pdfFile.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    const text = typeof result.text === "string" ? result.text.trim() : "";

    return jsonResponse({
      success: true,
      text,
      fileName: pdfFile.name || null,
    });
  } catch (error) {
    console.error("Failed to extract PDF text:", error);
    return jsonResponse({ error: "Failed to extract text from PDF" }, 500);
  }
});
