// Setup file for Vitest
// Este archivo se ejecuta antes de todos los tests

import { beforeAll, afterEach, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Cargar variables de entorno desde .env manualmente
try {
  const envFile = readFileSync(join(process.cwd(), '.env'), 'utf-8');
  const envVars = envFile.split('\n').reduce((acc, line) => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      const value = values.join('=').trim().replace(/^["']|["']$/g, '');
      acc[key.trim()] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  // Configurar variables de entorno en import.meta.env para Astro
  Object.entries(envVars).forEach(([key, value]) => {
    if (!import.meta.env[key]) {
      // @ts-ignore - Configurar variables de entorno para tests
      import.meta.env[key] = value;
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
} catch (error) {
  console.warn('⚠️  No se pudo cargar .env file:', error);
}

beforeAll(() => {
  // Configuración antes de todos los tests
  console.log('🔧 Test environment configured');
});

afterEach(() => {
  // Limpieza después de cada test
});

afterAll(() => {
  // Limpieza después de todos los tests
});
