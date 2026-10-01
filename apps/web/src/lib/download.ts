import { api } from './api';

/**
 * PDF downloads.
 *
 * The API authenticates with a bearer token held in localStorage, not a cookie,
 * so a plain <a href> to the API would arrive unauthenticated. Everything is
 * fetched through the axios instance (which attaches the header) and handed to
 * the browser as a blob.
 */

async function fetchPdf(path: string): Promise<Blob> {
  const res = await api.get(path, { responseType: 'blob' });
  return res.data as Blob;
}

/** Save a PDF to disk. */
export async function downloadPdf(path: string, filename: string) {
  const blob = await fetchPdf(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download in
  // some browsers before it has started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open a PDF in a new tab, where the browser's print dialog is one Ctrl+P away. */
export async function openPdf(path: string) {
  const blob = await fetchPdf(path);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked: fall back to a download rather than silently doing nothing.
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.pdf';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Build the download path for one document type on a commercial invoice. */
export function invoiceDocPath(invoiceId: string, docType: string, inline = false) {
  return `/documents/invoice/${invoiceId}/${encodeURIComponent(docType)}${inline ? '?inline=1' : ''}`;
}

export function proformaDocPath(proformaId: string, inline = false) {
  return `/documents/proforma/${proformaId}${inline ? '?inline=1' : ''}`;
}

export function contractDocPath(contractId: string) {
  return `/documents/contract/${contractId}`;
}
