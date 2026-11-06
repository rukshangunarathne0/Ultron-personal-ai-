import { VoiceConfig } from '../types';

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
        // Split long sentence on commas or words
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

class UltronVoiceEngine {
  private audioCtx: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
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

  /**
   * Analyzes an uploaded .mp3/.wav file in the browser, measures its vocal tone/pitch profile,
   * and plays a preview synced with Ultron's glowing cheek furnaces & mouth core!
   */
  public async analyzeAndPreviewMp3(params: {
    file: File;
    roboticResonance: boolean;
    onStart?: () => void;
    onAmplitude?: (amp: number) => void;
    onEnd?: () => void;
  }): Promise<{ durationSec: number; suggestedPitch: number }> {
    const { file, roboticResonance, onStart, onAmplitude, onEnd } = params;
    this.stopSpeaking(onAmplitude);
    const arrayBuf = await file.arrayBuffer();
    const ctx = this.ensureAudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));

    // Estimate average zero-crossing rate on first 8 seconds to tune Ultron pitch slider
    const ch = decoded.getChannelData(0);
    const sampleCount = Math.min(ch.length, decoded.sampleRate * 8);
    let crossings = 0;
    let rmsSum = 0;
    for (let i = 1; i < sampleCount; i++) {
      rmsSum += ch[i] * ch[i];
      if ((ch[i - 1] >= 0 && ch[i] < 0) || (ch[i - 1] < 0 && ch[i] >= 0)) {
        crossings += 1;
      }
    }
    const zcrHz = (crossings / 2) / (sampleCount / decoded.sampleRate);
    // Map deeper voice (< 350 ZCR) -> ~0.52..0.62 pitch, higher -> ~0.68..0.78
    const suggestedPitch = Number(
      Math.max(0.45, Math.min(0.85, 0.48 + (zcrHz / 1200) * 0.25)).toFixed(2)
    );

    // Play up to 15s preview with Ultron mouth/cheek furnace lip-sync
    this.playDecodedBuffer(decoded, roboticResonance, 1.0, onStart, onAmplitude, onEnd);

    return {
      durationSec: Number(decoded.duration.toFixed(1)),
      suggestedPitch,
    };
  }

  /**
   * Clones an uploaded .mp3/.wav file directly into an Instant Voice ID via Cartesia or ElevenLabs!
   */
  public async cloneMp3Voice(params: {
    file: File;
    service: 'cartesia' | 'elevenlabs';
    apiKey: string;
    voiceName?: string;
  }): Promise<string> {
    const { file, service, apiKey, voiceName = 'Ultron Custom MP3' } = params;
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      throw new Error(`Paste your ${service === 'cartesia' ? 'Cartesia' : 'ElevenLabs'} API key first.`);
    }

    if (service === 'elevenlabs') {
      const form = new FormData();
      form.append('name', voiceName);
      form.append('description', 'Custom Ultron personal AI voice cloned from MP3');
      form.append('files', file, file.name || 'ultron-sample.mp3');

      const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': cleanKey,
        },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.voice_id) {
        throw new Error(
          data?.detail?.message ||
            data?.detail ||
            `ElevenLabs clone failed (${res.status}) — note: ElevenLabs Instant Voice Cloning requires Starter plan, or use Cartesia free tier!`
        );
      }
      return String(data.voice_id);
    }

    // Cartesia Instant Voice Cloning (supports 5-15s MP3 clips even on free tier!)
    const form = new FormData();
    form.append('clip', file, file.name || 'ultron-sample.mp3');
    form.append('name', voiceName);
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
    type: 'mic_on' | 'mic_off' | 'memory_saved' | 'hostile' | 'step_tick',
    muted: boolean
  ) {
    if (muted || typeof window === 'undefined') return;
    try {
      const ctx = this.ensureAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'mic_on') {
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

    const shiftRate = config.ultronShiftRate || 0.88;

    // 1. Groq Orpheus Neural TTS (uses pre-connected server GROQ_API_KEY!)
    if (config.provider === 'groq_orpheus') {
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

          if (!res || res.status === 404 || (res.headers.get('content-type') || '').includes('text/html')) {
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
            config.roboticResonance,
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
        onError?.(
          `Groq Neural Voice: ${err instanceof Error ? err.message : 'unavailable'} — using Built-in Synth.`
        );
      }
    }

    // 2. Cloned MP3 Voice via Cartesia Sonic
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
        if (!res.ok) {
          throw new Error(`Cartesia ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config.roboticResonance,
          1.0,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch (err) {
        onError?.(
          `Cloned MP3 Voice error (${err instanceof Error ? err.message : 'failed'}) — falling back.`
        );
      }
    }

    // 3. ElevenLabs Neural / Cloned MP3 Voice
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
        if (!res.ok) {
          throw new Error(`ElevenLabs ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config.roboticResonance,
          1.0,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch (err) {
        onError?.(
          `ElevenLabs error (${err instanceof Error ? err.message : 'failed'}) — falling back to built-in synth.`
        );
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
        if (!res.ok) {
          throw new Error(`OpenAI TTS ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config.roboticResonance,
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

    // 5. Custom Local Neural TTS Endpoint (Piper / F5-TTS / XTTS)
    if (config.provider === 'custom_endpoint' && config.customEndpointUrl.trim()) {
      try {
        const res = await fetch(config.customEndpointUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanSpeechText }),
        });
        if (!res.ok) {
          throw new Error(`Custom TTS ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        await this.playAudioBufferWithUltronDSP(
          arrayBuf,
          config.roboticResonance,
          1.0,
          onStart,
          onAmplitude,
          onEnd
        );
        return;
      } catch (err) {
        onError?.(
          `Local TTS endpoint unreachable — using built-in Ultron synth.`
        );
      }
    }

    // 6. Built-in Browser Ultron Speech Synthesizer
    this.speakWithBrowserSynth(cleanSpeechText, config, onStart, onAmplitude, onEnd);
  }

  private playAudioBufferPromise(
    arrayBuf: ArrayBuffer,
    roboticResonance: boolean,
    playbackRate: number,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.playAudioBufferWithUltronDSP(
        arrayBuf,
        roboticResonance,
        playbackRate,
        onStart,
        onAmplitude,
        () => resolve()
      ).catch(reject);
    });
  }

  private async playAudioBufferWithUltronDSP(
    arrayBuf: ArrayBuffer,
    roboticResonance: boolean,
    playbackRate: number,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ): Promise<void> {
    const ctx = this.ensureAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    this.playDecodedBuffer(
      audioBuffer,
      roboticResonance,
      playbackRate,
      onStart,
      onAmplitude,
      onEnd
    );
  }

  private playDecodedBuffer(
    audioBuffer: AudioBuffer,
    roboticResonance: boolean,
    playbackRate: number,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ) {
    const ctx = this.ensureAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;
    this.activeSource = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    if (roboticResonance) {
      const bassBoost = ctx.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 135;
      bassBoost.gain.value = 5.5;

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.88;

      const delay = ctx.createDelay();
      delay.delayTime.value = 0.017;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.24;

      source.connect(bassBoost);
      bassBoost.connect(dryGain);
      bassBoost.connect(delay);
      delay.connect(wetGain);

      dryGain.connect(analyser);
      wetGain.connect(analyser);
    } else {
      source.connect(analyser);
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
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      onAmplitude?.(0);
      onEnd?.();
    };

    source.start(0);
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
    utter.pitch = config.pitch ?? 0.62;
    utter.rate = config.rate ?? 0.94;
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
