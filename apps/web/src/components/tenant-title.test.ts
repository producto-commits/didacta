import { describe, expect, it } from 'vitest';
import { withTenantBrand } from './tenant-title';

/**
 * Regla del producto: "Dropi Academy" nunca aparece solo en el título cuando hay un
 * tenant resuelto — siempre "<Tenant> powered by Dropi Academy".
 */
describe('withTenantBrand', () => {
  it('reemplaza el sufijo genérico por el del tenant', () => {
    expect(withTenantBrand('Iniciar sesión | Dropi Academy', 'Demo')).toBe(
      'Iniciar sesión | Demo powered by Dropi Academy',
    );
  });

  it('el título por defecto (solo "Dropi Academy") pasa a llevar el tenant', () => {
    expect(withTenantBrand('Dropi Academy', 'Demo')).toBe('Demo powered by Dropi Academy');
  });

  it('es idempotente — reaplicar no encadena sufijos', () => {
    const once = withTenantBrand('Iniciar sesión | Dropi Academy', 'Demo');
    expect(withTenantBrand(once, 'Demo')).toBe(once);
  });

  it('no toca títulos que no siguen el template', () => {
    expect(withTenantBrand('Otra cosa', 'Demo')).toBe('Otra cosa');
  });

  it('un tenant llamado "Dropi Academy" no genera "Dropi Academy powered by Dropi Academy"', () => {
    expect(withTenantBrand('Iniciar sesión | Dropi Academy', 'Dropi Academy')).toBe(
      'Iniciar sesión | Dropi Academy',
    );
  });

  it('un nombre en blanco deja el título como estaba', () => {
    expect(withTenantBrand('Iniciar sesión | Dropi Academy', '   ')).toBe(
      'Iniciar sesión | Dropi Academy',
    );
  });

  it('respeta el nombre real del tenant, espacios incluidos', () => {
    expect(withTenantBrand('Mi panel | Dropi Academy', 'Academia Demo')).toBe(
      'Mi panel | Academia Demo powered by Dropi Academy',
    );
  });
});
