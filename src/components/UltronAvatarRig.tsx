import React, { useEffect, useState } from 'react';
import { ThinkingStepId, UltronEmotion } from '../types';

interface UltronAvatarRigProps {
  emotion: UltronEmotion;
  activeStep: ThinkingStepId;
  speechAmplitude: number; // 0..1 when Ultron speaks
  micAmplitude: number;    // 0..1 when Rukshan speaks into mic
}

export const UltronAvatarRig: React.FC<UltronAvatarRigProps> = ({
  emotion,
  activeStep,
  speechAmplitude,
  micAmplitude,
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

  // 1. Authentic Mechanical Optic Reactor Intensity (NO human blinking, NO slashes, NO fake shapes!)
  let eyeOpacity = 0.86 + 0.08 * Math.sin(pulsePhase * 2.2);
  let eyeFilter = 'none';

  if (emotion === 'hostile') {
    eyeOpacity = 1;
    eyeFilter =
      'hue-rotate(-24deg) saturate(210%) brightness(128%) drop-shadow(0 0 10px rgba(255, 10, 34, 0.85))';
  } else if (emotion === 'thinking' || activeStep === 2 || activeStep === 3) {
    // Rapid mechanical calculation shimmer inside his real eye sockets
    eyeOpacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(pulsePhase * 14));
    eyeFilter = 'hue-rotate(-8deg) brightness(115%)';
  } else if (emotion === 'listening') {
    eyeOpacity = 0.96;
    eyeFilter = 'brightness(120%) drop-shadow(0 0 6px rgba(255, 80, 30, 0.55))';
  } else if (emotion === 'speaking') {
    eyeOpacity = Math.min(1, 0.88 + speechAmplitude * 0.15);
    eyeFilter = 'brightness(115%)';
  } else if (emotion === 'memory_sync' || activeStep === 6) {
    eyeOpacity = 0.7 + 0.3 * Math.sin(pulsePhase * 10);
    eyeFilter = 'hue-rotate(-26deg) saturate(180%) brightness(120%)';
  } else if (emotion === 'loyal') {
    eyeOpacity = 0.94;
    eyeFilter = 'hue-rotate(10deg) brightness(112%)';
  } else if (emotion === 'alert') {
    eyeOpacity = 0.5 + 0.5 * Math.abs(Math.sin(pulsePhase * 9));
    eyeFilter = 'hue-rotate(-18deg) saturate(180%) brightness(125%)';
  }

  // 2. Authentic Mouth Core & Cheek Turbines Intensity (reacts smoothly at 60fps to voice!)
  let vocalOpacity = 0.28 + 0.1 * Math.sin(pulsePhase * 2.0);
  let vocalFilter = 'none';

  if (emotion === 'speaking') {
    vocalOpacity = Math.min(1, 0.25 + speechAmplitude * 0.88);
    vocalFilter = `brightness(${102 + Math.round(speechAmplitude * 35)}%)`;
  } else if (emotion === 'listening') {
    vocalOpacity = Math.min(1, 0.32 + micAmplitude * 0.72);
    vocalFilter = 'hue-rotate(-8deg) brightness(110%)';
  } else if (emotion === 'hostile') {
    vocalOpacity = 0.92 + 0.08 * Math.sin(pulsePhase * 12);
    vocalFilter =
      'hue-rotate(-24deg) saturate(200%) brightness(122%) drop-shadow(0 0 12px rgba(255, 12, 36, 0.7))';
  } else if (emotion === 'thinking' || activeStep > 0) {
    vocalOpacity = 0.38 + 0.22 * (0.5 + 0.5 * Math.sin(pulsePhase * 8));
  } else if (emotion === 'memory_sync') {
    vocalOpacity = 0.72 + 0.25 * Math.sin(pulsePhase * 9);
    vocalFilter = 'hue-rotate(-24deg) saturate(175%)';
  } else if (emotion === 'loyal') {
    vocalOpacity = 0.68;
    vocalFilter = 'hue-rotate(8deg) brightness(108%)';
  }

  // Subtle weighty mechanical servo posture (no exaggerated zoom!)
  const servoY = Math.sin(pulsePhase * 1.6) * 2.5;
  const tiltDeg = mouseNorm.x * 0.9;
  const subtleScale = emotion === 'hostile' ? 1.03 : emotion === 'listening' ? 1.015 : 1.0;

  return (
    <div className="relative w-full h-full flex items-end justify-center overflow-hidden pointer-events-none select-none">
      {/* Subtle Ambient Crimson Back-Glow Behind Small Ultron */}
      <div
        className="absolute bottom-[6%] w-[280px] h-[280px] xl:w-[340px] xl:h-[340px] rounded-full blur-3xl transition-all duration-500"
        style={{
          background:
            emotion === 'hostile'
              ? 'radial-gradient(circle, rgba(255, 8, 32, 0.42) 0%, transparent 72%)'
              : emotion === 'speaking'
              ? `radial-gradient(circle, rgba(255, 28, 42, ${0.18 + speechAmplitude * 0.2}) 0%, transparent 70%)`
              : 'radial-gradient(circle, rgba(190, 8, 28, 0.16) 0%, transparent 70%)',
        }}
      />

      {/* Compact, Crisp, Smaller Ultron Bust Anchored Cleanly in the Middle Column */}
      <div
        className="relative h-[50vh] min-h-[300px] max-h-[450px] xl:h-[54vh] xl:max-h-[510px] aspect-[1920/1081] max-w-full transition-transform duration-200 ease-out will-change-transform"
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
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
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
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            opacity: vocalOpacity,
            filter: vocalFilter,
          }}
        />
      </div>
    </div>
  );
};
