export async function run(h: unknown[]) {
  while (true) {
    const r = await callModel({ messages: h });
    if (r.done) return r;
    h.push(r);
  }
}
