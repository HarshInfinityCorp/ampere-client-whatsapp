type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

interface MemoryEntry {
  messages: ChatMessage[];
  lastUpdated: number;
}

// In-memory store
const chatCache = new Map<string, MemoryEntry>();

const MAX_HISTORY = 6; // Keep last 3 pairs of turns
const TTL_MS = 15 * 60 * 1000; // 15 minutes context expiry

export function getChatHistory(phone: string): ChatMessage[] {
  const entry = chatCache.get(phone);
  if (!entry) return [];

  // Wipe memory if too old
  if (Date.now() - entry.lastUpdated > TTL_MS) {
    chatCache.delete(phone);
    return [];
  }

  return entry.messages;
}

export function addMessageToHistory(phone: string, role: Role, content: string): void {
  const entry = chatCache.get(phone) || { messages: [], lastUpdated: 0 };
  
  entry.messages.push({ role, content });
  
  // Cap at 6 interactions (sliding window)
  if (entry.messages.length > MAX_HISTORY) {
    entry.messages = entry.messages.slice(-MAX_HISTORY);
  }
  
  entry.lastUpdated = Date.now();
  chatCache.set(phone, entry);
}

export function clearChatHistory(phone: string): void {
  chatCache.delete(phone);
}
