"use client";

import { motion } from "framer-motion";
import React, { useMemo } from "react";

const AntigravityBackground = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      size: Math.random() * 15 + 5,
      left: Math.random() * 100 + "%",
      duration: Math.random() * 15 + 15,
      delay: Math.random() * 20,
      opacity: Math.random() * 0.3 + 0.1,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-[#F5F5F5]">
      {/* Subtle Glows */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20 blur-[120px]"
        style={{
          backgroundImage: `radial-gradient(circle, #fde047 0%, transparent 70%)`,
        }}
      />
      
      {/* Floating Particles */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-[#FFD700]"
          initial={{
            x: 0,
            y: "110vh",
            opacity: 0,
            scale: 0.5,
          }}
          animate={{
            y: "-10vh",
            opacity: [0, p.opacity, p.opacity, 0],
            scale: [0.5, 1, 1, 0.5],
            x: [0, Math.random() * 100 - 50, Math.random() * 100 - 50, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            filter: "blur(2px)",
          }}
        />
      ))}

      {/* Grid Lines for Depth (Optional but looks cool) */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
};

export default AntigravityBackground;
