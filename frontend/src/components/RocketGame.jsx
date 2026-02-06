import React, { useEffect, useRef, useState } from "react";
import "./RocketGame.scss";

/**
 * Rocket Liftoff Game with Shooting Targets
 * - Arrow keys / WASD to move rocket
 * - Space to shoot
 * - Destroy targets to score points
 * - Easy and visually appealing
 */
const RocketGame = ({ isActive = true, statusLabel = "Running the scan..." }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysDownRef = useRef(new Set());

  const [ui, setUi] = useState({ score: 0, best: 0, gameOver: false });

  const gameRef = useRef({
    startedAt: 0,
    lastTs: 0,
    gameOver: false,
    score: 0,
    best: 0,
    rocket: { x: 0, y: 0, w: 30, h: 50, speed: 200 },
    bullets: [],
    targets: [],
    nextTargetSpawn: 0,
    stars: [],
    particles: [],
  });

  // Initialize stars - more stars for larger screens
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 400;
    const screenArea = w * h;
    
    // More stars for larger screens
    const numStars = Math.min(50 + Math.floor(screenArea / 10000), 150);
    
    const stars = [];
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 20 + 10,
      });
    }
    gameRef.current.stars = stars;
  }, []);

  // Resize canvas and focus for keyboard input
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      const w = Math.max(400, Math.floor(rect.width));
      const h = Math.max(300, Math.floor(rect.height));

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = gameRef.current;
      g.rocket.x = 50;
      g.rocket.y = h / 2;
    };

    resize();
    
    // Make canvas focusable and focus it when game is active
    if (isActive) {
      canvas.setAttribute('tabindex', '0');
      canvas.focus();
    }
    
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [isActive]);

  // Keyboard input - prevent scrolling with arrow keys
  useEffect(() => {
    if (!isActive) return;

    const onDown = (e) => {
      const key = e.key.toLowerCase();
      // Prevent default for all game keys to stop page scrolling
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "enter"].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      keysDownRef.current.add(key);
    };
    
    const onUp = (e) => {
      const key = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "enter"].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      keysDownRef.current.delete(key);
    };

    // Use capture phase to catch events early
    document.addEventListener("keydown", onDown, { passive: false, capture: true });
    document.addEventListener("keyup", onUp, { passive: false, capture: true });
    
    // Also prevent wheel/scroll events when game is focused
    const preventScroll = (e) => {
      if (e.target.closest('.rocket-game')) {
        e.preventDefault();
      }
    };
    
    return () => {
      document.removeEventListener("keydown", onDown, { capture: true });
      document.removeEventListener("keyup", onUp, { capture: true });
    };
  }, [isActive]);

  const resetGame = () => {
    const g = gameRef.current;
    const canvas = canvasRef.current;
    const h = canvas ? canvas.clientHeight : 400;
    
    g.startedAt = performance.now();
    g.lastTs = 0;
    g.gameOver = false;
    g.score = 0;
    g.rocket.x = 50;
    g.rocket.y = h / 2;
    g.bullets = [];
    g.targets = [];
    g.nextTargetSpawn = 1;
    g.particles = [];
    setUi((prev) => ({ score: 0, best: prev.best, gameOver: false }));
  };

  // Main game loop
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

      // Polyfill for roundRect if not available
      if (!ctx.roundRect) {
        ctx.roundRect = function(x, y, w, h, r) {
          if (w < 2 * r) r = w / 2;
          if (h < 2 * r) r = h / 2;
          this.beginPath();
          this.moveTo(x + r, y);
          this.arcTo(x + w, y, x + w, y + h, r);
          this.arcTo(x + w, y + h, x, y + h, r);
          this.arcTo(x, y + h, x, y, r);
          this.arcTo(x, y, x + w, y, r);
          this.closePath();
          return this;
        };
      }

      const g = gameRef.current;
      const w = Math.floor(canvas.clientWidth || 600);
      const h = Math.floor(canvas.clientHeight || 400);

      const dt = g.lastTs ? Math.min(0.033, (ts - g.lastTs) / 1000) : 0;
      g.lastTs = ts;

      const keys = keysDownRef.current;
      
      // Restart on Enter if game over
      if (g.gameOver && (keys.has("enter") || keys.has(" "))) {
        resetGame();
      }

      if (!g.gameOver) {
        // Rocket movement
        if (keys.has("arrowup") || keys.has("w")) {
          g.rocket.y = Math.max(g.rocket.h / 2, g.rocket.y - g.rocket.speed * dt);
        }
        if (keys.has("arrowdown") || keys.has("s")) {
          g.rocket.y = Math.min(h - g.rocket.h / 2, g.rocket.y + g.rocket.speed * dt);
        }
        if (keys.has("arrowleft") || keys.has("a")) {
          g.rocket.x = Math.max(g.rocket.w / 2, g.rocket.x - g.rocket.speed * dt);
        }
        if (keys.has("arrowright") || keys.has("d")) {
          g.rocket.x = Math.min(w - g.rocket.w / 2, g.rocket.x + g.rocket.speed * dt);
        }

        // Shooting
        if (keys.has(" ") && (ts - (g._lastShot || 0)) > 150) {
          g._lastShot = ts;
          g.bullets.push({
            x: g.rocket.x + g.rocket.w,
            y: g.rocket.y,
            w: 8,
            h: 4,
            speed: 400,
          });
        }

        // Spawn targets - adaptive based on screen size and difficulty
        g.nextTargetSpawn -= dt;
        if (g.nextTargetSpawn <= 0) {
          // Calculate difficulty multiplier based on score (increases over time)
          const difficultyMultiplier = 1 + (g.score / 500); // Gets harder as score increases
          
          // Calculate how many targets to spawn based on screen size
          // Larger screens get more targets
          const screenArea = w * h;
          const baseTargets = screenArea > 800000 ? 3 : screenArea > 400000 ? 2 : 1; // 3 for large, 2 for medium, 1 for small
          const numTargets = Math.min(baseTargets + Math.floor(g.score / 200), 5); // Max 5 targets at once
          
          // Spawn multiple targets
          for (let i = 0; i < numTargets; i++) {
            const targetSize = 15 + Math.random() * 25;
            const minSpeed = 60 * difficultyMultiplier;
            const maxSpeed = 120 * difficultyMultiplier;
            
            g.targets.push({
              x: w + 20 + (i * 40), // Stagger spawn positions
              y: Math.random() * (h - targetSize - 40) + 20,
              w: targetSize,
              h: targetSize,
              speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
              color: `hsl(${Math.random() * 60 + 0}, 70%, 60%)`, // Red to orange
            });
          }
          
          // Spawn rate decreases (more frequent) as difficulty increases, but with a minimum
          const baseSpawnRate = 1.2;
          const minSpawnRate = 0.4; // Don't spawn faster than every 0.4 seconds
          g.nextTargetSpawn = Math.max(minSpawnRate, baseSpawnRate / difficultyMultiplier) + Math.random() * 0.3;
        }

        // Update bullets
        for (const bullet of g.bullets) {
          bullet.x += bullet.speed * dt;
        }
        g.bullets = g.bullets.filter((b) => b.x < w + 50);

        // Update targets
        for (const target of g.targets) {
          target.x -= target.speed * dt;
        }
        g.targets = g.targets.filter((t) => t.x + t.w > -50);

        // Collision detection: bullets vs targets
        for (let i = g.bullets.length - 1; i >= 0; i--) {
          const bullet = g.bullets[i];
          for (let j = g.targets.length - 1; j >= 0; j--) {
            const target = g.targets[j];
            if (
              bullet.x < target.x + target.w &&
              bullet.x + bullet.w > target.x &&
              bullet.y < target.y + target.h &&
              bullet.y + bullet.h > target.y
            ) {
              // Hit! Create particles
              for (let k = 0; k < 8; k++) {
                g.particles.push({
                  x: target.x + target.w / 2,
                  y: target.y + target.h / 2,
                  vx: (Math.random() - 0.5) * 200,
                  vy: (Math.random() - 0.5) * 200,
                  life: 0.5,
                  color: target.color,
                });
              }
              g.bullets.splice(i, 1);
              g.targets.splice(j, 1);
              // Points based on target size - smaller targets worth more
              const basePoints = 10;
              const sizeBonus = Math.max(0, 30 - target.w); // Smaller = more points
              g.score += basePoints + Math.floor(sizeBonus / 2);
              break;
            }
          }
        }

        // Collision detection: rocket vs targets
        for (const target of g.targets) {
          if (
            g.rocket.x < target.x + target.w &&
            g.rocket.x + g.rocket.w > target.x &&
            g.rocket.y < target.y + target.h &&
            g.rocket.y + g.rocket.h > target.y
          ) {
            g.gameOver = true;
            g.best = Math.max(g.best, g.score);
            break;
          }
        }

        // Update particles
        for (const particle of g.particles) {
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.life -= dt;
        }
        g.particles = g.particles.filter((p) => p.life > 0);

        // Update stars (parallax)
        for (const star of g.stars) {
          star.x -= star.speed * dt;
          if (star.x < 0) {
            star.x = w;
            star.y = Math.random() * h;
          }
        }
      }

      // Drawing
      ctx.clearRect(0, 0, w, h);

      // Background gradient (space theme)
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0a0f1a");
      bg.addColorStop(0.5, "#1a1f2e");
      bg.addColorStop(1, "#0f1419");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Stars
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      for (const star of g.stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles
      for (const particle of g.particles) {
        ctx.globalAlpha = particle.life / 0.5;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Targets
      for (const target of g.targets) {
        // Outer glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = target.color;
        ctx.fillStyle = target.color;
        ctx.beginPath();
        ctx.arc(target.x + target.w / 2, target.y + target.h / 2, target.w / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner circle
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        ctx.arc(target.x + target.w / 2, target.y + target.h / 2, target.w / 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bullets
      ctx.fillStyle = "#60a5fa";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#60a5fa";
      for (const bullet of g.bullets) {
        ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
      }
      ctx.shadowBlur = 0;

      // Rocket
      const rx = g.rocket.x;
      const ry = g.rocket.y;
      const rw = g.rocket.w;
      const rh = g.rocket.h;

      // Rocket body (triangle)
      ctx.fillStyle = "#3b82f6";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(rx + rw, ry);
      ctx.lineTo(rx, ry - rh / 2);
      ctx.lineTo(rx, ry + rh / 2);
      ctx.closePath();
      ctx.fill();

      // Rocket window
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#87ceeb";
      ctx.beginPath();
      ctx.arc(rx + rw * 0.3, ry, rh * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Rocket flames
      const flameOffset = Math.sin(ts / 50) * 3;
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(rx - 5, ry - rh * 0.3);
      ctx.lineTo(rx - 15 - flameOffset, ry - rh * 0.1);
      ctx.lineTo(rx - 10, ry);
      ctx.lineTo(rx - 15 + flameOffset, ry + rh * 0.1);
      ctx.lineTo(rx - 5, ry + rh * 0.3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(rx - 5, ry - rh * 0.2);
      ctx.lineTo(rx - 12 - flameOffset * 0.7, ry - rh * 0.05);
      ctx.lineTo(rx - 8, ry);
      ctx.lineTo(rx - 12 + flameOffset * 0.7, ry + rh * 0.05);
      ctx.lineTo(rx - 5, ry + rh * 0.2);
      ctx.closePath();
      ctx.fill();

      // HUD
      ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
      ctx.font = "600 14px system-ui, -apple-system, sans-serif";
      ctx.fillText(`Score: ${Math.floor(g.score)}`, 12, 24);
      ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
      ctx.font = "500 12px system-ui, -apple-system, sans-serif";
      ctx.fillText(`Best: ${Math.floor(g.best)}`, 12, 42);

      // Status label
      ctx.font = "500 12px system-ui, -apple-system, sans-serif";
      const statusText = statusLabel;
      const tw = ctx.measureText(statusText).width;
      const px = Math.floor(w / 2 - (tw + 28) / 2);
      const py = h - 32;
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.roundRect(px, py, tw + 28, 22, 11);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
      ctx.fillText(statusText, px + 14, py + 15);

      // Controls hint
      if (g.score < 30) {
        ctx.fillStyle = "rgba(226, 232, 240, 0.7)";
        ctx.font = "500 11px system-ui, -apple-system, sans-serif";
        ctx.fillText("Arrow keys / WASD: Move | Space: Shoot", w - 220, 24);
      }

      // Game over overlay
      if (g.gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ef4444";
        ctx.font = "700 24px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Game Over!", w / 2, h / 2 - 20);
        ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
        ctx.font = "500 14px system-ui, -apple-system, sans-serif";
        ctx.fillText("Press Space or Enter to restart", w / 2, h / 2 + 10);
        ctx.textAlign = "left";
      }

      // Sync UI state
      if (ts - (g._lastUiTs || 0) > 100) {
        g._lastUiTs = ts;
        setUi({ score: Math.floor(g.score), best: Math.floor(g.best), gameOver: g.gameOver });
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, statusLabel]);

  return (
    <div className="rocket-game">
      <div className="rocket-game-frame" aria-label="Rocket game">
        <canvas ref={canvasRef} className="rocket-game-canvas" />
      </div>
      <div className="sr-only" aria-live="polite">
        {ui.gameOver
          ? `Game Over. Score ${ui.score}. Best ${ui.best}. Press Space to restart.`
          : `Rocket game running. Score ${ui.score}. Best ${ui.best}.`}
      </div>
    </div>
  );
};

export default RocketGame;

