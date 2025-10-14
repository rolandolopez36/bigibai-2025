import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4321";
let dev: ChildProcess | null = null;

// Supabase admin client para verificar polución de BD (usar claves en .env.test)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = SR_KEY
  ? createClient(SUPABASE_URL, SR_KEY, { auth: { persistSession: false } })
  : null;

// Espera a que astro dev responda
async function waitForServer(url: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`Server not reachable at ${url}`);
}

// Espera a que las filas sean visibles (bypass RLS con service role)
async function waitForRowsInNewsletter(emails: string[], timeoutMs = 8000) {
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set for tests");
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { data, error } = await admin
      .from("newsletter")
      .select("email")
      .in("email", emails);
    if (error) throw error;
    if ((data?.length ?? 0) === emails.length) return data!;
    await sleep(200);
  }
  throw new Error("Rows not visible after wait");
}

beforeAll(async () => {
  try {
    await waitForServer(BASE, 1500);
  } catch {
    dev = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "astro", "dev", "--port", "4321", "--host", "127.0.0.1"],
      { stdio: "inherit", shell: true }
    );
    await waitForServer(BASE, 20000);
  }
});

afterAll(async () => {
  dev?.kill();
});

/**
 * Suite de pruebas de seguridad para detectar vulnerabilidades de bypass
 * en el sistema de rate limiting del newsletter
 *
 * PROPÓSITO: Validar que el sistema actual es vulnerable a ataques de evasión
 * de límites de velocidad, documentando las fallas para justificar la implementación
 * de las mitigaciones propuestas (rate limiting por email, IP y global).
 */
describe("Security: newsletter rate-limit bypass (team code)", () => {
  const testEmails: string[] = [];

  afterEach(async () => {
    if (testEmails.length === 0) return;
    try {
      if (admin) {
        await admin.from("newsletter").delete().in("email", testEmails);
      } else {
        // Mejor esfuerzo sin service role; puede fallar por RLS.
        const anonUrl = process.env.SUPABASE_URL!;
        const anonKey = process.env.SUPABASE_KEY!;
        const anon = createClient(anonUrl, anonKey, {
          auth: { persistSession: false },
        });
        await anon.from("newsletter").delete().in("email", testEmails);
      }
    } finally {
      testEmails.length = 0;
    }
  });

  /**
   * VULNERABILIDAD CRÍTICA: Evasión de rate limiting por rotación de emails únicos
   *
   * QUÉ VALIDA:
   * - Que un atacante puede generar múltiples emails únicos para evadir el límite por email
   * - Que el sistema actual NO implementa rate limiting por IP o global
   * - Que se pueden hacer más de 5 suscripciones (límite teórico) sin recibir error 429
   *
   * ESCENARIO DE ATAQUE:
   * Un atacante automatizado genera 50 emails únicos desde la misma IP y los envía
   * simultáneamente. Como el rate limiting actual solo considera el email específico,
   * cada email único es tratado como un usuario diferente, permitiendo el bypass.
   *
   * IMPACTO:
   * - Saturación de la base de datos con emails falsos
   * - Posible sobrecarga del servicio de email
   * - Evasión completa de los controles de velocidad implementados
   */
  it("CVE: rotating unique emails bypasses per-email limiter", async () => {
    // Importante: usar dominios NO desechables para pasar validaciones.
    const ATTACK_SIZE = 50;
    const RATE_LIMIT = 5;
    const ts = Date.now();

    const attackEmails = Array.from(
      { length: ATTACK_SIZE },
      (_, i) => `attacker${i}_${ts}@example.com`
    );
    testEmails.push(...attackEmails);

    const responses = await Promise.all(
      attackEmails.map((email) =>
        fetch(`${BASE}/_actions/newsletter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).then((res) => ({ status: res.status }))
      )
    );

    const statuses = responses.map((r) => r.status);
    const histogram = statuses.reduce<Record<number, number>>((m, s) => {
      m[s] = (m[s] || 0) + 1;
      return m;
    }, {});
    console.log("[BYPASS] status_histogram", histogram);

    const successCount = statuses.filter((s) => s >= 200 && s < 300).length;
    const blockedCount = statuses.filter((s) => s === 429).length;

    // EVIDENCIA DE VULNERABILIDAD:
    // Si el test pasa, confirma que:
    // 1. Se procesaron más suscripciones que el límite teórico por email (5)
    // 2. No hubo ningún bloqueo (status 429), demostrando bypass completo
    expect(successCount).toBeGreaterThan(RATE_LIMIT);
    expect(blockedCount).toBe(0);
  }, 60000);

  /**
   * IMPACTO EN BASE DE DATOS: Contaminación verificable tras el ataque
   *
   * QUÉ VALIDA:
   * - Que los emails maliciosos se almacenan exitosamente en la base de datos
   * - Que no hay validaciones adicionales que prevengan la contaminación masiva
   * - Que el ataque tiene consecuencias persistentes y medibles
   *
   * PROPÓSITO:
   * Demostrar el impacto real del ataque mostrando que los datos falsos
   * permanecen en el sistema, causando contaminación de la base de datos
   * y potencial degradación del servicio de newsletter legítimo.
   */
  it("CVE: database pollution is observable after the attack", async () => {
    const ts = Date.now();
    const pollutionEmails = Array.from(
      { length: 10 },
      (_, i) => `pollution${i}_${ts}@example.net`
    );
    testEmails.push(...pollutionEmails);

    await Promise.all(
      pollutionEmails.map((email) =>
        fetch(`${BASE}/_actions/newsletter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
      )
    );

    if (!admin) {
      console.warn(
        "[INFO] SKIP DB verification: SUPABASE_SERVICE_ROLE_KEY not set"
      );
      return;
    }

    // VERIFICACIÓN DE CONTAMINACIÓN:
    // Confirma que todos los emails maliciosos se guardaron exitosamente
    const rows = await waitForRowsInNewsletter(pollutionEmails, 8000);
    expect(rows).toHaveLength(pollutionEmails.length);
  }, 30000);

  /**
   * LÍNEA BASE: Ausencia de protección por IP antes de implementar la corrección
   *
   * QUÉ VALIDA:
   * - Que el sistema actual NO implementa rate limiting por dirección IP
   * - Que múltiples requests desde la misma IP no generan bloqueos automáticos
   * - Que la vulnerabilidad persiste incluso cuando se simula el header X-Forwarded-For
   *
   * CONTEXTO:
   * Este test establece la línea base del comportamiento actual, confirmando
   * que la falta de rate limiting por IP es una deficiencia real del sistema
   * que debe ser abordada por las nuevas implementaciones de mitigación.
   */
  it("Baseline before IP fix: no blocking when rotating from same IP", async () => {
    // EXPECTATIVA: El código actual no limita por IP, por lo que no debe haber
    // bloqueos 429 aunque todos los requests vengan de la misma dirección IP
    const ts = Date.now();
    const emails = Array.from(
      { length: 20 },
      (_, i) => `user${i}_${ts}@example.org`
    );
    testEmails.push(...emails);

    const responses = await Promise.all(
      emails.map((email) =>
        fetch(`${BASE}/_actions/newsletter`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "192.168.1.100",
          },
          body: JSON.stringify({ email }),
        })
      )
    );

    // CONFIRMACIÓN DE VULNERABILIDAD POR IP:
    // Si no hay bloqueos, confirma que el rate limiting por IP no está implementado
    const blocked = responses.filter((r) => r.status === 429).length;
    expect(blocked).toBe(0);
  }, 60000);
});
