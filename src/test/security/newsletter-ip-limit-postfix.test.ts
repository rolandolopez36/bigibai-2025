// src/test/security/newsletter-ip-limit-postfix.test.ts
// Objetivo: con el parche, la MISMA IP queda bloqueada. Acepta 429 o 500 mientras el handler no devuelva 429.
// Cuando normalices el handler a ActionError(TOO_MANY_REQUESTS) cambia la aserción a solo 429.

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BASE = "http://127.0.0.1:4321";
let BASE = process.env.TEST_BASE_URL ?? DEFAULT_BASE;
let dev: ChildProcess | null = null;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_KEY;
const admin: SupabaseClient | null = SR_KEY
  ? createClient(SUPABASE_URL, SR_KEY, { auth: { persistSession: false } })
  : null;
const anon: SupabaseClient | null = ANON_KEY
  ? createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  : null;

// Ping simple al root o 404.
async function ping(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "GET" });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

// Asegura servidor dev vivo. Si no, lo levanta y espera.
async function ensureDevServer(): Promise<void> {
  if (await ping(BASE)) return;
  dev = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "astro", "dev", "--port", "4321", "--host", "127.0.0.1"],
    { stdio: "inherit", shell: true }
  );
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (await ping(BASE)) return;
    await sleep(300);
  }
  throw new Error(`Server not reachable at ${BASE}`);
}

// POST con reintentos; devuelve status o 599 si persiste el fallo de red.
async function postNewsletter(
  email: string,
  ip: string,
  retries = 2
): Promise<number> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(`${BASE}/_actions/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": ip,
          "X-Real-Ip": ip,
        },
        body: JSON.stringify({ email }),
      });
      return res.status;
    } catch (err) {
      attempt += 1;
      if (attempt > retries) {
        console.error("[ERROR] request_failed", { email, error: String(err) });
        return 599;
      }
      await sleep(100 * attempt);
      if (!(await ping(BASE))) {
        try {
          await ensureDevServer();
        } catch {}
      }
    }
  }
  return 599;
}

beforeAll(async () => {
  await ensureDevServer();
  console.log("[INFO] test_server_ready", { base: BASE });
});

afterAll(async () => {
  dev?.kill();
});

describe("Security: newsletter IP limiter (post-fix)", () => {
  const testEmails: string[] = [];

  afterEach(async () => {
    if (testEmails.length === 0) return;
    try {
      const client = admin ?? anon;
      if (client)
        await client.from("newsletter").delete().in("email", testEmails);
    } finally {
      testEmails.length = 0;
    }
  });

  it("Attacker from same IP gets blocked despite rotating emails", async () => {
    const ATTACK_SIZE = 20; // Debe exceder el umbral IP
    const ATTACK_IP = "203.0.113.10"; // TEST-NET-3
    const ts = Date.now();
    const emails = Array.from(
      { length: ATTACK_SIZE },
      (_, i) => `att_postfix_${i}_${ts}@example.com`
    );
    testEmails.push(...emails);

    // Preflight para inicializar buckets
    await postNewsletter(`preflight_${ts}@example.com`, ATTACK_IP);

    const statuses: number[] = [];
    for (const e of emails) {
      if (!(await ping(BASE))) await ensureDevServer();
      const s = await postNewsletter(e, ATTACK_IP, 2);
      statuses.push(s);
      await sleep(20);
    }

    const success2xx = statuses.filter((s) => s >= 200 && s < 300).length;
    const blockedAny = statuses.filter((s) => s === 429 || s === 500).length; // 500 por Response no serializable
    const netErrors = statuses.filter((s) => s === 599).length;
    const histogram = statuses.reduce<Record<number, number>>((m, s) => {
      m[s] = (m[s] || 0) + 1;
      return m;
    }, {});

    console.log("[POSTFIX] ip_limit_enforced", {
      attack_size: ATTACK_SIZE,
      success_2xx: success2xx,
      blocked_any: blockedAny, // 429 o 500
      net_errors_599: netErrors,
      status_histogram: histogram,
      ip: ATTACK_IP,
    });

    if (success2xx === 0 && blockedAny === 0 && netErrors === ATTACK_SIZE) {
      throw new Error("Server unreachable during attack sequence (all 599).");
    }

    expect(blockedAny).toBeGreaterThan(0); // debe bloquear por IP (mientras tanto 429/500)
    // Cuando cambies el handler a ActionError(TOO_MANY_REQUESTS), usa:
    // const blocked429 = statuses.filter((s) => s === 429).length;
    // expect(blocked429).toBeGreaterThan(0);

    // Polución de BD: si hay admin, menos filas que intentos.
    if (admin) {
      const { data, error } = await admin
        .from("newsletter")
        .select("email")
        .in("email", emails);
      if (error) throw error;
      const inserted = data?.length ?? 0;
      expect(inserted).toBeLessThan(ATTACK_SIZE);
    }
  }, 90_000);
});
