import { backoffDelay, sleep } from "./util";

const GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

const MAX_RETRIES = 3;

/**
 * Synthesize speech via the Google Cloud TTS REST API. Returns MP3 audio.
 */
export async function synthesizeGoogleTts(params: {
  text: string;
  languageCode: string;
  voiceName?: string;
  apiKey: string;
}): Promise<Buffer> {
  const voice: Record<string, string> = { languageCode: params.languageCode };
  if (params.voiceName) {
    voice.name = params.voiceName;
  }

  const payload = {
    input: { text: params.text },
    voice,
    audioConfig: { audioEncoding: "MP3" },
  };

  let lastError = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(
      `${GOOGLE_TTS_URL}?key=${encodeURIComponent(params.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (response.ok) {
      const body: { audioContent?: string } = await response.json();
      if (!body.audioContent) {
        throw new Error("Google TTS returned no audio content");
      }
      return Buffer.from(body.audioContent, "base64");
    }

    lastError = `Google TTS HTTP ${response.status}: ${await response
      .text()
      .catch(() => "")}`;

    switch (response.status) {
      case 429:
      case 500:
      case 503:
        // Retryable: back off and try again
        await sleep(backoffDelay(attempt));
        break;
      default:
        throw new Error(lastError);
    }
  }

  throw new Error(lastError || "Google TTS failed after retries");
}
