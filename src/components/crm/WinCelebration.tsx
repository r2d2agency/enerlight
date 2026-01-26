import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface WinCelebrationProps {
  show: boolean;
  onComplete: () => void;
}

export function WinCelebration({ show, onComplete }: WinCelebrationProps) {
  const [particles, setParticles] = useState<Array<{ id: number; left: number; delay: number; color: string }>>([]);

  useEffect(() => {
    if (show) {
      // Generate confetti particles
      const colors = ["#22c55e", "#10b981", "#34d399", "#fbbf24", "#f59e0b", "#60a5fa"];
      const newParticles = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
      setParticles(newParticles);

      // Auto-dismiss after animation
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* Central celebration text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="animate-scale-in text-center">
          <div className="text-6xl mb-2">🎉</div>
          <h2 className="text-4xl font-bold text-green-500 animate-pulse">
            Negócio Fechado!
          </h2>
          <p className="text-xl text-muted-foreground mt-2">Parabéns!</p>
        </div>
      </div>

      {/* Confetti particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            left: `${particle.left}%`,
            top: "-20px",
            backgroundColor: particle.color,
            animation: `confetti-fall 2.5s ease-out ${particle.delay}s forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}

      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
