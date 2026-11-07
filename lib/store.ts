// Minimal key/value storage interface. In-memory by default; Upstash Redis (REST)
// when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL/TOKEN) are set.
// Routes only talk to this interface, so swapping backends never touches routes.

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hset(key: string, field: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  rpush(key: string, value: string): Promise<number>; // returns new length
  lrange(key: string): Promise<string[]>;
  incr(key: string): Promise<number>;
  del(keys: string[]): Promise<void>;
}

class MemoryStore implements Store {
  kv = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  lists = new Map<string, string[]>();
  async get(k: string) { return this.kv.get(k) ?? null; }
  async set(k: string, v: string) { this.kv.set(k, v); }
  async hset(k: string, f: string, v: string) {
    if (!this.hashes.has(k)) this.hashes.set(k, new Map());
    this.hashes.get(k)!.set(f, v);
  }
  async hget(k: string, f: string) { return this.hashes.get(k)?.get(f) ?? null; }
  async hgetall(k: string) { return Object.fromEntries(this.hashes.get(k) ?? []); }
  async rpush(k: string, v: string) {
    if (!this.lists.has(k)) this.lists.set(k, []);
    return this.lists.get(k)!.push(v);
  }
  async lrange(k: string) { return [...(this.lists.get(k) ?? [])]; }
  async incr(k: string) {
    const n = Number(this.kv.get(k) ?? 0) + 1;
    this.kv.set(k, String(n));
    return n;
  }
  async del(keys: string[]) {
    for (const k of keys) { this.kv.delete(k); this.hashes.delete(k); this.lists.delete(k); }
  }
}

class UpstashStore implements Store {
  constructor(private url: string, private token: string) {}
  private async cmd(args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) throw new Error(`upstash: ${json.error}`);
    return json.result;
  }
  async get(k: string) { return (await this.cmd(["GET", k])) as string | null; }
  async set(k: string, v: string) { await this.cmd(["SET", k, v]); }
  async hset(k: string, f: string, v: string) { await this.cmd(["HSET", k, f, v]); }
  async hget(k: string, f: string) { return (await this.cmd(["HGET", k, f])) as string | null; }
  async hgetall(k: string) {
    const arr = ((await this.cmd(["HGETALL", k])) as string[] | null) ?? [];
    const out: Record<string, string> = {};
    for (let i = 0; i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
    return out;
  }
  async rpush(k: string, v: string) { return (await this.cmd(["RPUSH", k, v])) as number; }
  async lrange(k: string) { return ((await this.cmd(["LRANGE", k, 0, -1])) as string[] | null) ?? []; }
  async incr(k: string) { return (await this.cmd(["INCR", k])) as number; }
  async del(keys: string[]) { if (keys.length) await this.cmd(["DEL", ...keys]); }
}

const g = globalThis as unknown as { __gcStore?: Store };

export function store(): Store {
  if (!g.__gcStore) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    g.__gcStore = url && token ? new UpstashStore(url, token) : new MemoryStore();
  }
  return g.__gcStore;
}

export function storeKind(): "upstash" | "memory" {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  return url ? "upstash" : "memory";
}
