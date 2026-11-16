import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { wordSegmentsMiddleware } from "../../middleware/transcription.ts";

// xAI returns word timings only, which the AI SDK exposes as `segments`.
modelMiddlewareMatcher.useForProvider("xai.transcription", {
  transcription: [wordSegmentsMiddleware],
});
