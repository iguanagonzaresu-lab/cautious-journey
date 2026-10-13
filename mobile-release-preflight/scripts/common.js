import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LIMITS = { files: 4000, bytes: 1024 * 1024, total: 24 * 1024 * 1024 };
export function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
export function safePath(root, relative) {
  if (path.isAbsolute(relative) || relative.includes('\0')) throw new Error('unsafe-path');
  const file = path.resolve(root, relative);
  if (!inside(root, file)) throw new Error('unsafe-path');
  let cursor = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    if (!part) continue;
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('symlink');
  }
  if (fs.existsSync(file) && !inside(root, fs.realpathSync(file))) throw new Error('outside-root');
  return file;
}
export function textFile(root, relative) {
  const file = safePath(root, relative);
  if (!fs.existsSync(file)) return null;
  const info = fs.statSync(file);
  if (!info.isFile() || info.size > LIMITS.bytes) throw new Error('file-limit');
  const bytes = fs.readFileSync(file);
  if (bytes.includes(0)) throw new Error('binary-file');
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}
export function localJson(file) {
  const real = fs.realpathSync(file);
  if (!fs.statSync(real).isFile() || fs.statSync(real).size > LIMITS.bytes) throw new Error('input-limit');
  const value = JSON.parse(fs.readFileSync(real, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('input-shape');
  return value;
}
export function finding(id, status, evidence, risk, fix, verify, file) {
  return {id, status, evidence, risk, fix, verify, ...(file ? {file} : {})};
}
export const gap = (id, evidence, file) => finding(id, 'WARN', evidence,
  'This requirement has not been verified.', 'Supply the missing release-specific evidence.',
  'Re-run against the same candidate after verification.', file);
export function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function cleanComments(text) {
  // Preserve quoted strings while removing line and block comments. Never evaluate code.
  return text.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, quoted) => quoted ?? match.replace(/[^\n]/g, ' '));
}
export function literal(text, name, numeric = false) {
  const pattern = new RegExp('\\b' + name + '\\s*(?:=\\s*)?(?:\\(\\s*)?([^\\r\\n;]+)', 'g');
  const entries = [...cleanComments(text).matchAll(pattern)].map(m => m[1].trim().replace(/\)\s*$/, '').trim());
  if (entries.length !== 1) return undefined;
  const v = entries[0];
  if (numeric) return /^-?\d+$/.test(v) ? Number(v) : undefined;
  const m = v.match(/^(['"])(.*?)\1$/);
  return m && !/\$|\{/.test(m[2]) ? m[2] : undefined;
}
export function versionTuple(value) {
  return typeof value === 'string' && /^\d+(\.\d+){0,2}$/.test(value)
    ? value.split('.').map(BigInt).concat([0n,0n]).slice(0,3) : null;
}
export function compareVersions(a,b) {
  const x=versionTuple(a), y=versionTuple(b);
  if (!x || !y) return null;
  for (let i=0;i<3;i++) { if (x[i]!==y[i]) return x[i]>y[i]?1:-1; }
  return 0;
}
