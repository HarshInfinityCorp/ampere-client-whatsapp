import { extractIntentLLM } from "./src/services/ai.service";
async function run() {
  try {
    console.log("Calling extractIntentLLM...");
    const intent = await extractIntentLLM("Show me all wanted tickets from yesterday", []);
    console.log("Success:", intent);
  } catch (e: any) {
    console.error("Error:", e);
  }
}
run();
