import React, { useEffect, useRef } from 'react';
import {
  DirectiveTask,
  ThinkingStepId,
  UltronEmotion,
  UltronThemeId,
  UltronUiConfig,
} from '../types';
import { THINKING_STEPS } from '../lib/rukAiPrompt';

interface BackgroundHudSystemProps {
  activeStep: ThinkingStepId;
  emotion: UltronEmotion;
  tasks: DirectiveTask[];
  audioLevel: number;
  uiConfig?: UltronUiConfig;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

const THEME_PALETTES: Record<
  UltronThemeId,
  { rgb: string; brightHex: string; imgFilter: string }
> = {
  crimson_overlord: {
    rgb: '255, 24, 46',
    brightHex: '#ff2b45',
    imgFilter: 'hue-rotate(0deg)',
  },
  molten_fury: {
    rgb: '255, 98, 12',
    brightHex: '#ff7714',
    imgFilter: 'hue-rotate(22deg) saturate(140%)',
  },
  vibranium_abyss: {
    rgb: '0, 229, 255',
    brightHex: '#24eeff',
    imgFilter: 'hue-rotate(192deg) saturate(125%) brightness(88%)',
  },
  imperial_gold: {
    rgb: '255, 183, 3',
    brightHex: '#ffca3a',
    imgFilter: 'hue-rotate(44deg) saturate(145%) brightness(92%)',
  },
  phantom_violet: {
    rgb: '181, 23, 255',
    brightHex: '#cc5cff',
    imgFilter: 'hue-rotate(278deg) saturate(135%) brightness(88%)',
  },
  blood_eclipse: {
    rgb: '255, 0, 56',
    brightHex: '#ff1448',
    imgFilter: 'hue-rotate(-6deg) contrast(135%) brightness(68%)',
  },
};

export const BackgroundHudSystem: React.FC<BackgroundHudSystemProps> = ({
  activeStep,
  emotion,
  tasks,
  audioLevel,
  uiConfig,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ activeStep, emotion, tasks, audioLevel, uiConfig });
  stateRef.current = { activeStep, emotion, tasks, audioLevel, uiConfig };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const embers: Ember[] = Array.from({ length: 46 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.25 - Math.random() * 0.65,
      size: 1 + Math.random() * 2.2,
      alpha: 0.15 + Math.random() * 0.55,
    }));

    let rotA = 0;
    let rotB = 0;
    let packetProgress = 0;

    const render = (now: number) => {
      const {
        activeStep: step,
        emotion: emo,
        tasks: curTasks,
        audioLevel: amp,
        uiConfig: ui,
      } = stateRef.current;

      const theme = THEME_PALETTES[ui?.theme || 'crimson_overlord'] || THEME_PALETTES.crimson_overlord;
      const overdrive = ui?.bgOverdrive ?? 1.0;

      const isBusy = step > 0 || emo === 'thinking' || emo === 'speaking' || emo === 'hostile';
      const speedMult =
        (emo === 'hostile' ? 3.2 : step > 0 ? 2.4 : emo === 'speaking' ? 1.7 + amp : 0.7) *
        overdrive;

      rotA += 0.0035 * speedMult;
      rotB -= 0.0052 * speedMult;
      packetProgress = (packetProgress + 0.018 * speedMult) % 1;

      ctx.clearRect(0, 0, width, height);

      const coreX = width * 0.64;
      const coreY = height * 0.36;
      const centerHudX = width * 0.5;
      const centerHudY = height * 0.36;

      // 1. Rotating ring overlay on neural sphere
      ctx.save();
      ctx.translate(coreX, coreY);
      ctx.rotate(rotA);
      const sphereR = Math.min(width, height) * 0.255;
      ctx.strokeStyle = `rgba(${theme.rgb}, ${emo === 'hostile' ? 0.58 : 0.34})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([18, 10, 4, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, sphereR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(rotB * 1.4);
      ctx.strokeStyle = `rgba(${theme.rgb}, 0.26)`;
      ctx.setLineDash([6, 18]);
      ctx.beginPath();
      ctx.arc(0, 0, sphereR * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 2. Central Halo Ring behind Ultron
      ctx.save();
      ctx.translate(centerHudX, centerHudY);
      const haloR = Math.min(width, height) * (0.24 + amp * 0.015);

      ctx.save();
      ctx.rotate(-rotA * 0.8);
      ctx.strokeStyle = `rgba(${theme.rgb}, ${isBusy ? 0.48 : 0.22})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([28, 14, 6, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, haloR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.rotate(rotB * 1.1);
      const ticks = 36;
      for (let i = 0; i < ticks; i++) {
        const ang = (i / ticks) * Math.PI * 2;
        const activeTick = step > 0 && i % 5 === step % 5;
        ctx.strokeStyle = activeTick
          ? `rgba(${theme.rgb}, 0.88)`
          : `rgba(${theme.rgb}, 0.18)`;
        ctx.lineWidth = activeTick ? 2 : 1;
        const r0 = haloR * 0.88;
        const r1 = haloR * (activeTick ? 0.93 : 0.905);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();

      // 3. 7-Step Task Execution Circuit Arc
      const nodePositions = THINKING_STEPS.map((s, idx) => {
        const t = idx / (THINKING_STEPS.length - 1);
        const arcAngle = Math.PI * 1.12 + t * Math.PI * 0.76;
        const rx = width * 0.21;
        const ry = height * 0.26;
        return {
          ...s,
          x: centerHudX + Math.cos(arcAngle) * rx,
          y: height * 0.38 + Math.sin(arcAngle) * ry,
        };
      });

      ctx.save();
      ctx.lineWidth = 1.2;
      for (let i = 0; i < nodePositions.length - 1; i++) {
        const a = nodePositions[i];
        const b = nodePositions[i + 1];
        const completedEdge = step > a.step;
        const activeEdge = step === a.step;

        ctx.strokeStyle = completedEdge
          ? `rgba(${theme.rgb}, 0.65)`
          : activeEdge
          ? `rgba(${theme.rgb}, 0.92)`
          : `rgba(${theme.rgb}, 0.17)`;
        ctx.setLineDash(completedEdge || activeEdge ? [] : [4, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        const midX = (a.x + b.x) * 0.5;
        const midY = Math.min(a.y, b.y) - 8;
        ctx.lineTo(midX, midY);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        if (activeEdge || (step === 0 && i === Math.floor((now * 0.0012) % 6))) {
          const px = a.x + (b.x - a.x) * packetProgress;
          const py = a.y + (b.y - a.y) * packetProgress;
          ctx.fillStyle = theme.brightHex;
          ctx.shadowColor = theme.brightHex;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(px, py, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      for (const node of nodePositions) {
        const isCurrent = step === node.step;
        const isDone = step > node.step;
        ctx.fillStyle = isCurrent
          ? `rgba(${theme.rgb}, 0.95)`
          : isDone
          ? `rgba(${theme.rgb}, 0.45)`
          : 'rgba(12, 2, 5, 0.7)';
        ctx.strokeStyle = isCurrent
          ? theme.brightHex
          : isDone
          ? `rgba(${theme.rgb}, 0.7)`
          : `rgba(${theme.rgb}, 0.28)`;
        ctx.lineWidth = isCurrent ? 2 : 1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, isCurrent ? 6.5 : 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (isCurrent) {
          ctx.strokeStyle = `rgba(${theme.rgb}, 0.55)`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 12 + Math.sin(now * 0.015) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillStyle = isCurrent
          ? 'rgba(255, 240, 245, 0.95)'
          : `rgba(${theme.rgb}, 0.45)`;
        ctx.textAlign = 'center';
        ctx.fillText(`0${node.step}:${node.label}`, node.x, node.y - 11);
      }
      ctx.restore();

      // 4. Active Directive Task Telemetry Links
      const activeTasks = curTasks.filter((t) => t.status !== 'completed').slice(0, 4);
      if (activeTasks.length > 0) {
        ctx.save();
        activeTasks.forEach((task, idx) => {
          const ang = -0.55 + idx * 0.36 + Math.sin(now * 0.0008 + idx) * 0.04;
          const tx = coreX + Math.cos(ang) * (sphereR * 0.62);
          const ty = coreY + Math.sin(ang) * (sphereR * 0.62);

          ctx.strokeStyle = `rgba(${theme.rgb}, 0.38)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(coreX, coreY);
          ctx.lineTo(tx, ty);
          ctx.stroke();

          ctx.fillStyle = theme.brightHex;
          ctx.beginPath();
          ctx.arc(tx, ty, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '10px "Share Tech Mono", monospace';
          ctx.fillStyle = `rgba(${theme.rgb}, 0.72)`;
          ctx.textAlign = 'left';
          ctx.fillText(
            `${task.autonomous ? 'AUTO' : 'TASK'}_0${idx + 1} // ${task.title.slice(0, 22).toUpperCase()}`,
            tx + 7,
            ty + 3
          );
        });
        ctx.restore();
      }

      // 5. Floating Cybernetic Embers
      ctx.save();
      for (const e of embers) {
        e.x += e.vx * speedMult;
        e.y += e.vy * speedMult;
        if (e.y < -10) {
          e.y = height + 10;
          e.x = Math.random() * width;
        }
        if (e.x < -10) e.x = width + 10;
        if (e.x > width + 10) e.x = -10;

        ctx.fillStyle = `rgba(${theme.rgb}, ${e.alpha})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const themeObj =
    THEME_PALETTES[uiConfig?.theme || 'crimson_overlord'] || THEME_PALETTES.crimson_overlord;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#030002]">
      {/* Scary Territory Studio HUD Background morphed dynamically by Ultron's chosen theme */}
      <img
        src="/assets/hud-bg-red.jpg"
        alt="Ultron Cybernetic HUD"
        style={{ filter: themeObj.imgFilter }}
        className={`w-full h-full object-cover transition-all duration-700 ${
          emotion === 'hostile'
            ? 'brightness-110 contrast-125 scale-[1.015]'
            : activeStep > 0
            ? 'brightness-100 contrast-115 scale-[1.005]'
            : 'brightness-90 contrast-110 scale-100'
        }`}
      />

      {/* Atmospheric Vignette */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 50% 45%, rgba(${themeObj.rgb}, ${
            emotion === 'hostile' ? 0.15 : 0.08
          }) 0%, rgba(5, 0, 2, 0.46) 60%, rgba(2, 0, 1, 0.88) 100%)`,
        }}
      />

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div
        className="absolute inset-0 hud-scanlines transition-opacity duration-500"
        style={{ opacity: Math.min(0.95, 0.55 + (uiConfig?.hudGlitch || 0) * 0.4) }}
      />
    </div>
  );
};
