/**
 * Convert backend LLM messages (litellm format) to Vercel AI SDK UIMessage format.
 */
import type { UIMessage } from 'ai';

interface LLMToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface LLMMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tool_calls?: LLMToolCall[] | null;
  tool_call_id?: string | null;
  name?: string | null;
}

let idCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++idCounter}`;
}

export function llmMessagesToUIMessages(messages: LLMMessage[]): UIMessage[] {
  // Build a map of tool_call_id -> tool result for pairing
  const toolResults = new Map<string, { output: string; isError: boolean }>();
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.tool_call_id) {
      toolResults.set(msg.tool_call_id, {
        output: msg.content || '',
        isError: false,
      });
    }
  }

  const uiMessages: UIMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'tool') continue; // handled via tool_calls pairing

    if (msg.role === 'user') {
      uiMessages.push({
        id: nextId(),
        role: 'user',
        parts: [{ type: 'text', text: msg.content || '' }],
        createdAt: new Date(),
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: UIMessage['parts'] = [];

      if (msg.content) {
        parts.push({ type: 'text', text: msg.content });
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch { /* malformed */ }

          const result = toolResults.get(tc.id);
          parts.push({
            type: 'tool-invocation',
            toolCallId: tc.id,
            toolName: tc.function.name,
            args,
            state: result ? 'result' : 'call',
            ...(result ? { result: result.output } : {}),
          } as UIMessage['parts'][number]);
        }
      }

      uiMessages.push({
        id: nextId(),
        role: 'assistant',
        parts,
        createdAt: new Date(),
      });
    }
  }

  return uiMessages;
}
