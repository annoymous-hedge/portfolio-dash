// components/ParticleBackground.tsx
"use client";
import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export default function ParticleBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  return (
    <div className="fixed inset-0 -z-10 bg-[#020205]">
      {ready && (
      <Particles
        id="tsparticles"
        options={{
          background: { color: { value: "transparent" } },
          fpsLimit: 120,
          particles: {
            // Colorful universe palette
            color: { value:["#ffffff", "#c084fc", "#38bdf8", "#f472b6", "#fbbf24"] },
            number: {
              density: { enable: true, width: 800 },
              value: 150, // High density for a starry look
            },
            opacity: {
              value: { min: 0.1, max: 0.8 },
              animation: { enable: true, speed: 1, sync: false }, // Twinkling effect
            },
            shape: { type: "circle" },
            size: {
              value: { min: 0.5, max: 3 },
              animation: { enable: true, speed: 2, sync: false },
            },
            move: {
              enable: true,
              speed: 0.4, // Slow drift
              direction: "none",
              random: true,
              straight: false,
              outModes: { default: "out" },
            },
            links: {
              enable: true,
              distance: 100,
              color: "#ffffff",
              opacity: 0.05, // Very faint constellations
              width: 1,
            },
          },
          interactivity: {
            events: {
              onHover: { enable: true, mode: "bubble" },
            },
            modes: {
              bubble: { distance: 200, size: 6, duration: 2, opacity: 1 },
            },
          },
          detectRetina: true,
        }}
      />
      )}
    </div>
  );
}