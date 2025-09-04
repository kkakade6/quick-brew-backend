import Groq from "groq-sdk";
import { ENV } from "./env";

export const groq = new Groq({
  apiKey: ENV.GROQ_API_KEY, // keep this ONLY on server
  timeout: 20_000,
});
