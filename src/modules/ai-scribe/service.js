// Network + recorder layer of the AI scribe. The Gemini key lives only in the ai-scribe Edge Function secrets.
import { getSB } from '../data-access/index.js';
import { pickMime } from './model.js';

// Name the function was deployed under (the folder is supabase/functions/ai-scribe).
export const SCRIBE_FUNCTION = 'ai-scribe';

const sb = () => { const c = getSB(); if (!c) throw new Error('offline'); return c; };

export const recorderSupported = () => typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

// Starts recording; returns { stop(): Promise<Blob>, cancel() }.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const mimeType = pickMime(m => window.MediaRecorder.isTypeSupported(m));
  const rec = new window.MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(1000);
  const release = () => stream.getTracks().forEach(tr => tr.stop());
  return {
    stop: () => new Promise(resolve => {
      rec.onstop = () => { release(); resolve(new Blob(chunks, { type: (rec.mimeType || mimeType || 'audio/webm').split(';')[0] })); };
      rec.stop();
    }),
    cancel: () => { try { rec.onstop = null; rec.stop(); } catch { /* already stopped */ } release(); }
  };
}

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function analyzeRecording(blob, today) {
  const client = sb();
  const { data } = await client.auth.getSession();
  const token = data && data.session && data.session.access_token; if (!token) throw new Error('not signed in');
  const url = String(client.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/' + SCRIBE_FUNCTION;
  const audio = await blobToBase64(blob);
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ audio, mime_type: blob.type, today, consent: true }) });
  let body = {}; try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(body.message || body.error || 'scribe failed'); e.status = res.status; e.code = body.error; throw e; }
  return body;
}
