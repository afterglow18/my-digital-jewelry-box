import { useEffect, useRef, useState } from 'react';

// Total animation duration — must match SCENE_DURATIONS in VideoTemplate.tsx
const TOTAL_MS = 4500 + 5000 + 4500 + 4000 + 4500; // 22 500 ms

type State = 'idle' | 'waiting' | 'recording' | 'done' | 'error';

export function RecordingControls() {
  const [state, setState]       = useState<State>('idle');
  const [remaining, setRemaining] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Wire up window.stopRecording so the video hook can also stop recording
  useEffect(() => {
    window.stopRecording = stopRecording;
    return () => { window.stopRecording = undefined; };
  });

  function stopRecording() {
    if (timerRef.current)  clearTimeout(timerRef.current);
    if (tickRef.current)   clearInterval(tickRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  }

  async function handleRecord() {
    setState('waiting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          width:  { ideal: 886  },
          height: { ideal: 1920 },
        } as MediaTrackConstraints,
        audio: false,
      });

      // Pick best supported MIME
      const mime = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, {
        mimeType: mime || undefined,
        videoBitsPerSecond: 12_000_000,
      });

      chunksRef.current  = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const ext  = mime.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunksRef.current, { type: mime || 'video/webm' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `jewelry-box-promo.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setState('done');
      };

      recorder.start(100); // collect data every 100 ms
      setState('recording');

      // Countdown display
      setRemaining(TOTAL_MS);
      tickRef.current = setInterval(() => {
        setRemaining(r => Math.max(0, r - 500));
      }, 500);

      // Auto-stop after full animation duration + small buffer
      timerRef.current = setTimeout(() => stopRecording(), TOTAL_MS + 500);

    } catch {
      setState('error');
    }
  }

  const fmtSec = (ms: number) => (ms / 1000).toFixed(1) + 's';

  return (
    <div style={{
      position:  'fixed',
      bottom:    28,
      left:      '50%',
      transform: 'translateX(-50%)',
      zIndex:    9999,
      display:   'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      pointerEvents: state === 'recording' ? 'none' : 'auto',
    }}>
      {state === 'idle' && (
        <button onClick={handleRecord} style={btnStyle('#111', 'white')}>
          ⏺ Record &amp; Download (30 fps)
        </button>
      )}

      {state === 'waiting' && (
        <div style={pill('rgba(0,0,0,0.75)', 'white')}>
          Select this tab in the screen-share prompt…
        </div>
      )}

      {state === 'recording' && (
        <div style={pill('rgba(180,20,20,0.85)', 'white')}>
          ● Recording — auto-stops in {fmtSec(remaining)}
        </div>
      )}

      {state === 'done' && (
        <>
          <div style={pill('rgba(20,120,20,0.85)', 'white')}>
            ✓ Download started
          </div>
          <button onClick={() => setState('idle')} style={btnStyle('#333', 'white')}>
            Record again
          </button>
        </>
      )}

      {state === 'error' && (
        <>
          <div style={pill('rgba(180,20,20,0.85)', 'white')}>
            Screen capture cancelled or unsupported
          </div>
          <button onClick={() => setState('idle')} style={btnStyle('#333', 'white')}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '10px 22px', background: bg, color,
    border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    whiteSpace: 'nowrap',
  };
}

function pill(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 18px', background: bg, color,
    borderRadius: 20, fontSize: 13, fontWeight: 600,
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    whiteSpace: 'nowrap',
  };
}
