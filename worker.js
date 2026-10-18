
const SITE_ORIGIN = "https://ohilebofavour755-cpu.github.io";

const TEXT_MODEL = "@cf/zai-org/glm-4.7-flash";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const VOICE_MODEL = "@cf/deepgram/aura-2-en";

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

    const cors = allowed
      ? {
          "Access-Control-Allow-Origin": SITE_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin"
        }
      : {};

    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...JSON_HEADERS, ...cors, ...extra }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/api/health")
    ) {
      return json({
        ok: true,
        service: "Lenora_AI",
        status: "backend_ready",
        provider: "Cloudflare Workers AI",
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
        error: "Video Studio is coming soon."
      }, 410);
    }

    const isImage = route === "/api/image";
    const isWrite =
      route === "/api/write" || route === "/api/story";
    const isVoice = route === "/api/voice";

    if (!isImage && !isWrite && !isVoice) {
      return json({ error: "Endpoint not found." }, 404);
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST for AI requests." }, 405);
    }

    if (!allowed) {
      return json({
        error: "Request origin not allowed.",
        detail: "Check the website origin configured in the Worker."
      }, 403);
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

    if (!env.AI) {
      return json({
        error: "Cloudflare Workers AI binding is missing.",
        detail: "Add an AI binding named AI in the Worker settings."
      }, 500);
    }

    // AI WRITER AND STORY MAKER — CLOUDFLARE AI
    if (isWrite) {
      const prompt = String(
        body.prompt || body.text || body.content || ""
      ).trim();

      if (!prompt) {
        return json({
          error: "Please enter a prompt first."
        }, 400);
      }

      if (prompt.length > 8000) {
        return json({
          error: "Please shorten your request to 8,000 characters or fewer."
        }, 413);
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

      const instructions = isStory
        ? "You are Lenora_AI Story Maker. Write original, engaging stories with vivid scenes, believable characters, natural dialogue, and a satisfying beginning, middle, and ending when appropriate. Produce the story itself, not advice about writing."
        : "You are Lenora_AI Writer, a helpful creative-writing assistant. Produce the actual polished content requested. Follow the user's format, purpose, and tone. Do not merely explain how to create the content.";

      try {
        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            {
              role: "system",
              content: `${instructions}\nRequested tool: ${toolName}\nRequested tone: ${tone}`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 1800
        });

        const generatedText = String(
  result?.response ??
  result?.choices?.[0]?.message?.content ??
  result?.result?.response ??
  ""
).trim();

        if (!generatedText) {
          return json({
            error: "Cloudflare AI returned no text.",
            detail: JSON.stringify(result).slice(0, 500)
          }, 502);
        }

        return json({
          ok: true,
          text: generatedText,
          model: TEXT_MODEL
        });
      } catch (error) {
        return json({
          error: "Cloudflare text generation failed.",
          detail: String(error?.message || error).slice(0, 500),
          hint: "Check Workers AI model availability, account access, and usage limits."
        }, 502);
      }
    }

    // IMAGE STUDIO
    if (isImage) {
      const prompt = String(
        body.prompt || body.text || ""
      ).trim();

      if (!prompt) {
        return json({
          error: "Please describe the image."
        }, 400);
      }

      if (prompt.length > 1500) {
        return json({
          error: "Please shorten the image description to 1,500 characters or fewer."
        }, 413);
      }

      try {
        const result = await env.AI.run(IMAGE_MODEL, {
          prompt,
          num_steps: 4
        });

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
            error: "The image model returned no image.",
            detail: JSON.stringify(result).slice(0, 500),
            hint: "Check image model availability and Workers AI usage limits."
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
          detail: String(error?.message || error).slice(0, 500),
          hint: "Check the image model, AI binding, and Workers AI usage limits."
        }, 502);
      }
    }

    // VOICE STUDIO — PRESERVED
    if (isVoice) {
      const text = String(
        body.text || body.prompt || ""
      ).trim();

      if (!text) {
        return json({
          error: "Please enter text to speak."
        }, 400);
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

        if (
          audio?.audio &&
          typeof audio.audio === "string"
        ) {
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
          detail: String(error?.message || error).slice(0, 500),
          hint: "Check the Aura voice model, AI binding, and usage limits."
        }, 502);
      }
    }
  }
};
