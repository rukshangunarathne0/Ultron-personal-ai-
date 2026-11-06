import { Mp3AcousticImprint, VoiceConfig } from '../types';
import {
  computeMp3AcousticImprint,
  loadSampleFromVault,
  saveSampleToVault,
} from './mp3Vault';

function splitIntoOrpheusChunks(text: string, maxLen = 185): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/);

  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if (!s) continue;
    if ((current + ' ' + s).trim().length <= maxLen) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length <= maxLen) {
        current = s;
      } else {
        const words = s.split(' ');
        let piece = '';
        for (const w of words) {
          if ((piece + ' ' + w).trim().length <= maxLen) {
            piece = (piece + ' ' + w).trim();
          } else {
            if (piece) chunks.push(piece);
            piece = w.slice(0, maxLen);
          }
        }
        current = piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 6);
}

/**
 * Strips oversized ID3v2 header (e.g. embedded album cover art) if decodeAudioData chokes on it.
 */
function stripId3v2IfPresent(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.length > 10 &&
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33    // '3'
  ) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const offset = 10 + size;
    if (offset > 10 && offset < bytes.length - 64) {
      return bytes.slice(offset).buffer;
    }
  }
  return bytes.slice(0).buffer;
}

class UltronVoiceEngine {
  private audioCtx: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeOsc: OscillatorNode | null = null;
  private rafId: number | null = null;
  private synthEnvelopeTimer: number | null = null;
  private isSpeakingNow = false;
  private abortSeq = 0;

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public stopSpeaking(onAmplitude?: (amp: number) => void, onDone?: () => void) {
    this.abortSeq += 1;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch {
        // ignore
      }
      this.activeSource = null;
    }
    if (this.activeOsc) {
      try {
        this.activeOsc.stop();
      } catch {
        // ignore
      }
      this.activeOsc = null;
    }
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.src = '';
      } catch {
        // ignore
      }
      this.activeHtmlAudio = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.synthEnvelopeTimer !== null) {
      window.clearInterval(this.synthEnvelopeTimer);
      this.synthEnvelopeTimer = null;
    }
    this.isSpeakingNow = false;
    onAmplitude?.(0);
    onDone?.();
  }

  public getAvailableBrowserVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
  }

  public pickBestUltronBrowserVoice(preferredURI?: string): SpeechSynthesisVoice | null {
    const voices = this.getAvailableBrowserVoices();
    if (voices.length === 0) return null;

    if (preferredURI) {
      const exact = voices.find((v) => v.voiceURI === preferredURI);
      if (exact) return exact;
    }

    const priorityPatterns = [
      /Google UK English Male/i,
      /Microsoft Ryan/i,
      /Microsoft Guy/i,
      /Microsoft Christopher/i,
      /Daniel/i,
      /Alex/i,
      /English.*Male/i,
      /en-GB/i,
      /en-US/i,
      /^en/i,
    ];

    for (const pat of priorityPatterns) {
      const found = voices.find((v) => pat.test(`${v.name} ${v.lang}`));
      if (found) return found;
    }
    return voices[0];
  }

  private async decodeAudioBytesRobust(bytes: Uint8Array): Promise<AudioBuffer> {
    const ctx = this.ensureAudioContext();
    try {
      return await ctx.decodeAudioData(bytes.slice(0).buffer);
    } catch {
      // Retry after stripping embedded ID3v2 cover-art header (very common on downloaded MP3s!)
      const stripped = stripId3v2IfPresent(bytes);
      return await ctx.decodeAudioData(stripped);
    }
  }

  /**
   * Ingests raw audio bytes (already safely read via FileReader), stores them permanently
   * in Ultron's IndexedDB Vocal Vault, computes 6-band spectral formant imprint + F0 pitch,
   * and plays a live vocalizer-synced preview!
   */
  public async ingestAndPreviewMp3Bytes(params: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
    config: VoiceConfig;
    playPreview?: boolean;
    onStart?: () => void;
    onAmplitude?: (amp: number) => void;
    onEnd?: () => void;
  }): Promise<Mp3AcousticImprint> {
    const {
      bytes,
      fileName,
      mimeType,
      config,
      playPreview = true,
      onStart,
      onAmplitude,
      onEnd,
    } = params;
    this.stopSpeaking(onAmplitude);

    try {
      const decoded = await this.decodeAudioBytesRobust(bytes);
      const imprint = computeMp3AcousticImprint(decoded, fileName);

      await saveSampleToVault({
        bytes,
        fileName,
        mimeType,
        imprint,
      });

      if (playPreview && !config.muted) {
        this.playDecodedBuffer(
          decoded,
          { ...config, mp3Imprint: imprint },
          config.ultronShiftRate || 0.94,
          onStart,
          onAmplitude,
          onEnd,
          14 // preview first 14s max so Ultron can speak right after!
        );
      } else {
        onEnd?.();
      }
      return imprint;
    } catch {
      // Ultimate fallback for exotic codecs: play via HTMLAudioElement + Blob URL and store default baritone imprint
      const fallbackImprint: Mp3AcousticImprint = {
        fileName,
        durationSec: 8,
        estimatedF0Hz: 108,
        suggestedPitch: 0.56,
        suggestedShiftRate: 0.86,
        bandGainsDb: [4.5, 3.0, 0.5, -1.5, 2.0, 1.5],
        uploadedAt: new Date().toISOString(),
      };
      await saveSampleToVault({
        bytes,
        fileName,
        mimeType,
        imprint: fallbackImprint,
      });

      if (playPreview && !config.muted) {
        this.playBlobViaHtmlAudio(bytes, mimeType, config, onStart, onAmplitude, onEnd);
      } else {
        onEnd?.();
      }
      return fallbackImprint;
    }
  }

  public async replayVaultedMp3(params: {
    config: VoiceConfig;
    onStart?: () => void;
    onAmplitude?: (amp: number) => void;
    onEnd?: () => void;
  }): Promise<boolean> {
    const sample = await loadSampleFromVault();
    if (!sample) return false;
    try {
      const decoded = await this.decodeAudioBytesRobust(sample.bytes);
      this.playDecodedBuffer(
        decoded,
        params.config,
        params.config.ultronShiftRate || 0.92,
        params.onStart,
        params.onAmplitude,
        params.onEnd,
        12
      );
      return true;
    } catch {
      this.playBlobViaHtmlAudio(
        sample.bytes,
        sample.mimeType,
        params.config,
        params.onStart,
        params.onAmplitude,
        params.onEnd
      );
      return true;
    }
  }

  private playBlobViaHtmlAudio(
    bytes: Uint8Array,
    mimeType: string,
    config: VoiceConfig,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ) {
    const blob = new Blob([bytes.slice(0)], { type: mimeType || 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = config.ultronShiftRate || 0.92;
    this.activeHtmlAudio = audio;
    this.isSpeakingNow = true;
    onStart?.();

    let phase = 0;
    this.synthEnvelopeTimer = window.setInterval(() => {
      if (!this.isSpeakingNow) return;
      phase += 0.45;
      onAmplitude?.(0.35 + 0.5 * Math.abs(Math.sin(phase)));
    }, 45);

    const finish = () => {
      this.isSpeakingNow = false;
      if (this.synthEnvelopeTimer !== null) {
        clearInterval(this.synthEnvelopeTimer);
        this.synthEnvelopeTimer = null;
      }
      URL.revokeObjectURL(url);
      onAmplitude?.(0);
      onEnd?.();
    };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }

  /**
   * Clones the vaulted .MP3 bytes directly into an Instant Voice ID via Cartesia or ElevenLabs!
   * Uses the permanent Uint8Array in IndexedDB so File handles never expire.
   */
  public async cloneVaultedMp3Voice(params: {
    service: 'cartesia' | 'elevenlabs';
    apiKey: string;
    voiceName?: string;
  }): Promise<string> {
    const { service, apiKey, voiceName } = params;
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      throw new Error(
        `Paste your ${service === 'cartesia' ? 'Cartesia' : 'ElevenLabs'} API key first.`
      );
    }

    const sample = await loadSampleFromVault();
    if (!sample) {
      throw new Error('Drop or select an .MP3 sample first so Ultron has it in his Vocal Vault.');
    }

    const blob = new Blob([sample.bytes.slice(0)], {
      type: sample.mimeType || 'audio/mpeg',
    });
    const finalName = voiceName || `Ultron (${sample.fileName.replace(/\.[^.]+$/, '')})`;

    if (service === 'elevenlabs') {
      const form = new FormData();
      form.append('name', finalName);
      form.append('description', 'Custom Ultron personal AI voice cloned from MP3');
      form.append('files', blob, sample.fileName || 'ultron-sample.mp3');

      const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': cleanKey },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.voice_id) {
        throw new Error(
          data?.detail?.message ||
            data?.detail ||
            `ElevenLabs clone failed (${res.status}) — Cartesia free tier supports instant MP3 cloning!`
        );
      }
      return String(data.voice_id);
    }

    const form = new FormData();
    form.append('clip', blob, sample.fileName || 'ultron-sample.mp3');
    form.append('name', finalName);
    form.append('description', 'Ultron Personal AI Voice');
    form.append('language', 'en');
    form.append('mode', 'similarity');

    const res = await fetch('https://api.cartesia.ai/voices/clone', {
      method: 'POST',
      headers: {
        'X-API-Key': cleanKey,
        'Cartesia-Version': '2024-11-13',
      },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) {
      throw new Error(data?.message || data?.error || `Cartesia clone failed (${res.status})`);
    }
    return String(data.id);
  }

  public playHudCue(
    type: 'mic_on' | 'mic_off' | 'memory_saved' | 'hostile' | 'step_tick' | 'override',
    muted: boolean
  ) {
    if (muted || typeof window === 'undefined') return;
    try {
      const ctx = this.ensureAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'override') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(115, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.14);
        osc.frequency.exponentialRampToValueAtTime(78, now + 0.34);
        gain.gain.setValueAtTime(0.065, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.38);
      } else if (type === 'mic_on') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.11);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'mic_off') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'memory_saved') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(440, now + 0.07);
        osc.frequency.setValueAtTime(660, now + 0.14);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'hostile') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(92, now);
        osc.frequency.exponentialRampToValueAtTime(46, now + 0.45);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {
      // ignore
    }
  }

  public async speak(params: {
    text: string;
    config: VoiceConfig;
    onStart?: () => void;
    onAmplitude?: (amp: number) => void;
    onEnd?: () => void;
    onError?: (err: string) => void;
  }): Promise<void> {
    const { text, config, onStart, onAmplitude, onEnd, onError } = params;
    this.stopSpeaking(onAmplitude);
    const seq = this.abortSeq;

    const cleanSpeechText = text
      .replace(/```[\s\S]*?```/g, 'Code block generated on your HUD.')
      .replace(/[*_`#>~]/g, '')
      .trim();

    if (!cleanSpeechText || config.muted) {
      onEnd?.();
      return;
    }

    const shiftRate =
      config.provider === 'mp3_clone' && config.mp3Imprint
        ? config.ultronShiftRate || config.mp3Imprint.suggestedShiftRate || 0.88
        : config.ultronShiftRate || 0.88;

    // 1. Cloned MP3 Voice via Cartesia Sonic (if cloned Voice ID present)
    if (
      config.provider === 'mp3_clone' &&
      config.cartesiaApiKey.trim() &&
      config.cartesiaVoiceId.trim()
    ) {
      try {
        const res = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.cartesiaApiKey.trim(),
            'Cartesia-Version': '2024-11-13',
          },
          body: JSON.stringify({
            model_id: 'sonic-english',
            transcript: cleanSpeechText,
            voice: {
              mode: 'id',
              id: config.cartesiaVoiceId.trim(),
            },
            output_format: {
              container: 'wav',
              encoding: 'pcm_s16le',
              sample_rate: 44100,
            },
          }),
        });
        if (!res.ok) throw new Error(`Cartesia ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config,
          config.ultronShiftRate || 1.0,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch (err) {
        onError?.(
          `Cloned Cartesia Voice (${err instanceof Error ? err.message : 'failed'}) — engaging MP3 Formant Synth.`
        );
      }
    }

    // 2. ElevenLabs Neural / Cloned MP3 Voice
    if (
      (config.provider === 'elevenlabs' || config.provider === 'mp3_clone') &&
      config.elevenLabsApiKey.trim()
    ) {
      try {
        const voiceId = config.elevenLabsVoiceId.trim() || 'nPczCjzI2devNBz1zQrb';
        const modelId = config.elevenLabsModelId.trim() || 'eleven_multilingual_v2';
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': config.elevenLabsApiKey.trim(),
            },
            body: JSON.stringify({
              text: cleanSpeechText,
              model_id: modelId,
              voice_settings: {
                stability: 0.62,
                similarity_boost: 0.85,
                style: 0.35,
                use_speaker_boost: true,
              },
            }),
          }
        );
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config,
          config.ultronShiftRate || 1.0,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch (err) {
        onError?.(
          `ElevenLabs (${err instanceof Error ? err.message : 'failed'}) — engaging MP3 Formant Synth.`
        );
      }
    }

    // 3. Groq Orpheus Neural TTS — ALSO used automatically when an MP3 Imprint is active without external clone keys,
    // sculpting Groq's neural WAV directly through your dropped MP3's 6-band formant curve + F0 pitch shift!
    if (
      config.provider === 'groq_orpheus' ||
      (config.provider === 'mp3_clone' && config.mp3Imprint)
    ) {
      try {
        const chunks = splitIntoOrpheusChunks(cleanSpeechText, 185);
        let started = false;
        for (const chunk of chunks) {
          if (seq !== this.abortSeq) return;
          const payload = JSON.stringify({
            text: chunk,
            voice: config.groqVoice || 'troy',
          });

          let res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          }).catch(() => null);

          if (
            !res ||
            res.status === 404 ||
            (res.headers.get('content-type') || '').includes('text/html')
          ) {
            res = await fetch('https://ultron-personal-ai.vercel.app/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
            });
          }

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const rawErr = String(errJson?.error || `HTTP ${res.status}`);
            if (/terms/i.test(rawErr)) {
              throw new Error(
                'Accept Groq Orpheus terms once at console.groq.com/playground?model=canopylabs/orpheus-v1-english'
              );
            }
            throw new Error(rawErr.slice(0, 120));
          }

          const wavBuf = await res.arrayBuffer();
          if (seq !== this.abortSeq) return;
          await this.playAudioBufferPromise(
            wavBuf,
            config,
            shiftRate,
            !started
              ? () => {
                  started = true;
                  onStart?.();
                }
              : undefined,
            onAmplitude
          );
        }
        if (seq === this.abortSeq) {
          onAmplitude?.(0);
          onEnd?.();
        }
        return;
      } catch (err) {
        if (config.provider === 'groq_orpheus') {
          onError?.(
            `Groq Neural Voice: ${err instanceof Error ? err.message : 'unavailable'} — using MP3-tuned Synth.`
          );
        }
      }
    }

    // 4. OpenAI TTS ("onyx" deep voice)
    if (config.provider === 'openai_tts' && config.openAiApiKey.trim()) {
      try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.openAiApiKey.trim()}`,
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: config.openAiVoice || 'onyx',
            speed: config.rate || 0.94,
            input: cleanSpeechText,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI TTS ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config,
          shiftRate,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch (err) {
        onError?.(
          `OpenAI TTS error (${err instanceof Error ? err.message : 'failed'}) — falling back.`
        );
      }
    }

    // 5. Custom Local Neural TTS Endpoint
    if (config.provider === 'custom_endpoint' && config.customEndpointUrl.trim()) {
      try {
        const res = await fetch(config.customEndpointUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanSpeechText }),
        });
        if (!res.ok) throw new Error(`Custom TTS ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config,
          shiftRate,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch {
        onError?.(`Local TTS endpoint unreachable — using built-in Ultron synth.`);
      }
    }

    // 6. Built-in Browser Ultron Speech Synthesizer (tuned to MP3 pitch if MP3 Imprint active!)
    this.speakWithBrowserSynth(cleanSpeechText, config, onStart, onAmplitude, onEnd);
  }

  private playAudioBufferPromise(
    arrayBuf: ArrayBuffer,
    config: VoiceConfig,
    playbackRate: number,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.playAudioBufferWithUltronDSP(
        arrayBuf,
        config,
        playbackRate,
        onStart,
        onAmplitude,
        () => resolve()
      ).catch(reject);
    });
  }

  private async playAudioBufferWithUltronDSP(
    arrayBuf: ArrayBuffer,
    config: VoiceConfig,
    playbackRate: number,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ): Promise<void> {
    const audioBuffer = await this.decodeAudioBytesRobust(new Uint8Array(arrayBuf));
    this.playDecodedBuffer(
      audioBuffer,
      config,
      playbackRate,
      onStart,
      onAmplitude,
      onEnd
    );
  }

  private playDecodedBuffer(
    audioBuffer: AudioBuffer,
    config: VoiceConfig,
    playbackRate: number,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void,
    maxDurationSec?: number
  ) {
    const ctx = this.ensureAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = Math.max(0.65, Math.min(1.3, playbackRate));
    this.activeSource = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let lastNode: AudioNode = source;

    // 1. Optional 6-Band Formant Sculptor extracted from Rukshan's dropped .MP3!
    if (config.useMp3Imprint && config.mp3Imprint?.bandGainsDb) {
      const freqs = [85, 180, 380, 850, 1900, 3400];
      freqs.forEach((f, idx) => {
        const eq = ctx.createBiquadFilter();
        eq.type = idx === 0 ? 'lowshelf' : idx === freqs.length - 1 ? 'highshelf' : 'peaking';
        eq.frequency.value = f;
        eq.Q.value = 1.35;
        eq.gain.value = config.mp3Imprint!.bandGainsDb[idx] || 0;
        lastNode.connect(eq);
        lastNode = eq;
      });
    }

    // 2. Ultron Vibranium Sub-Bass + Metallic Chamber + Optional Cybernetic Ring-Mod Growl
    if (config.roboticResonance) {
      const bassBoost = ctx.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 135;
      bassBoost.gain.value = config.subBassDb ?? 6.5;

      lastNode.connect(bassBoost);
      lastNode = bassBoost;

      // Subtle ring-modulation metallic growl (controlled by Ultron's ringModHz!)
      const ringHz = config.ringModHz ?? 28;
      if (ringHz > 4) {
        const carrierGain = ctx.createGain();
        carrierGain.gain.value = 0.86;
        const modOsc = ctx.createOscillator();
        modOsc.type = 'sine';
        modOsc.frequency.value = ringHz;
        const modDepth = ctx.createGain();
        modDepth.gain.value = 0.14;
        modOsc.connect(modDepth);
        modDepth.connect(carrierGain.gain);
        modOsc.start();
        this.activeOsc = modOsc;
        lastNode.connect(carrierGain);
        lastNode = carrierGain;
      }

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.88;

      const delay = ctx.createDelay();
      delay.delayTime.value = 0.017;
      const wetGain = ctx.createGain();
      wetGain.gain.value = Math.max(0, Math.min(0.65, config.metallicMix ?? 0.26));

      lastNode.connect(dryGain);
      lastNode.connect(delay);
      delay.connect(wetGain);

      dryGain.connect(analyser);
      wetGain.connect(analyser);
    } else {
      lastNode.connect(analyser);
    }

    analyser.connect(ctx.destination);

    this.isSpeakingNow = true;
    onStart?.();

    const sampleAmp = () => {
      if (!this.isSpeakingNow) return;
      analyser.getByteTimeDomainData(dataArray);
      let sumSq = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const norm = (dataArray[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / dataArray.length);
      const scaled = Math.min(1, rms * 4.2);
      onAmplitude?.(scaled);
      this.rafId = requestAnimationFrame(sampleAmp);
    };
    this.rafId = requestAnimationFrame(sampleAmp);

    source.onended = () => {
      this.isSpeakingNow = false;
      if (this.activeOsc) {
        try {
          this.activeOsc.stop();
        } catch {
          // ignore
        }
        this.activeOsc = null;
      }
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      onAmplitude?.(0);
      onEnd?.();
    };

    if (maxDurationSec && audioBuffer.duration > maxDurationSec) {
      source.start(0, 0, maxDurationSec);
    } else {
      source.start(0);
    }
  }

  private speakWithBrowserSynth(
    text: string,
    config: VoiceConfig,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.simulateVisualVocalizer(text, onStart, onAmplitude, onEnd);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    const chosenVoice = this.pickBestUltronBrowserVoice(config.browserVoiceURI);
    if (chosenVoice) {
      utter.voice = chosenVoice;
    }

    const effectivePitch =
      config.useMp3Imprint && config.mp3Imprint
        ? config.pitch ?? config.mp3Imprint.suggestedPitch
        : config.pitch ?? 0.62;

    utter.pitch = Math.max(0.25, Math.min(1.5, effectivePitch));
    utter.rate = Math.max(0.65, Math.min(1.4, config.rate ?? 0.94));
    utter.volume = 1.0;

    let boundaryBoost = 0.65;
    let phase = 0;

    utter.onstart = () => {
      this.isSpeakingNow = true;
      onStart?.();
      this.synthEnvelopeTimer = window.setInterval(() => {
        if (!this.isSpeakingNow) return;
        phase += 0.42;
        const syllableWave =
          0.32 +
          0.38 * Math.abs(Math.sin(phase)) +
          0.22 * Math.abs(Math.cos(phase * 1.7)) +
          boundaryBoost * 0.25;
        boundaryBoost *= 0.85;
        onAmplitude?.(Math.min(1, syllableWave));
      }, 40);
    };

    utter.onboundary = () => {
      boundaryBoost = 0.95;
    };

    const cleanup = () => {
      this.isSpeakingNow = false;
      if (this.synthEnvelopeTimer !== null) {
        window.clearInterval(this.synthEnvelopeTimer);
        this.synthEnvelopeTimer = null;
      }
      onAmplitude?.(0);
      onEnd?.();
    };

    utter.onend = cleanup;
    utter.onerror = cleanup;

    window.speechSynthesis.speak(utter);
  }

  private simulateVisualVocalizer(
    text: string,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ) {
    const durationMs = Math.min(6000, Math.max(1400, text.length * 45));
    const start = performance.now();
    this.isSpeakingNow = true;
    onStart?.();

    const tick = (now: number) => {
      if (!this.isSpeakingNow) return;
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        this.isSpeakingNow = false;
        onAmplitude?.(0);
        onEnd?.();
        return;
      }
      const t = elapsed * 0.018;
      const amp = 0.25 + 0.55 * Math.abs(Math.sin(t) * Math.cos(t * 0.63));
      onAmplitude?.(amp);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

export const ultronVoice = new UltronVoiceEngine();
