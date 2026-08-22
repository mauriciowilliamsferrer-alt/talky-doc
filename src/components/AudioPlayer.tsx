import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { SPEEDS } from "@/lib/tts-client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  src: string;
  fileName: string;
};

export function AudioPlayer({ src, fileName }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const { t } = useI18n();

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = duration || audio.duration || 0;
    audio.currentTime = Math.min(Math.max(audio.currentTime + delta, 0), max);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <section className="glass rounded-3xl p-5 sm:p-6" aria-label={t.playerAria}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t.pause : t.play}
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-12px_oklch(0.5_0.16_42/0.9)] transition-transform duration-200 ease-out active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {playing ? <Pause className="size-6" /> : <Play className="ml-0.5 size-6" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="relative flex h-6 items-center">
            <div className="absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${progress}%` }}
                aria-hidden="true"
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              aria-label={t.seekAria}
              onChange={(e) => {
                const value = Number(e.target.value);
                setCurrent(value);
                if (audioRef.current) audioRef.current.currentTime = value;
              }}
              className="relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => skip(-15)}
            aria-label={t.back15}
            className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium transition-transform duration-200 ease-out active:scale-95"
          >
            <RotateCcw className="size-4" /> 15s
          </button>
          <button
            type="button"
            onClick={() => skip(15)}
            aria-label={t.fwd15}
            className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium transition-transform duration-200 ease-out active:scale-95"
          >
            15s <RotateCw className="size-4" />
          </button>
        </div>

        <div
          className="flex items-center gap-1 rounded-full bg-secondary p-1"
          role="group"
          aria-label={t.speedAria}
        >
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
              aria-pressed={speed === value}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors duration-150",
                speed === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}x
            </button>
          ))}
        </div>

        <a
          href={src}
          download={`${fileName}.mp3`}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-transform duration-200 ease-out active:scale-95"
        >
          <Download className="size-4" /> {t.download}
        </a>
      </div>
    </section>
  );
}
