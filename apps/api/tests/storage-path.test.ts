import { describe, expect, it } from 'vitest';
import { extractStorageKey, storageAssetPath } from '../src/modules/storage-path';

describe('storageAssetPath', () => {
  it('construye la ruta estable a partir de la key', () => {
    expect(storageAssetPath('tenants/t1/uploads/1-x.webp')).toBe(
      '/api/v1/storage/file/tenants/t1/uploads/1-x.webp',
    );
  });
  it('no duplica la barra inicial', () => {
    expect(storageAssetPath('/tenants/t1/x.png')).toBe('/api/v1/storage/file/tenants/t1/x.png');
  });
});

describe('extractStorageKey', () => {
  it('saca la key de una ruta estable', () => {
    expect(extractStorageKey('/api/v1/storage/file/tenants/t1/uploads/1-x.webp')).toBe(
      'tenants/t1/uploads/1-x.webp',
    );
  });
  it('saca la key de una URL S3 pre-firmada antigua (ignora el query de la firma)', () => {
    const signed =
      'https://minio.example.host/bucket/tenants/t1/uploads/1-x.webp?X-Amz-Signature=abc&X-Amz-Expires=900';
    expect(extractStorageKey(signed)).toBe('tenants/t1/uploads/1-x.webp');
  });
  it('devuelve null para una imagen externa (no es de nuestro storage)', () => {
    expect(extractStorageKey('https://cdn.otro.com/foto.jpg')).toBeNull();
  });
  it('vacío → null', () => {
    expect(extractStorageKey('')).toBeNull();
  });
});
