export async function run(items: string[]) {
  const out = [];
  for (const item of items) {
    out.push(await callModel({ system: CONTEXT, messages: [{ role: "user", content: question }] }));
  }
  return out;
}
