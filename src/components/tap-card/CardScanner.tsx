import { useEffect, useRef, useState } from "react";
import { scannedTapCardPath } from "@/lib/tap-card/card-app";
import { primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

/** The phone's own QR reader where there is one (Android Chrome); jsQR everywhere else (iPhone). */
async function makeReader(): Promise<(video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>> {
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (Native) {
    try {
      const detector = new Native({ formats: ["qr_code"] });
      return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      // fall through to jsQR
    }
  }
  const jsQR = (await import("jsqr")).default;
  return async (video, canvas) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/**
 * Scan: the camera inside the card page. Reads only the Tap Card's own codes
 * (counter plate, bartender QR) and opens them here, so a card saved to the
 * Home Screen never has to hand off to the browser.
 */
export function CardScanner({ label = "Scan a Tap Card code" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setMessage("The camera didn't open. Allow camera access for this site in your phone's settings, then try again.");
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const read = await makeReader();
      let lastWrong = "";
      const tick = async () => {
        if (stopped) return;
        try {
          const text = await read(video, canvasRef.current!);
          if (text) {
            const path = scannedTapCardPath(text);
            if (path) {
              stopped = true;
              stream?.getTracks().forEach((t) => t.stop());
              window.location.assign(path);
              return;
            }
            if (text !== lastWrong) {
              lastWrong = text;
              setMessage("That isn't a Tap Card code. Point at the counter plate or the bartender's QR code.");
            }
          }
        } catch {
          // a frame that couldn't be read; try the next one
        }
        timer = window.setTimeout(tick, 200);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className={primaryButtonClass}
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
      >
        📷 {label}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" role="dialog" aria-label="Scan a Tap Card code">
      <video ref={videoRef} className="aspect-square w-full max-w-[420px] rounded-[18px] bg-black object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <p className="max-w-[420px] text-center text-[15px] text-white" aria-live="polite">
        {message ?? "Point your camera at the counter plate or the bartender's QR code."}
      </p>
      <button type="button" className={`${secondaryButtonClass} max-w-[420px]`} onClick={() => setOpen(false)}>
        Close
      </button>
    </div>
  );
}
