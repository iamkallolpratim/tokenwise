export async function fetchWithRetry<T>(url: string, opts: RequestInit = {}, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2 ** i * 100));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface OrderLine { sku: string; quantity: number; unitPriceCents: number }
export const total = (lines: OrderLine[]): number => lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
