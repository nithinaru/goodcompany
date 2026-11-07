"use client";
// Small dependency-free takes on React Bits effects: SpotlightCard, BlurText, CountUp, ShinyText.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function SpotlightCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMove} className={`spot ${className}`} style={style}>
      {children}
    </div>
  );
}

export function BlurText({ text, className = "", delay = 70 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className="blur-word" style={{ animationDelay: `${i * delay}ms` }}>
          {w}&nbsp;
        </span>
      ))}
    </span>
  );
}

export function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{v}</>;
}

export function ShinyText({ text }: { text: string }) {
  return <span className="shiny">{text}</span>;
}
