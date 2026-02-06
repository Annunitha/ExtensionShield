import React, { useEffect, useMemo, useRef, useState } from "react";
import "./CarRunnerGame.scss";

/**
 * Minimal offline mini-game (Chrome dino inspired):
 * - Space / ArrowUp to jump
 * - Auto-running; avoid obstacles
 * - If you crash: Space to restart
 */
const CarRunnerGame = ({ isActive = true, statusLabel = "Updates in progress" }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysDownRef = useRef(new Set());

  // UI state (render-only)
  const [ui, setUi] = useState({ score: 0, best: 0, crashed: false });

  // Game state (mutable refs to avoid re-rendering every frame)
  const gameRef = useRef({
    startedAt: 0,
    lastTs: 0,
    crashed: false,
    score: 0,
    best: 0,
    speed: 280, // px/s
    groundY: 0,
    car: { x: 0, y: 0, w: 44, h: 22, vy: 0, onGround: true },
    obstacles: [],
    nextSpawnIn: 0.8,
    blink: 0,
  });

  const hints = useMemo(
    () => ({
      play: "Space / ↑ to jump",
      restart: "Press Space to restart",
    }),
    []
  );

  // Resize canvas to device pixels, keep drawing in CSS pixels
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      const w = Math.max(280, Math.floor(rect.width));
      const h = Math.max(180, Math.floor(rect.height));

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = gameRef.current;
      g.groundY = Math.floor(h * 0.72);
      g.car.x = Math.floor(w * 0.18);
      g.car.y = g.groundY - g.car.h;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Keyboard input
  useEffect(() => {
    if (!isActive) return;

    const onDown = (e) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
      }
      keysDownRef.current.add(e.key);
    };
    const onUp = (e) => {
      keysDownRef.current.delete(e.key);
    };

    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [isActive]);

  const resetGame = () => {
    const g = gameRef.current;
    g.startedAt = performance.now();
    g.lastTs = 0;
    g.crashed = false;
    g.score = 0;
    g.speed = 280;
    g.obstacles = [];
    g.nextSpawnIn = 0.7;
    g.blink = 0;
    g.car.vy = 0;
    g.car.onGround = true;
    g.car.y = g.groundY - g.car.h;
    setUi((prev) => ({ score: 0, best: prev.best, crashed: false }));
  };

  // Main loop
  useEffect(() => {
    if (!isActive) return;
    resetGame();

    const step = (ts) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const g = gameRef.current;
      const w = Math.floor(canvas.clientWidth || 0);
      const h = Math.floor(canvas.clientHeight || 0);

      const dt = g.lastTs ? Math.min(0.033, (ts - g.lastTs) / 1000) : 0;
      g.lastTs = ts;

      // Input: jump (space / up)
      const keys = keysDownRef.current;
      const wantsJump = keys.has(" ") || keys.has("ArrowUp");
      if (wantsJump && !g.crashed && g.car.onGround) {
        g.car.vy = -520; // px/s
        g.car.onGround = false;
      }
      if ((wantsJump && g.crashed) || (keys.has("Enter") && g.crashed)) {
        resetGame();
      }

      // Update
      if (!g.crashed) {
        // speed scales gently with score
        g.speed = 280 + Math.min(260, g.score * 0.6);

        // physics
        g.car.vy += 1400 * dt;
        g.car.y += g.car.vy * dt;
        const groundCarY = g.groundY - g.car.h;
        if (g.car.y >= groundCarY) {
          g.car.y = groundCarY;
          g.car.vy = 0;
          g.car.onGround = true;
        }

        // spawn obstacles
        g.nextSpawnIn -= dt;
        if (g.nextSpawnIn <= 0) {
          const obstacleH = 18 + Math.random() * 18;
          const obstacleW = 10 + Math.random() * 14;
          g.obstacles.push({
            x: w + 20,
            y: g.groundY - obstacleH,
            w: obstacleW,
            h: obstacleH,
          });
          g.nextSpawnIn = 0.7 + Math.random() * 0.7;
        }

        // move obstacles
        for (const o of g.obstacles) {
          o.x -= g.speed * dt;
        }
        g.obstacles = g.obstacles.filter((o) => o.x + o.w > -40);

        // collision
        const carBox = {
          x: g.car.x + 6,
          y: g.car.y + 4,
          w: g.car.w - 12,
          h: g.car.h - 4,
        };
        for (const o of g.obstacles) {
          const hit =
            carBox.x < o.x + o.w &&
            carBox.x + carBox.w > o.x &&
            carBox.y < o.y + o.h &&
            carBox.y + carBox.h > o.y;
          if (hit) {
            g.crashed = true;
            g.best = Math.max(g.best, Math.floor(g.score));
            break;
          }
        }

        // score
        g.score += dt * 60; // ~60 pts/sec
      } else {
        g.blink += dt;
      }

      // Draw
      ctx.clearRect(0, 0, w, h);

      // background gradient (minimal, Weather-Please-ish)
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(15, 23, 42, 1)");
      bg.addColorStop(1, "rgba(2, 6, 23, 1)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // subtle noise dots
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 50; i++) {
        const x = (i * 97) % w;
        const y = (i * 53) % h;
        ctx.fillStyle = i % 3 === 0 ? "#60a5fa" : "#94a3b8";
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;

      // ground
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, g.groundY + 0.5);
      ctx.lineTo(w, g.groundY + 0.5);
      ctx.stroke();

      // road dashes
      ctx.strokeStyle = "rgba(34, 197, 94, 0.20)";
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.lineDashOffset = -((ts / 20) % 100);
      ctx.beginPath();
      ctx.moveTo(0, g.groundY + 18);
      ctx.lineTo(w, g.groundY + 18);
      ctx.stroke();
      ctx.setLineDash([]);

      // obstacles
      for (const o of g.obstacles) {
        ctx.fillStyle = "rgba(248, 113, 113, 0.95)";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.fillRect(o.x, o.y, o.w, 3);
      }

      // car (simple shape)
      const cx = g.car.x;
      const cy = g.car.y;
      ctx.fillStyle = "rgba(96, 165, 250, 0.95)";
      ctx.beginPath();
      ctx.roundRect(cx, cy + 6, g.car.w, g.car.h - 6, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(147, 197, 253, 0.75)";
      ctx.beginPath();
      ctx.roundRect(cx + 10, cy, g.car.w - 16, 12, 8);
      ctx.fill();

      // wheels
      const wheelY = cy + g.car.h - 2;
      const spin = (ts / 80) % (Math.PI * 2);
      const drawWheel = (x) => {
        ctx.fillStyle = "rgba(15, 23, 42, 1)";
        ctx.beginPath();
        ctx.arc(x, wheelY, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, wheelY);
        ctx.lineTo(x + Math.cos(spin) * 5, wheelY + Math.sin(spin) * 5);
        ctx.stroke();
      };
      drawWheel(cx + 12);
      drawWheel(cx + g.car.w - 12);

      // HUD
      const score = Math.floor(g.score);
      const best = Math.floor(g.best);
      ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
      ctx.font = "600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(`Score ${score}`, 14, 18);
      ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
      ctx.font = "500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(`Best ${best}`, 14, 36);

      // status pill (bottom center)
      const pillText = statusLabel;
      ctx.font = "500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const tw = ctx.measureText(pillText).width;
      const px = Math.floor(w / 2 - (tw + 28) / 2);
      const py = h - 34;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.roundRect(px, py, tw + 28, 22, 11);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
      ctx.fillText(pillText, px + 14, py + 15);

      // hint / crash overlay
      if (g.crashed) {
        const show = Math.floor(g.blink * 2) % 2 === 0;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(248, 113, 113, 0.95)";
        ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText("Crashed", Math.floor(w / 2 - 32), Math.floor(h / 2 - 8));
        if (show) {
          ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
          ctx.font = "500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
          ctx.fillText(hints.restart, Math.floor(w / 2 - 68), Math.floor(h / 2 + 14));
        }
      } else if (score < 40) {
        ctx.fillStyle = "rgba(226, 232, 240, 0.75)";
        ctx.font = "500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText(hints.play, Math.floor(w - 120), 18);
      }

      // sync UI state at ~10fps
      if (ts - (g._lastUiTs || 0) > 100) {
        g._lastUiTs = ts;
        setUi({ score, best, crashed: g.crashed });
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, hints.play, hints.restart, statusLabel]);

  return (
    <div className="car-runner">
      <div className="car-runner-frame" aria-label="Scan waiting mini-game">
        <canvas ref={canvasRef} className="car-runner-canvas" />
      </div>

      {/* Accessible fallback text (screen readers) */}
      <div className="sr-only" aria-live="polite">
        {ui.crashed
          ? `Crashed. ${hints.restart}. Score ${ui.score}. Best ${ui.best}.`
          : `Mini game running. ${hints.play}. Score ${ui.score}. Best ${ui.best}.`}
      </div>
    </div>
  );
};

export default CarRunnerGame;


