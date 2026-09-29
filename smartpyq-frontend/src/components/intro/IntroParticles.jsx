import React, { useEffect, useRef } from 'react';

const DESKTOP_COUNT = 54;
const MOBILE_COUNT = 25;
// Alpha buckets for link segments: one stroke call per bucket instead of one
// per segment (software rasterizers choke on hundreds of stroke state changes).
const LINK_ALPHAS = ['rgba(132, 86, 246, 0.018)', 'rgba(132, 86, 246, 0.038)', 'rgba(132, 86, 246, 0.062)', 'rgba(132, 86, 246, 0.09)'];

export default function IntroParticles({ exiting = false, converging = false, reducedMotion = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (reducedMotion) return undefined;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return undefined;

    let frameId = 0;
    let active = true;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let scale = Math.min(window.devicePixelRatio || 1, 1.25);
    let particles = [];
    // Slow phones get a 30fps ceiling — the drift reads identically but
    // halves the canvas work on exactly the devices that need the help.
    // (render() runs inside rAF; we simply skip alternate frames.)
    const FRAME_MIN_MS = width < 700 ? 1000 / 30 : 0;
    let lastFrameTime = 0;
    // Preallocated segment buckets: [x1, y1, x2, y2, ...] per alpha level.
    const buckets = [[], [], [], []];

    const seedParticles = () => {
      const count = width < 700 ? MOBILE_COUNT : DESKTOP_COUNT;
      particles = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.1,
        radius: 0.45 + Math.random() * 1.15,
        alpha: 0.12 + Math.random() * 0.38,
        phase: index * 0.73,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      scale = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      seedParticles();
    };

    const render = (time) => {
      if (!active) return;
      if (FRAME_MIN_MS && time - lastFrameTime < FRAME_MIN_MS) {
        frameId = window.requestAnimationFrame(render);
        return;
      }
      lastFrameTime = time;
      context.clearRect(0, 0, width, height);
      const speed = exiting ? 3.2 : 1;
      const connectionDistance = width < 700 ? 76 : 100;
      const maxDistSq = connectionDistance * connectionDistance;

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        if (exiting || converging) {
          const direction = converging && !exiting ? 1 : -1;
          const dx = width / 2 - particle.x;
          const dy = height / 2 - particle.y;
          const length = Math.hypot(dx, dy) || 1;
          particle.x += (dx / length) * 0.7 * speed * direction;
          particle.y += (dy / length) * 0.7 * speed * direction;
        } else {
          particle.x += particle.vx;
          particle.y += particle.vy;
        }

        if (particle.x < -12) particle.x = width + 12;
        if (particle.x > width + 12) particle.x = -12;
        if (particle.y < -12) particle.y = height + 12;
        if (particle.y > height + 12) particle.y = -12;
      }

      // Links: distance-cull with squared distances, batch segments into a
      // handful of alpha buckets so stroking stays O(buckets), not O(segments).
      for (let b = 0; b < buckets.length; b += 1) buckets[b].length = 0;
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        for (let next = i + 1; next < particles.length; next += 1) {
          const o = particles[next];
          const dx = p.x - o.x;
          const dy = p.y - o.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= maxDistSq) continue;
          const distance = Math.sqrt(distSq);
          const alpha = (1 - distance / connectionDistance) * 0.1;
          const bucket = alpha > 0.075 ? 3 : alpha > 0.05 ? 2 : alpha > 0.025 ? 1 : 0;
          const segments = buckets[bucket];
          segments.push(p.x, p.y, o.x, o.y);
        }
      }
      context.lineWidth = 0.6;
      for (let b = 0; b < buckets.length; b += 1) {
        const segments = buckets[b];
        if (!segments.length) continue;
        context.strokeStyle = LINK_ALPHAS[b];
        context.beginPath();
        for (let k = 0; k < segments.length; k += 4) {
          context.moveTo(segments[k], segments[k + 1]);
          context.lineTo(segments[k + 2], segments[k + 3]);
        }
        context.stroke();
      }

      // Dots: individual fills are cheap; keep the twinkle.
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        const glow = particle.alpha * (0.74 + Math.sin(time * 0.0013 + particle.phase) * 0.26);
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(195, 161, 255, ${glow})`;
        context.fill();
      }

      if (!document.hidden) frameId = window.requestAnimationFrame(render);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (!frameId) {
        frameId = window.requestAnimationFrame(render);
      }
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    frameId = window.requestAnimationFrame(render);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      context.clearRect(0, 0, width, height);
      particles = [];
    };
  }, [exiting, converging, reducedMotion]);

  if (reducedMotion) return null;
  return <canvas ref={canvasRef} className="sp-intro__particles" aria-hidden="true" />;
}
