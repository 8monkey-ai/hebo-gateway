import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { wordSegmentsMiddleware } from "../../middleware/transcription";

// xAI returns word timings only, which the AI SDK exposes as `segments`.
modelMiddlewareMatcher.useForProvider("xai.transcription", {
  transcription: [wordSegmentsMiddleware],
});
