import { VoiceConfig } from '../types';

class UltronVoiceEngine {
  private audioCtx: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private rafId: number | null = null;
  private synthEnvelopeTimer: number | null = null;
  private isSpeakingNow = false;

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public stopSpeaking(onAmplitude?: (amp: number) => void, onDone?: () => void) {
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
   * Subtle synthesized Ultron HUD & servo sound cues (respects mute state).
   */
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
        osc.stop(now + 0.30);
      } else if (type === 'hostile') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(92, now);
        osc.frequency.exponentialRampToValueAtTime(46, now + 0.45);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.50);
      }
    } catch {
      // ignore if autoplay blocked prior to gesture
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

    const cleanSpeechText = text
      .replace(/```[\s\S]*?```/g, 'Code block generated on your HUD.')
      .replace(/[*_`#>~]/g, '')
      .trim();

    if (!cleanSpeechText || config.muted) {
      onEnd?.();
      return;
    }

    // 1. ElevenLabs Neural Voice
    if (config.provider === 'elevenlabs' && config.elevenLabsApiKey.trim()) {
      try {
        const voiceId = config.elevenLabsVoiceId.trim() || 'nPczCjzI2devNBz1zQrb'; // Brian (deep resonant male)
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
                similarity_boost: 0.82,
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
        await this.playAudioBufferWithUltronDSP(arrayBuf, config.roboticResonance, onStart, onAmplitude, onEnd);
        return;
      } catch (err) {
        onError?.(
          `ElevenLabs error (${err instanceof Error ? err.message : 'failed'}) — falling back to built-in Ultron synth.`
        );
      }
    }

    // 2. OpenAI TTS ("onyx" deep voice)
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
        await this.playAudioBufferWithUltronDSP(arrayBuf, config.roboticResonance, onStart, onAmplitude, onEnd);
        return;
      } catch (err) {
        onError?.(
          `OpenAI TTS error (${err instanceof Error ? err.message : 'failed'}) — falling back to built-in Ultron synth.`
        );
      }
    }

    // 3. Custom Local Neural TTS Endpoint (Piper / Kokoro / XTTS)
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
        await this.playAudioBufferWithUltronDSP(arrayBuf, config.roboticResonance, onStart, onAmplitude, onEnd);
        return;
      } catch (err) {
        onError?.(
          `Local TTS endpoint unreachable (${err instanceof Error ? err.message : 'failed'}) — using built-in Ultron synth.`
        );
      }
    }

    // 4. Built-in Browser Ultron Speech Synthesizer (Instant, Free, Zero-Key)
    this.speakWithBrowserSynth(cleanSpeechText, config, onStart, onAmplitude, onEnd);
  }

  private async playAudioBufferWithUltronDSP(
    arrayBuf: ArrayBuffer,
    roboticResonance: boolean,
    onStart?: () => void,
    onAmplitude?: (amp: number) => void,
    onEnd?: () => void
  ): Promise<void> {
    const ctx = this.ensureAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    this.activeSource = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    if (roboticResonance) {
      // Deep Ultron vibranium chest resonance: sub-bass shelf + 17ms metallic comb feedback
      const bassBoost = ctx.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 130;
      bassBoost.gain.value = 5.5;

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.88;

      const delay = ctx.createDelay();
      delay.delayTime.value = 0.017; // 17ms metallic chamber reflection
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
      // Simulate brief visual vocalizer pulse even if browser lacks SpeechSynthesis
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
