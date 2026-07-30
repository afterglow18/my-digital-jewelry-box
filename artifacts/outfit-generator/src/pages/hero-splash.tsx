/**
 * HeroSplash — Phase 1 of the splash sequence.
 * Full-screen hero image holds for ~2.5 s, then fades out into the welcome screen.
 * No user interaction — auto-advance only.
 */
import { useEffect } from "react";
import { motion } from "framer-motion";

interface Props {
  onContinue: () => void;
}

// Time before starting the exit fade
const HOLD_MS = 2500;

export default function HeroSplash({ onContinue }: Props) {
  useEffect(() => {
    const t = setTimeout(onContinue, HOLD_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "#1a0a10",
        overflow: "hidden",
      }}
    >
      {/* Hero image — contained so the full jewelry box is visible */}
      <img
        src="/hero-splash.jpg"
        alt="My Digital Jewelry Box"
        draggable={false}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -52%)",
          width: "92%",
          height: "auto",
          maxHeight: "80%",
          objectFit: "contain",
          borderRadius: 18,
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* Subtle glow behind the box */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -52%)",
          width: "90%",
          height: "78%",
          background: "radial-gradient(ellipse at center, rgba(120,50,180,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />

      {/* Gradient at bottom for text readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(14,3,20,0.96) 0%, rgba(14,3,20,0.5) 22%, transparent 42%)",
          pointerEvents: "none",
        }}
      />

      {/* Branding near bottom — "Welcome to" + app name */}
      <div
        style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom) + 72px)",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          pointerEvents: "none",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(212,175,55,0.65)",
          }}
        >
          Welcome to
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontWeight: 700,
            fontSize: "clamp(20px, 6vw, 28px)",
            letterSpacing: "0.06em",
            color: "#f0d080",
            textShadow: "0 0 30px rgba(212,175,55,0.5), 0 2px 8px rgba(0,0,0,0.8)",
            lineHeight: 1.2,
            textAlign: "center",
          }}
        >
          MY DIGITAL
          <br />
          JEWELRY BOX
        </p>
      </div>
    </motion.div>
  );
}
