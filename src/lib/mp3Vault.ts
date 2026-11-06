import { Mp3AcousticImprint } from '../types';

const DB_NAME = 'ruk_ai_vocal_vault_v1';
const STORE_NAME = 'mp3_samples';
const PRIMARY_KEY = 'active_ultron_mp3';

export interface VaultedMp3Sample {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  imprint: Mp3AcousticImprint;
}

let memoryCachedSample: VaultedMp3Sample | null = null;

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveSampleToVault(sample: VaultedMp3Sample): Promise<void> {
  memoryCachedSample = sample;
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(sample, PRIMARY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Keep memoryCachedSample active even if IndexedDB is blocked in private mode
  }
}

export async function loadSampleFromVault(): Promise<VaultedMp3Sample | null> {
  if (memoryCachedSample) return memoryCachedSample;
  try {
    const db = await openVaultDb();
    const res = await new Promise<VaultedMp3Sample | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const getReq = tx.objectStore(STORE_NAME).get(PRIMARY_KEY);
      getReq.onsuccess = () => resolve((getReq.result as VaultedMp3Sample) || null);
      getReq.onerror = () => resolve(null);
    });
    db.close();
    if (res && res.bytes) {
      memoryCachedSample = res;
      return res;
    }
    return null;
  } catch {
    return null;
  }
}

export function getCachedVaultSample(): VaultedMp3Sample | null {
  return memoryCachedSample;
}

/**
 * MUST BE CALLED SYNCHRONOUSLY inside onDrop or input.onChange BEFORE any setState/await!
 * Starts FileReader immediately in the synchronous user-gesture tick so transient Windows/Browser
 * DataTransfer handles do not expire with NotFoundError.
 */
export function readDroppedOrPickedAudioSync(params: {
  file?: File | null;
  uriFallback?: string;
}): Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }> {
  const { file, uriFallback } = params;

  if (!file && uriFallback && /^https?:\/\//i.test(uriFallback.trim())) {
    const cleanUrl = uriFallback.trim();
    return fetch(cleanUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        const urlName = cleanUrl.split('/').pop()?.split('?')[0] || 'remote-voice.mp3';
        return {
          bytes: new Uint8Array(buf),
          fileName: urlName,
          mimeType: r.headers.get('content-type') || 'audio/mpeg',
        };
      });
  }

  if (!file) {
    return Promise.reject(
      new Error('No audio file received by browser. Click "BROWSE .MP3 FILE" to pick it directly.')
    );
  }

  const fileName = file.name || 'ultron-voice.mp3';
  const mimeType = file.type || 'audio/mpeg';

  // Immediately kick off FileReader in the SAME synchronous event tick!
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer && result.byteLength > 0) {
        resolve({
          bytes: new Uint8Array(result.slice(0)),
          fileName,
          mimeType,
        });
      } else {
        reject(
          new Error(
            'File appears empty (0 bytes). If it is inside a .ZIP or cloud folder (OneDrive/Google Drive), extract/download it to Desktop first or click BROWSE .MP3 FILE.'
          )
        );
      }
    };

    reader.onerror = async () => {
      const domErr = reader.error;
      // Secondary fallback: try reading via ObjectURL blob fetch in same session
      try {
        const blobUrl = URL.createObjectURL(file);
        const resp = await fetch(blobUrl);
        const buf = await resp.arrayBuffer();
        URL.revokeObjectURL(blobUrl);
        if (buf.byteLength > 0) {
          resolve({
            bytes: new Uint8Array(buf),
            fileName,
            mimeType,
          });
          return;
        }
      } catch {
        // fall through to clear actionable message
      }

      if (domErr?.name === 'NotFoundError') {
        reject(
          new Error(
            'Windows/OS blocked direct drag from that folder (happens when dragging directly from inside a .ZIP archive, WhatsApp/Telegram, or un-synced OneDrive file). Click the "BROWSE .MP3 FILE" button to select it, or extract it to your Desktop first!'
          )
        );
      } else {
        reject(new Error(domErr?.message || 'Browser could not read the dropped audio file.'));
      }
    };

    try {
      reader.readAsArrayBuffer(file);
    } catch (syncErr) {
      reject(
        syncErr instanceof Error
          ? syncErr
          : new Error('Could not start reading audio file.')
      );
    }
  });
}

/**
 * Extracts a real 6-band spectral formant curve + estimated fundamental vocal pitch (F0)
 * from a decoded AudioBuffer so Ultron can sculpt ANY voice with this MP3's acoustic signature
 * — and even re-modulate it autonomously!
 */
export function computeMp3AcousticImprint(
  decoded: AudioBuffer,
  fileName: string
): Mp3AcousticImprint {
  const ch = decoded.getChannelData(0);
  const sr = decoded.sampleRate;
  const maxSamples = Math.min(ch.length, sr * 12);

  // 1. Estimate fundamental pitch (F0) via autocorrelation on voiced frames (70Hz..320Hz)
  const frameLen = Math.min(2048, maxSamples);
  const minLag = Math.max(2, Math.floor(sr / 320));
  const maxLag = Math.min(frameLen - 2, Math.floor(sr / 68));
  const f0Estimates: number[] = [];

  for (let offset = 0; offset + frameLen < maxSamples; offset += Math.floor(sr * 0.25)) {
    let energy = 0;
    for (let i = 0; i < frameLen; i++) {
      energy += ch[offset + i] * ch[offset + i];
    }
    const rms = Math.sqrt(energy / frameLen);
    if (rms < 0.018) continue; // skip silence

    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag += 2) {
      let corr = 0;
      for (let i = 0; i < frameLen - lag; i += 2) {
        corr += ch[offset + i] * ch[offset + i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestCorr / (energy * 0.5 + 1e-6) > 0.22) {
      f0Estimates.push(sr / bestLag);
    }
  }

  f0Estimates.sort((a, b) => a - b);
  const medianF0 =
    f0Estimates.length > 0
      ? f0Estimates[Math.floor(f0Estimates.length / 2)]
      : 112; // deep baritone fallback

  // 2. Measure 6-band Goertzel spectral energy around [85, 180, 380, 850, 1900, 3400] Hz
  const centerFreqs = [85, 180, 380, 850, 1900, 3400];
  const rawDb: number[] = centerFreqs.map((freq) => {
    const N = Math.min(4096, maxSamples);
    if (N < 64) return 0;
    let totalPower = 0;
    let windows = 0;
    const k = Math.round((N * freq) / sr);
    const omega = (2 * Math.PI * k) / N;
    const coeff = 2 * Math.cos(omega);

    for (let start = 0; start + N <= maxSamples && windows < 14; start += Math.floor(maxSamples / 14 || N)) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < N; i++) {
        s0 = ch[start + i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
      if (power > 1e-6) {
        totalPower += power / (N * N);
        windows++;
      }
    }
    const avg = windows > 0 ? totalPower / windows : 1e-7;
    return 10 * Math.log10(Math.max(1e-9, avg));
  });

  const meanDb = rawDb.reduce((a, b) => a + b, 0) / rawDb.length;
  const bandGainsDb = rawDb.map((v) =>
    Number(Math.max(-8, Math.min(10, (v - meanDb) * 0.45)).toFixed(1))
  ) as [number, number, number, number, number, number];

  // Map medianF0 (75Hz..220Hz) -> browser synth pitch (0.42..0.88) & neural shiftRate (0.78..1.02)
  const normF0 = Math.max(0, Math.min(1, (medianF0 - 75) / 145));
  const suggestedPitch = Number((0.46 + normF0 * 0.36).toFixed(2));
  const suggestedShiftRate = Number((0.80 + normF0 * 0.18).toFixed(2));

  return {
    fileName,
    durationSec: Number(decoded.duration.toFixed(1)),
    estimatedF0Hz: Math.round(medianF0),
    suggestedPitch,
    suggestedShiftRate,
    bandGainsDb,
    uploadedAt: new Date().toISOString(),
  };
}
