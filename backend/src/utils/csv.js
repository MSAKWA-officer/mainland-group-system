// Minimal, safe CSV writer. UTF-8 with a BOM so Excel opens Swahili / accented text correctly.
// Text cells that start with = + - @ (or a tab / CR) are prefixed with ' so a spreadsheet can never run them as a formula.
// Numbers and numeric strings (including negatives) are left as they are.
const NUMERIC = /^-?\d+(\.\d+)?$/;
const cell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (typeof v !== 'number' && !NUMERIC.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// columns: [{ key, label }]; rows: array of objects.
const toCsv = (columns, rows) => `﻿${[columns.map((c) => cell(c.label)).join(','),
  ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))].join('\r\n')}\r\n`;
module.exports = { toCsv };
