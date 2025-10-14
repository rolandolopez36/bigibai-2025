# 🔒 Tests de Seguridad

Este directorio contiene tests end-to-end diseñados para validar vulnerabilidades de seguridad y verificar que las soluciones propuestas funcionan correctamente.

## 🔴 Vulnerabilidad: Rate Limit Evadible

### Descripción del Problema

El sistema actual de rate limiting tiene una vulnerabilidad crítica:

- **Identificador:** Solo usa el email
- **Límite:** 5 intentos por hora POR EMAIL
- **Vulnerabilidad:** Un atacante puede evadir el límite usando diferentes emails
- **Severidad:** 🔴 ALTA
- **Probabilidad:** >90% en producción

### Impacto

1. **Spam masivo** - Registro ilimitado de emails en la base de datos
2. **Costos elevados** - Consumo excesivo de cuota Redis/Supabase
3. **Degradación del servicio** - Posible saturación de la base de datos

---

## 🧪 Ejecutar Tests de Seguridad

### Test 1: Validar Vulnerabilidad (Rotación de emails)

Este test intenta registrar 10 emails diferentes para demostrar que el rate limit es evadible:

```bash
pnpm test:e2e e2e/security/rate-limit-vulnerability.spec.ts -g "debe permitir múltiples suscripciones"
```

**Resultado esperado (CON vulnerabilidad):**
```
✅ Email 1 registrado: attacker1@tempmail.com
✅ Email 2 registrado: attacker2@tempmail.com
✅ Email 3 registrado: attacker3@tempmail.com
...
✅ Email 10 registrado: attacker10@tempmail.com

🔴 VULNERABILIDAD CONFIRMADA:
   Se esperaba máximo 5 registros por hora
   Se lograron 10 registros
   La rotación de emails elude el rate limit
```

---

### Test 2: Verificar Rate Limit por Email (Funciona)

Este test verifica que el rate limit POR EMAIL sí funciona correctamente:

```bash
pnpm test:e2e e2e/security/rate-limit-vulnerability.spec.ts -g "debe bloquear el mismo email"
```

**Resultado esperado:**
```
Intento 1: ¡Te has suscrito a la newsletter!
Intento 2: ¡Este usuario ya estaba en la newsletter!
Intento 3: ¡Este usuario ya estaba en la newsletter!
Intento 4: ¡Este usuario ya estaba en la newsletter!
Intento 5: ¡Este usuario ya estaba en la newsletter!
Intento 6: Demasiados intentos. Intenta de nuevo en X minutos
✅ Rate limit activado en el intento 6

✅ El rate limit POR EMAIL funciona correctamente
```

---

### Test 3: DEMO - Ataque Simulado (⚠️ Ejecutar con precaución)

Este test está deshabilitado por defecto (`test.skip`) para no saturar Redis.

Para ejecutarlo manualmente (solo en desarrollo):

```bash
# Descomentar test.skip en el archivo primero
pnpm test:e2e e2e/security/rate-limit-vulnerability.spec.ts -g "DEMO: Simular ataque"
```

**⚠️ ADVERTENCIA:** Este test registra 20 emails en la base de datos.

---

## 🛡️ Solución Propuesta

### Implementación de Rate Limit por IP

**Código actual (vulnerable):**
```typescript
// src/actions/index.ts
async handler({ email }) {
  const rateLimitResult = await RateLimitPresets.strict(email);
  // ...
}
```

**Código propuesto (seguro):**
```typescript
// src/actions/index.ts
async handler({ email }, context) {
  // Obtener IP del cliente
  const clientIp = context.clientAddress ||
                   context.request.headers.get('x-forwarded-for') ||
                   'unknown';

  // Rate limit por IP (10 por hora)
  const ipLimit = await checkRateLimit({
    identifier: \`ip:\${clientIp}\`,
    limit: 10,
    windowMs: 3_600_000 // 1 hora
  });

  if (!ipLimit.success) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: getRateLimitMessage(ipLimit.reset)
    });
  }

  // Rate limit por email (5 por hora)
  const emailLimit = await RateLimitPresets.strict(email);

  if (!emailLimit.success) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: getRateLimitMessage(emailLimit.reset)
    });
  }

  // ... resto del código
}
```

---

## 📊 Verificar la Solución

Una vez implementada la solución, ejecuta el test que actualmente está en skip:

```bash
pnpm test:e2e e2e/security/rate-limit-vulnerability.spec.ts -g "debe limitar por IP"
```

**Resultado esperado (CON la solución):**
```
Intento 1-10: ✅ Exitosos
Intento 11: 🔒 Bloqueado por IP
✅ Bloqueado por IP en el intento 11

Test PASSED ✅
```

---

## 🔍 Análisis de Resultados

### Cómo interpretar los resultados

| Métrica | Sin Protección | Con Protección IP |
|---------|----------------|-------------------|
| Emails registrados (10 intentos) | 10 | ~5-10* |
| Emails registrados (20 intentos) | 20 | ~10 |
| Bloqueado por IP | ❌ No | ✅ Sí (después de 10) |
| Bloqueado por email | ✅ Sí (5/email) | ✅ Sí (5/email) |

\* Depende de cuántos emails únicos se usen

---

## 🚨 Recomendaciones de Seguridad

### Corto Plazo (Inmediato)
1. ✅ Implementar rate limit por IP
2. ✅ Reducir límite global a 10 por hora por IP
3. ✅ Agregar logging de intentos sospechosos

### Mediano Plazo
1. 🔄 Implementar CAPTCHA (hCaptcha/reCAPTCHA)
2. 🔄 Detectar patrones de emails temporales
3. 🔄 Implementar honeypot fields

### Largo Plazo
1. 📊 Monitoreo y alertas de actividad sospechosa
2. 🤖 Machine learning para detectar bots
3. 🌐 WAF (Web Application Firewall)

---

## 📚 Referencias

- [OWASP: Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html#rate-limiting)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [Astro Actions Context](https://docs.astro.build/en/reference/api-reference/#context)

---

## ⚠️ Notas Importantes

- Los tests de seguridad NO deben ejecutarse en producción
- Ejecuta estos tests solo en entornos de desarrollo/staging
- Limpia la base de datos de emails de prueba después de ejecutar los tests
- Los emails de prueba usan el patrón `attacker*@tempmail.com` y `attack-demo-*@evil.com`

---

## 🧹 Limpieza después de los tests

Si ejecutaste los tests de seguridad, limpia los emails de prueba:

```sql
-- En Supabase SQL Editor
DELETE FROM newsletter_emails
WHERE email LIKE 'attacker%@tempmail.com'
   OR email LIKE 'attack-demo-%@evil.com'
   OR email LIKE 'test-rate-limit-%@example.com';
```

---

**Última actualización:** 2025-10-12
**Mantenedor:** Security Testing Team
