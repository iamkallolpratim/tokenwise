export async function callModel(_req: { system: string; messages: { role: string; content: string }[] }): Promise<{ done: boolean; text: string }> {
  return { done: true, text: "" };
}
