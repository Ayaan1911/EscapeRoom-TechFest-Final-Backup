export function csvCell(value: string | number) {
  const text = String(value);
  const escaped = (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text) ? "'" : "") + text;
  return `"${escaped.replaceAll('"', '""')}"`;
}
