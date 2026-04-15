import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type { FunctionTool } from "openai/resources/responses/responses";

const WEATHER_PARAMS = {
  type: "object" as const,
  properties: {
    location: { type: "string", description: "City and state" },
  },
  required: ["location"],
};

const CALCULATOR_PARAMS = {
  type: "object" as const,
  properties: {
    expression: { type: "string", description: "A math expression, e.g. 2+2" },
  },
  required: ["expression"],
};

export const CHAT_WEATHER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a given location.",
    parameters: WEATHER_PARAMS,
  },
};

export const CHAT_CALCULATOR_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "calculator",
    description: "Perform basic arithmetic. Returns the numeric result.",
    parameters: CALCULATOR_PARAMS,
  },
};

export const RESPONSE_WEATHER_TOOL: FunctionTool = {
  type: "function",
  name: "get_weather",
  description: "Get the current weather for a given location.",
  strict: false,
  parameters: WEATHER_PARAMS,
};

export const RESPONSE_CALCULATOR_TOOL: FunctionTool = {
  type: "function",
  name: "calculator",
  description: "Perform basic arithmetic. Returns the numeric result.",
  strict: false,
  parameters: CALCULATOR_PARAMS,
};

export const MESSAGE_WEATHER_TOOL: Anthropic.Messages.Tool = {
  name: "get_weather",
  description: "Get the current weather for a given location.",
  input_schema: WEATHER_PARAMS,
};

export const MESSAGE_CALCULATOR_TOOL: Anthropic.Messages.Tool = {
  name: "calculator",
  description: "Perform basic arithmetic. Returns the numeric result.",
  input_schema: CALCULATOR_PARAMS,
};
