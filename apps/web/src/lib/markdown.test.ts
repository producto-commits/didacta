// @vitest-environment jsdom

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { markdownToSafeHtml as md, renderChatContent } from './markdown';

describe('markdownToSafeHtml', () => {
  it('vacío → vacío', () => {
    expect(md('')).toBe('');
  });
  it('negrita y cursiva', () => {
    expect(md('Hola **mundo**')).toBe('<p>Hola <strong>mundo</strong></p>');
    expect(md('un *dato* clave')).toBe('<p>un <em>dato</em> clave</p>');
  });
  it('lista con guiones', () => {
    expect(md('- uno\n- dos')).toBe('<ul><li>uno</li><li>dos</li></ul>');
  });
  it('lista numerada', () => {
    expect(md('1. uno\n2. dos')).toBe('<ol><li>uno</li><li>dos</li></ol>');
  });
  it('encabezado a h3 y párrafos', () => {
    expect(md('# Título\n\nun párrafo')).toBe('<h3>Título</h3><p>un párrafo</p>');
  });
  it('código en línea y bloque', () => {
    expect(md('usa `npm test`')).toBe('<p>usa <code>npm test</code></p>');
    expect(md('```\ncode();\n```')).toBe('<pre><code>code();</code></pre>');
  });
  it('los números del texto no se convierten en código', () => {
    // Regresión: un marcador de código mal restaurado convertía cualquier dígito.
    expect(md('Atendemos 10 países con `Dana`')).toBe(
      '<p>Atendemos 10 países con <code>Dana</code></p>',
    );
  });
  it('enlace http válido; esquema peligroso queda como texto', () => {
    const link = md('[Dropi](https://dropi.co)');
    expect(link).toContain('href="https://dropi.co');
    expect(link).toContain('rel="noopener noreferrer">Dropi</a>');
    // javascript: no pasa safeExternalUrl → se queda el texto de la etiqueta
    const out = md('[x](javascript:alert(1))');
    expect(out).not.toContain('javascript');
    expect(out).toContain('x');
  });
  it('escapa HTML del agente (no inyecta un elemento real)', () => {
    const out = md('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img'); // queda como texto escapado &lt;img…, no como etiqueta
    expect(out).toContain('&lt;img');
  });
  it('quita etiquetas peligrosas pero deja el texto', () => {
    const out = md('hola <script>alert(1)</script> mundo');
    expect(out).not.toContain('<script');
    expect(out).toContain('hola');
    expect(out).toContain('mundo');
  });
  it('respeta saltos de línea dentro de un párrafo', () => {
    expect(md('línea uno\nlínea dos')).toBe('<p>línea uno<br>línea dos</p>');
  });
});

describe('renderChatContent', () => {
  it('respuesta en HTML del agente se renderiza como HTML (no muestra las etiquetas)', () => {
    const out = renderChatContent('<p>¡Hola! 👋 Bienvenido a Dropi Academy.</p>');
    expect(out).toBe('<p>¡Hola! 👋 Bienvenido a Dropi Academy.</p>');
    expect(out).not.toContain('&lt;p&gt;');
  });
  it('HTML con formato permitido pasa; lo peligroso se elimina', () => {
    const out = renderChatContent('<p>Mira <strong>esto</strong><script>alert(1)</script></p>');
    expect(out).toContain('<strong>esto</strong>');
    expect(out).not.toContain('<script');
  });
  it('sin etiquetas HTML, cae al conversor de markdown', () => {
    expect(renderChatContent('Hola **mundo**')).toBe('<p>Hola <strong>mundo</strong></p>');
  });
  it('vacío → vacío', () => {
    expect(renderChatContent('')).toBe('');
  });
});
