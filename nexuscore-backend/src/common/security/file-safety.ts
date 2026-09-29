import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Response } from 'express';

// Shared upload validation + safe download serving for every stored-file route.
//
// Never trusts the uploader's declared MIME type: the type is derived from the file extension and
// cross-checked against the file's own leading bytes ("magic numbers"). Only raster images and PDF
// are ever served inline; everything else is a download, and anything that could be interpreted as
// active content (HTML, SVG, XML, script) is served as application/octet-stream.

export const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Upload size limit in bytes (UPLOAD_MAX_MB, default 10). */
export function uploadMaxBytes(): number {
  const mb = Number(process.env.UPLOAD_MAX_MB);
  return Number.isFinite(mb) && mb > 0 ? Math.floor(mb * 1024 * 1024) : DEFAULT_UPLOAD_MAX_BYTES;
}

type Kind = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'pdf' | 'zip' | 'ole' | 'text';

function sniff(buf: Buffer): Kind | null {
  if (!buf || buf.length < 4) return buf && buf.length ? (looksLikeText(buf) ? 'text' : null) : null;
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (b.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip'; // docx/xlsx/pptx
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole'; // doc/xls/ppt
  return looksLikeText(buf) ? 'text' : null;
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  return !sample.includes(0);
}

function looksLikeMarkup(buf: Buffer): boolean {
  const head = buf.subarray(0, 2048).toString('utf8').trimStart().toLowerCase();
  return /^(<!doctype|<html|<script|<svg|<\?xml|<head|<body|<iframe|<object|<embed)/.test(head) || /<script[\s>]/.test(head);
}

interface Rule { mime: string; kinds: Kind[] }
const UPLOAD_RULES: Record<string, Rule> = {
  png: { mime: 'image/png', kinds: ['png'] },
  jpg: { mime: 'image/jpeg', kinds: ['jpeg'] },
  jpeg: { mime: 'image/jpeg', kinds: ['jpeg'] },
  gif: { mime: 'image/gif', kinds: ['gif'] },
  webp: { mime: 'image/webp', kinds: ['webp'] },
  bmp: { mime: 'image/bmp', kinds: ['bmp'] },
  pdf: { mime: 'application/pdf', kinds: ['pdf'] },
  doc: { mime: 'application/msword', kinds: ['ole'] },
  xls: { mime: 'application/vnd.ms-excel', kinds: ['ole'] },
  ppt: { mime: 'application/vnd.ms-powerpoint', kinds: ['ole'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kinds: ['zip'] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kinds: ['zip'] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kinds: ['zip'] },
  csv: { mime: 'text/csv', kinds: ['text'] },
  txt: { mime: 'text/plain', kinds: ['text'] },
};
export const ALLOWED_UPLOAD_EXTENSIONS = Object.keys(UPLOAD_RULES);

const INLINE_KINDS = new Set<Kind>(['png', 'jpeg', 'gif', 'webp', 'bmp', 'pdf']);
const INLINE_MIME: Record<string, string> = {
  png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', pdf: 'application/pdf',
};

const extOf = (fileName: string) => (fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '');

/**
 * Validates an upload and returns the MIME type to store (derived from the extension and confirmed
 * by the file content — the client-declared type is ignored).
 */
export function validateUpload(fileName: string, buffer: Buffer): { mimeType: string } {
  if (!fileName || !buffer?.length) throw new BadRequestException('A non-empty file is required');
  if (buffer.length > uploadMaxBytes()) throw new BadRequestException(`File exceeds the ${Math.round(uploadMaxBytes() / 1048576)} MB limit`);
  const ext = extOf(fileName);
  const rule = UPLOAD_RULES[ext];
  if (!rule) {
    throw new UnsupportedMediaTypeException(`File type ".${ext || '?'}" is not allowed. Allowed: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`);
  }
  const kind = sniff(buffer);
  if (!kind || !rule.kinds.includes(kind) || (kind === 'text' && looksLikeMarkup(buffer))) {
    throw new UnsupportedMediaTypeException(`File content does not match its ".${ext}" extension`);
  }
  return { mimeType: rule.mime };
}

function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = (fileName || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName || 'file')}`;
}

/**
 * Sends stored file bytes safely, whatever MIME type was stored with them. Inline only for real
 * raster images / PDF (verified by content); everything else is an attachment, and content that is
 * not a recognised document type is sent as application/octet-stream so it can never render.
 */
export function sendStoredFile(res: Response, file: { fileName: string; buffer: Buffer }): void {
  const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer ?? []);
  const kind = sniff(buffer);
  const ext = extOf(file.fileName);
  const rule = UPLOAD_RULES[ext];
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Cross-Origin-Resource-Policy': 'same-site',
  };
  if (kind && INLINE_KINDS.has(kind)) {
    headers['Content-Type'] = INLINE_MIME[kind];
    headers['Content-Disposition'] = contentDisposition('inline', file.fileName);
    if (kind !== 'pdf') headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  } else {
    const safeDocument = rule && kind && rule.kinds.includes(kind) && !(kind === 'text' && looksLikeMarkup(buffer));
    headers['Content-Type'] = safeDocument ? rule.mime : 'application/octet-stream';
    headers['Content-Disposition'] = contentDisposition('attachment', file.fileName);
    headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  }
  res.set(headers);
  res.send(buffer);
}
