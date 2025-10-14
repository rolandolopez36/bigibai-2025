import { describe, it, expect } from 'vitest';

/**
 * Ejemplo de test unitario básico
 * Los tests se organizan con describe() para agrupar y it() para cada caso
 */

describe('Ejemplo de test unitario', () => {
  it('debe sumar dos números correctamente', () => {
    const resultado = 2 + 2;
    expect(resultado).toBe(4);
  });

  it('debe verificar que un array contiene un elemento', () => {
    const frutas = ['manzana', 'pera', 'naranja'];
    expect(frutas).toContain('pera');
  });

  it('debe verificar propiedades de un objeto', () => {
    const usuario = {
      nombre: 'Test User',
      email: 'test@example.com',
      activo: true
    };

    expect(usuario).toHaveProperty('nombre');
    expect(usuario.activo).toBe(true);
  });
});

describe('Ejemplo de test asíncrono', () => {
  it('debe manejar promesas correctamente', async () => {
    const fetchData = async () => {
      return new Promise((resolve) => {
        setTimeout(() => resolve('datos'), 100);
      });
    };

    const result = await fetchData();
    expect(result).toBe('datos');
  });
});
