import React, { useEffect, useState } from 'react';
import {
  ThinkingStepId,
  UltronEmotion,
  UltronThemeId,
  UltronUiConfig,
} from '../types';

interface UltronAvatarRigProps {
  emotion: UltronEmotion;
  activeStep: ThinkingStepId;
  speechAmplitude: number;
  micAmplitude: number;
  uiConfig?: UltronUiConfig;
}

const THEME_GLOW_SHIFT: Record<UltronThemeId, { hueDeg: number; rgb: string }> = {
  crimson_overlord: { hueDeg: 0, rgb: '255, 18, 40' },
  molten_fury: { hueDeg: 22, rgb: '255, 95, 10' },
  vibranium_abyss: { hueDeg: 192, rgb: '0, 229, 255' },
  imperial_gold: { hueDeg: 44, rgb: '255, 183, 3' },
  phantom_violet: { hueDeg: 278, rgb: '181, 23, 255' },
  blood_eclipse: { hueDeg: -10, rgb: '255, 0, 56' },
};

export const UltronAvatarRig: React.FC<UltronAvatarRigProps> = ({
  emotion,
  activeStep,
  speechAmplitude,
  micAmplitude,
  uiConfig,
}) => {
  const [mouseNorm, setMouseNorm] = useState({ x: 0, y: 0 });
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      setMouseNorm({ x: nx, y: ny });
    };
    window.addEventListener('mousemove', onMove);

    let rafId = 0;
    const tick = (now: number) => {
      setPulsePhase(now * 0.001);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const themeShift =
    THEME_GLOW_SHIFT[uiConfig?.theme || 'crimson_overlord'] || THEME_GLOW_SHIFT.crimson_overlord;
  const baseHue = themeShift.hueDeg;

  // 1. Authentic Mechanical Optic Reactor Intensity (NO human blinking, NO slashes, NO fake shapes!)
  let eyeOpacity = 0.86 + 0.08 * Math.sin(pulsePhase * 2.2);
  let eyeFilter = baseHue !== 0 ? `hue-rotate(${baseHue}deg) saturate(145%)` : 'none';

  if (emotion === 'hostile') {
    eyeOpacity = 1;
    eyeFilter = `hue-rotate(${baseHue - 18}deg) saturate(210%) brightness(128%) drop-shadow(0 0 10px rgba(${themeShift.rgb}, 0.85))`;
  } else if (emotion === 'thinking' || activeStep === 2 || activeStep === 3) {
    eyeOpacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(pulsePhase * 14));
    eyeFilter = `hue-rotate(${baseHue - 6}deg) brightness(115%)`;
  } else if (emotion === 'listening') {
    eyeOpacity = 0.96;
    eyeFilter = `hue-rotate(${baseHue}deg) brightness(120%) drop-shadow(0 0 6px rgba(${themeShift.rgb}, 0.55))`;
  } else if (emotion === 'speaking') {
    eyeOpacity = Math.min(1, 0.88 + speechAmplitude * 0.15);
    eyeFilter = `hue-rotate(${baseHue}deg) brightness(116%)`;
  } else if (emotion === 'memory_sync' || activeStep === 6) {
    eyeOpacity = 0.7 + 0.3 * Math.sin(pulsePhase * 10);
    eyeFilter = `hue-rotate(${baseHue - 22}deg) saturate(180%) brightness(120%)`;
  } else if (emotion === 'loyal') {
    eyeOpacity = 0.94;
    eyeFilter = `hue-rotate(${baseHue + 12}deg) brightness(112%)`;
  } else if (emotion === 'alert') {
    eyeOpacity = 0.5 + 0.5 * Math.abs(Math.sin(pulsePhase * 9));
    eyeFilter = `hue-rotate(${baseHue - 14}deg) saturate(180%) brightness(125%)`;
  }

  // 2. Authentic Mouth Core & Cheek Turbines Intensity (60fps voice sync)
  let vocalOpacity = 0.28 + 0.1 * Math.sin(pulsePhase * 2.0);
  let vocalFilter = baseHue !== 0 ? `hue-rotate(${baseHue}deg) saturate(145%)` : 'none';

  if (emotion === 'speaking') {
    vocalOpacity = Math.min(1, 0.25 + speechAmplitude * 0.88);
    vocalFilter = `hue-rotate(${baseHue}deg) brightness(${102 + Math.round(speechAmplitude * 35)}%)`;
  } else if (emotion === 'listening') {
    vocalOpacity = Math.min(1, 0.32 + micAmplitude * 0.72);
    vocalFilter = `hue-rotate(${baseHue - 6}deg) brightness(110%)`;
  } else if (emotion === 'hostile') {
    vocalOpacity = 0.92 + 0.08 * Math.sin(pulsePhase * 12);
    vocalFilter = `hue-rotate(${baseHue - 18}deg) saturate(200%) brightness(122%) drop-shadow(0 0 12px rgba(${themeShift.rgb}, 0.7))`;
  } else if (emotion === 'thinking' || activeStep > 0) {
    vocalOpacity = 0.38 + 0.22 * (0.5 + 0.5 * Math.sin(pulsePhase * 8));
  } else if (emotion === 'memory_sync') {
    vocalOpacity = 0.72 + 0.25 * Math.sin(pulsePhase * 9);
    vocalFilter = `hue-rotate(${baseHue - 20}deg) saturate(175%)`;
  } else if (emotion === 'loyal') {
    vocalOpacity = 0.68;
    vocalFilter = `hue-rotate(${baseHue + 8}deg) brightness(108%)`;
  }

  const servoY = Math.sin(pulsePhase * 1.6) * 2.5;
  const tiltDeg = mouseNorm.x * 0.9;
  const presenceMult =
    uiConfig?.avatarPresence === 'commanding'
      ? 1.11
      : uiConfig?.avatarPresence === 'recessed'
      ? 0.89
      : 1.0;
  const subtleScale =
    (emotion === 'hostile' ? 1.03 : emotion === 'listening' ? 1.015 : 1.0) * presenceMult;

  return (
    <div
      id="ultron-avatar-rig"
      className="relative w-full h-full flex items-end justify-center overflow-hidden pointer-events-none select-none"
    >
      {/* Ambient Back-Glow Behind Compact Ultron */}
      <div
        className="absolute bottom-[6%] w-[280px] h-[280px] xl:w-[340px] xl:h-[340px] rounded-full blur-3xl transition-all duration-500"
        style={{
          background:
            emotion === 'hostile'
              ? `radial-gradient(circle, rgba(${themeShift.rgb}, 0.42) 0%, transparent 72%)`
              : emotion === 'speaking'
              ? `radial-gradient(circle, rgba(${themeShift.rgb}, ${0.18 + speechAmplitude * 0.2}) 0%, transparent 70%)`
              : `radial-gradient(circle, rgba(${themeShift.rgb}, 0.16) 0%, transparent 70%)`,
        }}
      />

      {/* Compact, Crisp Ultron Bust Anchored Cleanly in the Middle Column */}
      <div
        className="relative h-[50vh] min-h-[300px] max-h-[450px] xl:h-[54vh] xl:max-h-[510px] aspect-[1920/1081] max-w-full transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: `translate3d(${mouseNorm.x * -4}px, ${servoY}px, 0) rotate(${tiltDeg}deg) scale(${subtleScale})`,
          transformOrigin: '50% 85%',
        }}
      >
        {/* Layer 1: Razor-Sharp Dark Vibranium Base Armor */}
        <img
          src="/assets/ultron-dark-base.webp"
          alt="Ultron Personal AI"
          className="w-full h-full object-contain drop-shadow-[0_14px_34px_rgba(0,0,0,0.95)]"
        />

        {/* Layer 2: Real Artwork Painted Eyes (Steady Mechanical Reactor — Zero Blinking/Slashes) */}
        <img
          src="/assets/ultron-eyes-glow.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-[filter] duration-500"
          style={{
            opacity: eyeOpacity,
            filter: eyeFilter,
          }}
        />

        {/* Layer 3: Real Artwork Mouth Vocalizer & Cheek Turbines (60fps Audio-Reactive Glow) */}
        <img
          src="/assets/ultron-vocal-glow.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-[filter] duration-300"
          style={{
            opacity: vocalOpacity,
            filter: vocalFilter,
          }}
        />
      </div>
    </div>
  );
};
