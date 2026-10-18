const SITE_ORIGIN = "https://ohilebofavour755-cpu.github.io";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const VOICE_MODEL = "@cf/deepgram/aura-2-en";
const TEXT_MODEL = "gemini-2.5-flash";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = origin === SITE_ORIGIN;

    const cors = allowed ? {
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    } : {};

    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...JSON_HEADERS, ...cors, ...extra }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/api/health")
    ) {
      return json({
        ok: true,
        service: "Lenora_AI",
        status: "backend_ready",
        tools: [
          "AI Writer",
          "Story Maker",
          "Image Studio",
          "Voice Studio"
        ],
        comingSoon: ["Video Studio"]
      });
    }

    const route = url.pathname;

    if (route === "/api/video") {
      return json({
        ok: false,
        comingSoon: true,
        error: "Video Studio is coming soon. The other Lenora tools are being stabilised first."
      }, 410);
    }

    const isImage = route === "/api/image";
    const isWrite = route === "/api/write" || route === "/api/story";
    const isVoice = route === "/api/voice";

    if (!isImage && !isWrite && !isVoice) {
      return json({ error: "Endpoint not found." }, 404);
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST for AI requests." }, 405);
    }

    if (!allowed) {
      return json({ error: "Request origin not allowed." }, 403);
    }

    if (
      !request.headers
        .get("Content-Type")
        ?.toLowerCase()
        .includes("application/json")
    ) {
      return json({ error: "Send JSON data." }, 415);
    }

    let body;

    try {
      const raw = await request.text();

      if (raw.length > 12000) {
        return json({ error: "Request is too large." }, 413);
      }

      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON request." }, 400);
    }

    // AI WRITER AND STORY MAKER
    if (isWrite) {
      const prompt = String(
        body.prompt || body.text || body.content || ""
      ).trim();

      if (!prompt) {
        return json({ error: "Please enter a prompt first." }, 400);
      }

      if (prompt.length > 8000) {
        return json({
          error: "Please shorten your request to 8,000 characters or fewer."
        }, 413);
      }

      if (!env.LENORA_AI_BACKEND_API_KEY) {
        return json({
          error: "The Gemini API key secret is missing in Cloudflare. Add LENORA_AI_BACKEND_API_KEY as a Worker secret."
        }, 500);
      }

      const toolName = String(
        body.contentType ||
        body.tool ||
        (route === "/api/story" ? "Story Maker" : "AI Writer")
      ).slice(0, 80);

      const tone = String(
        body.tone || "clear and engaging"
      ).slice(0, 80);

      const isStory =
        route === "/api/story" || /story/i.test(toolName);

      const systemInstruction = isStory
        ? "You are Lenora_AI Story Maker. Create an original, engaging story or story deliverable based on the request. Use vivid scenes, believable characters, natural dialogue, and a satisfying beginning, middle, and ending when appropriate. Do not merely explain how to write it."
        : "You are Lenora_AI Writer, a helpful creative-writing assistant. Produce the actual polished content requested, not instructions about creating it. Follow the requested format and tone.";

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.LENORA_AI_BACKEND_API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: systemInstruction }]
              },
              contents: [{
                role: "user",
                parts: [{
                  text: `Tool: ${toolName}\nTone: ${tone}\n\nRequest:\n${prompt}`
                }]
              }],
              generationConfig: {
                maxOutputTokens: 1800,
                temperature: 0.7
              }
            })
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const providerMessage = String(
            data?.error?.message || ""
          ).slice(0, 350);

          const hint = response.status === 429
            ? "Gemini quota or rate limit reached. Check Google AI Studio usage and try again later."
            : (
                response.status === 401 ||
                response.status === 403 ||
                response.status === 400
              )
              ? "Check that LENORA_AI_BACKEND_API_KEY is a valid Gemini API key and that the key has API access."
              : "Check the Gemini API configuration and try again.";

          return json({
            error: "Text generation failed.",
            hint,
            providerStatus: response.status,
            providerMessage
          }, 502);
        }

        const text = (
          data?.candidates?.[0]?.content?.parts || []
        )
          .map(part => part.text || "")
          .join("\n")
          .trim();

        if (!text) {
          const blockReason = data?.promptFeedback?.blockReason;

          return json({
            error: blockReason
              ? `Gemini blocked this request (${blockReason}). Try rephrasing it.`
              : "Gemini returned no text. Please try a different prompt."
          }, 502);
        }

        return json({
          ok: true,
          text,
          model: TEXT_MODEL
        });

      } catch (error) {
        return json({
          error: "Could not contact Gemini for text generation.",
          detail: String(error?.message || error).slice(0, 300)
        }, 502);
      }
    }

    // IMAGE AND VOICE REQUIRE THE CLOUDFLARE AI BINDING
    if (!env.AI) {
      return json({
        error: "Cloudflare Workers AI binding named AI is missing. Add the AI binding in Worker settings."
      }, 500);
    }

    // IMAGE STUDIO
    if (isImage) {
      const prompt = String(
        body.prompt || body.text || ""
      ).trim();

      if (!prompt) {
        return json({ error: "Please describe the image." }, 400);
      }

      if (prompt.length > 1500) {
        return json({
          error: "Please shorten the image description to 1,500 characters or fewer."
        }, 413);
      }

      try {
        const result = await env.AI.run(
          IMAGE_MODEL,
          { prompt, num_steps: 4 }
        );

        let base64 =
          typeof result?.image === "string"
            ? result.image
            : null;

        let mime = "image/jpeg";

        if (result instanceof Response) {
          mime =
            result.headers.get("content-type") || "image/jpeg";

          const bytes = new Uint8Array(
            await result.arrayBuffer()
          );

          let binary = "";

          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(
              ...bytes.subarray(i, i + 0x8000)
            );
          }

          base64 = btoa(binary);
        }

        if (!base64) {
          return json({
            error: "The image model returned no image. Check Workers AI access and usage limits."
          }, 502);
        }

        return json({
          ok: true,
          image: `data:${mime};base64,${base64}`,
          model: IMAGE_MODEL
        });

      } catch (error) {
        return json({
          error: "Image generation failed.",
          detail: String(error?.message || error).slice(0, 350),
          hint: "Check the Cloudflare AI binding and Workers AI usage limits."
        }, 502);
      }
    }

    // VOICE STUDIO
    if (isVoice) {
      const text = String(
        body.text || body.prompt || ""
      ).trim();

      if (!text) {
        return json({ error: "Please enter text to speak." }, 400);
      }

      if (text.length > 5000) {
        return json({
          error: "Please keep voice text to 5,000 characters or fewer."
        }, 413);
      }

      const speakerMap = {
        luna: "luna",
        asteria: "asteria",
        orpheus: "orpheus",
        arcas: "arcas",
        athena: "athena"
      };

      const requestedSpeaker = String(
        body.speaker || "luna"
      ).toLowerCase();

      const speaker = speakerMap[requestedSpeaker] || "luna";

      try {
        const audio = await env.AI.run(
          VOICE_MODEL,
          { text, speaker },
          { returnRawResponse: true }
        );

        if (audio instanceof Response) {
          return new Response(audio.body, {
            status: audio.status,
            headers: {
              ...cors,
              "Content-Type":
                audio.headers.get("Content-Type") || "audio/mpeg",
              "Content-Disposition":
                'inline; filename="lenora-voice.mp3"',
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff"
            }
          });
        }

        if (audio instanceof ReadableStream) {
          return new Response(audio, {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store"
            }
          });
        }

        if (audio?.audio && typeof audio.audio === "string") {
          const binary = atob(audio.audio);

          const bytes = Uint8Array.from(
            binary,
            char => char.charCodeAt(0)
          );

          return new Response(bytes, {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store"
            }
          });
        }

        return json({
          error: "The voice model returned an unexpected audio format."
        }, 502);

      } catch (error) {
        return json({
          error: "Voice generation failed.",
          detail: String(error?.message || error).slice(0, 350),
          hint: "Check the Aura voice model name, Workers AI binding, and usage limits."
        }, 502);
      }
    }
  }
};
