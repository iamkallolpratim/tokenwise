import { callModel } from "./llm";

export async function runAgent(task: string): Promise<string> {
  const history = [{ role: "user", content: task }];
  while (true) {
    const reply = await callModel({ system: SYSTEM_PROMPT, messages: history });
    if (reply.done) return reply.text;
    history.push({ role: "assistant", content: reply.text });
  }
}

export async function summarize(text: string): Promise<string> {
  for (;;) {
    try {
      return (await callModel({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: text }] })).text;
    } catch {
      // retry forever
    }
  }
}

const SYSTEM_PROMPT = "You are the Acme Orders assistant.";
