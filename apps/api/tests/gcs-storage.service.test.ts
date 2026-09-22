import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de @google-cloud/storage: capturamos las llamadas a file()/getSignedUrl()/save().
const h = vi.hoisted(() => {
  const save = vi.fn().mockResolvedValue(undefined);
  const download = vi.fn().mockResolvedValue([Buffer.from('hola')]);
  const del = vi.fn().mockResolvedValue(undefined);
  const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/url']);
  const file = vi.fn(() => ({ save, download, delete: del, getSignedUrl }));
  const bucket = vi.fn(() => ({ file }));
  return { save, download, del, getSignedUrl, file, bucket };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => ({ bucket: h.bucket })),
}));

import { GcsStorageService } from '../src/modules/gcs-storage.service';

describe('GcsStorageService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upload guarda el objeto sin resumable y con contentType', async () => {
    const s = new GcsStorageService({ bucket: 'b' });
    const r = await s.upload('tenants/t/uploads/1-x.png', Buffer.from('x'), 'image/png');
    expect(r.key).toBe('tenants/t/uploads/1-x.png');
    expect(h.file).toHaveBeenCalledWith('tenants/t/uploads/1-x.png');
    expect(h.save).toHaveBeenCalledWith(expect.any(Buffer), {
      resumable: false,
      contentType: 'image/png',
    });
  });

  it('getSignedUrl firma una lectura V4', async () => {
    const s = new GcsStorageService({ bucket: 'b' });
    const url = await s.getSignedUrl('tenants/t/uploads/1-x.png', 3600);
    expect(url).toBe('https://signed.example/url');
    const arg = h.getSignedUrl.mock.calls[0]![0];
    expect(arg).toMatchObject({ version: 'v4', action: 'read' });
    expect(typeof arg.expires).toBe('number');
  });

  it('getUploadUrl firma una escritura V4 con contentType', async () => {
    const s = new GcsStorageService({ bucket: 'b' });
    await s.getUploadUrl('videos/t/x.mp4', 'video/mp4', 3600);
    const arg = h.getSignedUrl.mock.calls[0]![0];
    expect(arg).toMatchObject({ version: 'v4', action: 'write', contentType: 'video/mp4' });
  });

  it('NO implementa multipart (createMultipartUpload undefined)', () => {
    const s = new GcsStorageService({ bucket: 'b' }) as unknown as Record<string, unknown>;
    expect(s['createMultipartUpload']).toBeUndefined();
  });

  it('sanitiza: rechaza traversal, barra inicial y caracteres raros', async () => {
    const s = new GcsStorageService({ bucket: 'b' });
    await expect(s.download('../etc/passwd')).rejects.toThrow(/traversal/);
    await expect(s.download('/abs')).rejects.toThrow(/empezar con/);
    await expect(s.download('bad key!')).rejects.toThrow(/no permitidos/);
  });
});
