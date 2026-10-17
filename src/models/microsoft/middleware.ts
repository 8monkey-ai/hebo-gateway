import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { TranscriptionModelMiddleware } from "../../middleware/transcription";

// MAI-Transcribe is served by the Azure Speech API (not Azure OpenAI deployments), so it
// selects that API explicitly and maps the OpenAI transcription params to its options.
export const maiTranscribeMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params }) => {
    const unknown = ((params.providerOptions ??= {})["unknown"] ??= {});

    unknown["api"] = "speech";

    const language = unknown["language"];
    if (language !== undefined) {
      unknown["locales"] = [language];
      delete unknown["language"];
    }

    // FUTURE: Use shared SDK timing options instead: https://github.com/vercel/ai/issues/23486
    const granularities = unknown["timestamp_granularities"] as string[] | undefined;
    if (granularities !== undefined) {
      unknown["timestamps"] = granularities.includes("word") ? "word" : "segment";
      delete unknown["timestamp_granularities"];
    }

    return params;
  },
};

modelMiddlewareMatcher.useForModel("microsoft/mai-transcribe-*", {
  transcription: [maiTranscribeMiddleware],
});
