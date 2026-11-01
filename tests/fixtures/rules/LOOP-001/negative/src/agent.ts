export async function run(h: unknown[]) {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const r = await callModel({ messages: h });
    if (r.done) return r;
    h.push(r);
  }
}
while (true) {
  tick();
}
