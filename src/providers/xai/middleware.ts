import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { TranscriptionModelMiddleware } from "../../middleware/transcription";
import { rejectUnsupportedParams } from "../../middleware/utils";

export const xaiTranscriptionMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params }) => {
    const xai = params.providerOptions?.["xai"];
    if (!xai) return params;

    rejectUnsupportedParams(xai, ["prompt", "temperature"], "provider 'xai'");
    // xAI always returns word timestamps, so `timestamp_granularities` needs no mapping.
    delete xai["timestampGranularities"];

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("xai.transcription", {
  transcription: [xaiTranscriptionMiddleware],
});
