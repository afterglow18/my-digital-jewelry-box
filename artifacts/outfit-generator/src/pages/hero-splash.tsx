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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "#1a0a10",
        overflow: "hidden",
      }}
    >
      {/* Full-screen hero image */}
      <img
        src="/hero-splash.jpg"
        alt="My Digital Jewelry Box"
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* Dark gradient over lower portion for text readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(14,3,20,0.94) 0%, rgba(14,3,20,0.65) 28%, transparent 55%)",
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
