import { api } from './client';

// Downloads a report as a file (format: xlsx | pdf | csv). The download is written to the audit log by the server.
export async function downloadReport(url, params, format = 'xlsx', fallbackName = 'report') {
  try {
    const r = await api.get(url, { params: { ...params, format }, responseType: 'blob' });
    const file = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || `${fallbackName}.${format}`;
    const href = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = href; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(href);
  } catch (e) {
    // With responseType 'blob' an error body arrives as a Blob: turn it back into JSON so errMsg() can read it.
    if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* keep the blob */ } }
    throw e;
  }
}
