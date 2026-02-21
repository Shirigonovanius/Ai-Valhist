import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    const particleCount = 80;
    const colors = ['#f97316', '#fb923c', '#fdba74', '#ffffff'];
    
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      particlesRef.current.forEach((particle, i) => {
        // Vortex effect toward center
        const dx = centerX - particle.x;
        const dy = centerY - particle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 50) {
          const force = 0.0005 * dist;
          particle.vx += (dx / dist) * force;
          particle.vy += (dy / dist) * force;
          
          // Spiral effect
          particle.vx += (dy / dist) * 0.02;
          particle.vy -= (dx / dist) * 0.02;
        }

        // Mouse repulsion
        const mouseDx = particle.x - mouseRef.current.x;
        const mouseDy = particle.y - mouseRef.current.y;
        const mouseDist = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
        
        if (mouseDist < 150) {
          const repelForce = (150 - mouseDist) * 0.001;
          particle.vx += (mouseDx / mouseDist) * repelForce;
          particle.vy += (mouseDy / mouseDist) * repelForce;
        }

        // Apply velocity with damping
        particle.vx *= 0.98;
        particle.vy *= 0.98;
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Reset particles that get too close to center
        if (dist < 30) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.max(canvas.width, canvas.height) * 0.4;
          particle.x = centerX + Math.cos(angle) * radius;
          particle.y = centerY + Math.sin(angle) * radius;
          particle.vx = 0;
          particle.vy = 0;
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.alpha;
        ctx.fill();

        // Draw connections
        particlesRef.current.slice(i + 1).forEach((other) => {
          const connDx = particle.x - other.x;
          const connDy = particle.y - other.y;
          const connDist = Math.sqrt(connDx * connDx + connDy * connDy);
          
          if (connDist < 100) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = '#f97316';
            ctx.globalAlpha = (1 - connDist / 100) * 0.15;
            ctx.stroke();
          }
        });
      });

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: 'transparent' }}
    />
  );
}
