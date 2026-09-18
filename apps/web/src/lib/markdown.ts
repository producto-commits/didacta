'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { safeExternalUrl, sanitizeRichHtml } from '@/lib/sanitize-html';

/**
 * Conversor de un subconjunto de Markdown a HTML seguro, para pintar respuestas
 * de IA (Dana, tutor) que suelen venir en Markdown y hoy se veían crudas.
 *
 * Alcance a propósito acotado (lo que produce un LLM en un chat): negrita,
 * cursiva, código en línea y en bloque, enlaces, listas, citas, encabezados y
 * saltos de línea. NO es un parser Markdown completo.
 *
 * Seguridad en dos capas: (1) se escapa TODO el texto antes de tocarlo, así
 * cualquier `<script>` del agente queda como texto; (2) el HTML resultante pasa
 * por `sanitizeRichHtml` (DOMPurify con lista blanca), que es la frontera real.
 */
export function markdownToSafeHtml(md: string): string {
  if (!md) return '';
  // Separa los bloques de código con triple backtick (índices impares).
  const parts = md.split('```');
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const code = parts[i].replace(/^[A-Za-z0-9_-]*\n/, '').replace(/\n$/, '');
      html += `<pre><code>${escapeHtml(code)}</code></pre>`;
    } else {
      html += renderBlocks(parts[i]);
    }
  }
  return sanitizeRichHtml(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bloques: encabezados, citas, listas y párrafos (con `<br>` por salto simple). */
function renderBlocks(src: string): string {
  const lines = escapeHtml(src).split('\n');
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
      para = [];
    }
  };
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '') {
      flushPara();
      i++;
      continue;
    }
    const h = t.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flushPara();
      out.push(`<h3>${renderInline(h[1])}</h3>`);
      i++;
      continue;
    }
    if (/^&gt;\s?/.test(t)) {
      flushPara();
      const q: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i].trim())) {
        q.push(renderInline(lines[i].trim().replace(/^&gt;\s?/, '')));
        i++;
      }
      out.push(`<blockquote>${q.join('<br>')}</blockquote>`);
      continue;
    }
    if (/^[-*+]\s+/.test(t)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    para.push(t);
    i++;
  }
  flushPara();
  return out.join('');
}

/** Estilos en línea sobre texto YA escapado: código, enlaces, negrita, cursiva. */
function renderInline(text: string): string {
  const code: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    code.push(c);
    return `${code.length - 1}`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = safeExternalUrl(url.replace(/&amp;/g, '&'));
    return safe
      ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/(\d+)/g, (_m, i: string) => `<code>${code[Number(i)]}</code>`);
  return s;
}
