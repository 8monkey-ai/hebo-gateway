import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { TranscriptionModelMiddleware } from "../../middleware/transcription";
import { rejectUnsupportedParams } from "../../middleware/utils";

// MAI-Transcribe is served by the Azure Speech API (not Azure OpenAI deployments), so it
// selects that API explicitly and maps the OpenAI transcription params to its options.
export const maiTranscribeMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params, model }) => {
    const unknown = ((params.providerOptions ??= {})["unknown"] ??= {});
    rejectUnsupportedParams(unknown, ["prompt", "temperature"], `model '${model.modelId}'`);

    unknown["api"] = "speech";

    const language = unknown["language"];
    if (language !== undefined) {
      unknown["locales"] = [language];
      delete unknown["language"];
    }

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
