import OpenAI from "openai";
import { config } from "../config";
import { QueryIntent } from "../types";
import { ChatMessage } from "../utils/memory.util";

export function getAIClient(): OpenAI {
  if (config.geminiApiKey) {
    return new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: config.geminiApiKey,
    });
  }
  return new OpenAI({
    baseURL: config.openclawBaseUrl,
    apiKey: config.openclawApiKey || "no-key",
  });
}

export function getAIModel(): string {
  if (config.geminiApiKey) return "gemini-2.0-flash";
  return config.aiModel;
}

/**
 * Robustly parses a JSON object out of an LLM string,
 * ignoring any markdown formatting, preamble, or trailing text.
 */
function extractJSONFromLLM(text: string): any {
  // Strip Markdown code blocks if present
  let cleanText = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // Find the first '{' and last '}'
  const startIdx = cleanText.indexOf('{');
  const endIdx = cleanText.lastIndexOf('}');

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleanText = cleanText.slice(startIdx, endIdx + 1);
  }

  return JSON.parse(cleanText);
}

/**
 * Uses the OpenAI SDK to extract structured search intents from a natural language query.
 * Designed to be completely model-agnostic.
 */
export async function extractIntentLLM(question: string, history: ChatMessage[] = []): Promise<QueryIntent> {
  const systemPrompt = `You are a ticket trading search parser.
Your exact job is to analyze the user's message and determine what they want.
You MUST reply with ONLY a raw JSON object. Do not include greetings, explanations, or any other text.
Use the following strict JSON schema:

{
  "type": "search" | "stats" | "list_available" | "list_wanted" | "general" | "unknown",
  "event": "string or null",
  "area": "string or null",
  "status": "available" | "wanted" | null,
  "timeframe": "today" | "yesterday" | "this_week" | "all_time" | null,
  "max_price": number | null,
  "min_quantity": number | null
}

Guidelines:
- SYNONYMS: "Selling", "Seller", "Available", "For Sale" -> status="available"
- SYNONYMS: "Buying", "Buyer", "Wanted", "Looking For", "Need" -> status="wanted"
- TIMEFRAMES: Look for "today", "yesterday", "this week" -> timeframe
- PRICING: "under 100", "max 50", "cheaper than 200" -> max_price (just the number)
- QUANTITY: "3 seats together", "I need 2", "pair" -> min_quantity (e.g. 3, 2, 2)
- If asking for overall/general stats (e.g. "how many today", "sales overall"): type="stats"
- If searching for a team/event or asking for stats ABOUT a specific event (e.g. "who has liverpool?", "how many liverpool tickets?"): type="search", event="<team name>"
- If asking for available tickets/selling: type="list_available", status="available"
- If asking for wanted/looking for: type="list_wanted", status="wanted"
- If they mention seating areas like "kop", "lower", "block 95": type="search", area="<area>"

Example 1 (Single message): "any 1 selling arsnl tix in the lower tiers under 150 today?"
{"type": "search", "event": "arsenal", "area": "lower", "status": "available", "timeframe": "today", "max_price": 150, "min_quantity": null}

Example 2 (Looking for buyers): "who is buying 3 liverpool tickets together?"
{"type": "search", "event": "liverpool", "area": null, "status": "wanted", "timeframe": null, "max_price": null, "min_quantity": 3}

Example 3 (Conversational Follow-up):
History: User asked "Find me Chelsea tickets" -> Assistant answered "Found 5..."
User asks: "Which of those are cheapest?"
{"type": "search", "event": "chelsea", "area": null, "status": null}

Follow up queries: If the user sends a message like "just the ones in block 202" or "how much are they?", look at the conversation history provided below to infer which EVENT they are currently talking about!
CRITICAL RULE: If the user changes the subject completely or asks a global command (e.g., "show me all wanted tickets", "how many today?", "what else is available?"), you MUST clear the previous event context. Do NOT carry over the old event name into the new intent.

Output ONLY valid JSON.`;

  try {
    const client = getAIClient();
    const model = getAIModel();

    console.log(`[AI Intent] Extracting intent for: "${question}"`);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
      temperature: 0.1,
    });

    const outputText = response.choices[0]?.message?.content?.trim();
    console.log(`[AI Intent] Raw AI response: ${outputText}`);

    if (!outputText) throw new Error("Empty response from AI intent extraction");

    const parsed = extractJSONFromLLM(outputText);
    
    const intent: QueryIntent = {
      type: parsed.type || "unknown",
      event: parsed.event || undefined,
      area: parsed.area || undefined,
      status: parsed.status || undefined,
      timeframe: parsed.timeframe || undefined,
      max_price: parsed.max_price || undefined,
      min_quantity: parsed.min_quantity || undefined
    };

    console.log(`[AI Intent] Parsed intent:`, JSON.stringify(intent));
    return intent;
  } catch (error: any) {
    console.error("[AI Service] Intent extraction failed:", error.message);
    console.log("[AI Service] Falling back to keyword-based extraction...");
    return extractIntentFromKeywords(question);
  }
}

/**
 * Simple keyword-based fallback when AI is unavailable.
 * Extracts the most meaningful word from the question as a search term.
 */
function extractIntentFromKeywords(question: string): QueryIntent {
  const q = question.toLowerCase().trim();

  // Stats queries (only if no specific event mentioned)
  if (/^(stats|summary|report|how many today|overview)/.test(q)) {
    return { type: "stats" };
  }

  // Remove noise words to find the actual search term
  const noise = ["show", "find", "get", "give", "me", "the", "a", "an", "any",
    "all", "tickets", "ticket", "tix", "details", "for", "of", "in", "is",
    "are", "there", "have", "we", "how", "many", "what", "who", "selling",
    "available", "wanted", "looking", "please", "can", "you", "i", "want"];

  const words = q.split(/\s+/).filter((w) => !noise.includes(w) && w.length > 2);

  if (words.length > 0) {
    const keyword = words.join(" ");
    console.log(`[AI Fallback] Keyword search for: "${keyword}"`);
    return { type: "search", event: keyword };
  }

  // Check for status
  if (/sell|avail/i.test(q)) return { type: "list_available", status: "available" };
  if (/want|look|need|buy|buyer/i.test(q)) return { type: "list_wanted", status: "wanted" };

  return { type: "general" };
}
