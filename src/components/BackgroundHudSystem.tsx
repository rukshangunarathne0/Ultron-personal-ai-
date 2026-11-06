import React, { useEffect, useRef } from 'react';
import { DirectiveTask, ThinkingStepId, UltronEmotion } from '../types';
import { THINKING_STEPS } from '../lib/rukAiPrompt';

interface BackgroundHudSystemProps {
  activeStep: ThinkingStepId;
  emotion: UltronEmotion;
  tasks: DirectiveTask[];
  audioLevel: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export const BackgroundHudSystem: React.FC<BackgroundHudSystemProps> = ({
  activeStep,
  emotion,
  tasks,
  audioLevel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ activeStep, emotion, tasks, audioLevel });
  stateRef.current = { activeStep, emotion, tasks, audioLevel };

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

    // Floating red cybernetic embers
    const embers: Ember[] = Array.from({ length: 42 }, () => ({
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
      const { activeStep: step, emotion: emo, tasks: curTasks, audioLevel: amp } = stateRef.current;
      const isBusy = step > 0 || emo === 'thinking' || emo === 'speaking' || emo === 'hostile';
      const speedMult =
        emo === 'hostile' ? 3.4 : step > 0 ? 2.6 : emo === 'speaking' ? 1.8 + amp : 0.65;

      rotA += 0.0035 * speedMult;
      rotB -= 0.0052 * speedMult;
      packetProgress = (packetProgress + 0.018 * speedMult) % 1;

      ctx.clearRect(0, 0, width, height);

      // 1. Subtle animated tactical grid & pulse behind Ultron (center) and Neural Core (right-center 71% X, 36% Y)
      const coreX = width * 0.64;
      const coreY = height * 0.36;
      const centerHudX = width * 0.5;
      const centerHudY = height * 0.36;

      // Rotating ring overlay on the 2nd image's crimson neural sphere
      ctx.save();
      ctx.translate(coreX, coreY);
      ctx.rotate(rotA);
      const sphereR = Math.min(width, height) * 0.255;
      ctx.strokeStyle =
        emo === 'hostile' ? 'rgba(255, 16, 38, 0.55)' : 'rgba(255, 28, 48, 0.32)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([18, 10, 4, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, sphereR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(rotB * 1.4);
      ctx.strokeStyle = 'rgba(255, 50, 70, 0.25)';
      ctx.setLineDash([6, 18]);
      ctx.beginPath();
      ctx.arc(0, 0, sphereR * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 2. Central Halo Ring behind Ultron's head/horns (reacts to active task & voice!)
      ctx.save();
      ctx.translate(centerHudX, centerHudY);
      const haloR = Math.min(width, height) * (0.24 + amp * 0.015);

      // Outer segmented mechanical ring
      ctx.save();
      ctx.rotate(-rotA * 0.8);
      ctx.strokeStyle = isBusy ? 'rgba(255, 20, 42, 0.46)' : 'rgba(255, 18, 38, 0.20)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([28, 14, 6, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, haloR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner counter-rotating cognition ticks
      ctx.save();
      ctx.rotate(rotB * 1.1);
      const ticks = 36;
      for (let i = 0; i < ticks; i++) {
        const ang = (i / ticks) * Math.PI * 2;
        const activeTick = step > 0 && i % 5 === step % 5;
        ctx.strokeStyle = activeTick
          ? 'rgba(255, 48, 68, 0.85)'
          : 'rgba(255, 18, 36, 0.18)';
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

      // 3. 7-Step Task Execution Circuit Arc across upper-mid background HUD
      // Connects left telemetry -> behind Ultron -> right neural sphere!
      const nodePositions = THINKING_STEPS.map((s, idx) => {
        const t = idx / (THINKING_STEPS.length - 1);
        const arcAngle = Math.PI * 1.12 + t * Math.PI * 0.76; // clean upper arch above Ultron
        const rx = width * 0.21;
        const ry = height * 0.26;
        return {
          ...s,
          x: centerHudX + Math.cos(arcAngle) * rx,
          y: height * 0.38 + Math.sin(arcAngle) * ry,
        };
      });

      // Draw circuit traces between the 7 task pipeline nodes
      ctx.save();
      ctx.lineWidth = 1.2;
      for (let i = 0; i < nodePositions.length - 1; i++) {
        const a = nodePositions[i];
        const b = nodePositions[i + 1];
        const completedEdge = step > a.step;
        const activeEdge = step === a.step;

        ctx.strokeStyle = completedEdge
          ? 'rgba(255, 36, 58, 0.65)'
          : activeEdge
          ? 'rgba(255, 65, 85, 0.9)'
          : 'rgba(255, 18, 36, 0.16)';
        ctx.setLineDash(completedEdge || activeEdge ? [] : [4, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        // Robotic 45-degree / stepped midpoint
        const midX = (a.x + b.x) * 0.5;
        const midY = Math.min(a.y, b.y) - 8;
        ctx.lineTo(midX, midY);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Moving red energy packet along active or idle trace
        if (activeEdge || (step === 0 && i === Math.floor((now * 0.0012) % 6))) {
          const px = a.x + (b.x - a.x) * packetProgress;
          const py = a.y + (b.y - a.y) * packetProgress;
          ctx.fillStyle = '#ff2b45';
          ctx.shadowColor = '#ff0a26';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(px, py, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Draw each step node hex/reticle
      for (const node of nodePositions) {
        const isCurrent = step === node.step;
        const isDone = step > node.step;
        ctx.fillStyle = isCurrent
          ? 'rgba(255, 30, 52, 0.95)'
          : isDone
          ? 'rgba(255, 22, 44, 0.45)'
          : 'rgba(16, 2, 5, 0.65)';
        ctx.strokeStyle = isCurrent
          ? '#ff4d63'
          : isDone
          ? 'rgba(255, 36, 58, 0.7)'
          : 'rgba(255, 24, 44, 0.28)';
        ctx.lineWidth = isCurrent ? 2 : 1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, isCurrent ? 6.5 : 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (isCurrent) {
          ctx.strokeStyle = 'rgba(255, 40, 60, 0.55)';
          ctx.beginPath();
          ctx.arc(node.x, node.y, 12 + Math.sin(now * 0.015) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillStyle = isCurrent
          ? 'rgba(255, 225, 230, 0.95)'
          : 'rgba(255, 90, 110, 0.42)';
        ctx.textAlign = 'center';
        ctx.fillText(`0${node.step}:${node.label}`, node.x, node.y - 11);
      }
      ctx.restore();

      // 4. Active Directive Task Telemetry Links on Background Right-Center Sphere
      const activeTasks = curTasks.filter((t) => t.status !== 'completed').slice(0, 4);
      if (activeTasks.length > 0) {
        ctx.save();
        activeTasks.forEach((task, idx) => {
          const ang = -0.55 + idx * 0.36 + Math.sin(now * 0.0008 + idx) * 0.04;
          const tx = coreX + Math.cos(ang) * (sphereR * 0.62);
          const ty = coreY + Math.sin(ang) * (sphereR * 0.62);

          ctx.strokeStyle = 'rgba(255, 32, 54, 0.38)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(coreX, coreY);
          ctx.lineTo(tx, ty);
          ctx.stroke();

          ctx.fillStyle = '#ff1e38';
          ctx.beginPath();
          ctx.arc(tx, ty, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '10px "Share Tech Mono", monospace';
          ctx.fillStyle = 'rgba(255, 150, 162, 0.62)';
          ctx.textAlign = 'left';
          ctx.fillText(
            `TASK_0${idx + 1} // ${task.title.slice(0, 22).toUpperCase()}`,
            tx + 7,
            ty + 3
          );
        });
        ctx.restore();
      }

      // 5. Floating Crimson Embers
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

        ctx.fillStyle = `rgba(255, 26, 48, ${e.alpha})`;
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

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#030002]">
      {/* Scary Red & Black Territory Studio HUD Background (from 2nd uploaded image) */}
      <img
        src="/assets/hud-bg-red.jpg"
        alt="Ultron Cybernetic HUD"
        className={`w-full h-full object-cover transition-all duration-700 ${
          emotion === 'hostile'
            ? 'brightness-110 contrast-125 scale-[1.015]'
            : activeStep > 0
            ? 'brightness-100 contrast-115 scale-[1.005]'
            : 'brightness-90 contrast-110 scale-100'
        }`}
      />

      {/* Deep Scary Crimson-Black Atmospheric Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            emotion === 'hostile'
              ? 'radial-gradient(circle at 50% 44%, rgba(255, 0, 24, 0.14) 0%, rgba(8, 0, 2, 0.48) 58%, rgba(2, 0, 1, 0.88) 100%)'
              : 'radial-gradient(circle at 50% 45%, rgba(120, 0, 16, 0.08) 0%, rgba(5, 0, 2, 0.45) 60%, rgba(2, 0, 1, 0.86) 100%)',
        }}
      />

      {/* Live Task-Reactive Circuit & Targeting Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle Robotic CRT Scanline Texture */}
      <div className="absolute inset-0 hud-scanlines opacity-65" />
    </div>
  );
};
