import React, { useEffect, useRef } from 'react';

const DESKTOP_COUNT = 54;
const MOBILE_COUNT = 25;

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
    let scale = Math.min(window.devicePixelRatio || 1, 1.5);
    let particles = [];

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
      scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      seedParticles();
    };

    const render = (time) => {
      if (!active) return;
      context.clearRect(0, 0, width, height);
      const speed = exiting ? 3.2 : 1;
      const connectionDistance = width < 700 ? 86 : 118;

      particles.forEach((particle, index) => {
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

        const glow = particle.alpha * (0.74 + Math.sin(time * 0.0013 + particle.phase) * 0.26);
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(195, 161, 255, ${glow})`;
        context.fill();

        for (let next = index + 1; next < particles.length; next += 1) {
          const other = particles[next];
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          if (distance < connectionDistance) {
            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(other.x, other.y);
            context.strokeStyle = `rgba(132, 86, 246, ${(1 - distance / connectionDistance) * 0.1})`;
            context.lineWidth = 0.6;
            context.stroke();
          }
        }
      });

      frameId = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    frameId = window.requestAnimationFrame(render);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      context.clearRect(0, 0, width, height);
      particles = [];
    };
  }, [exiting, converging, reducedMotion]);

  if (reducedMotion) return null;
  return <canvas ref={canvasRef} className="sp-intro__particles" aria-hidden="true" />;
}
