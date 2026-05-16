import { useCallback, useEffect, useRef, useState } from "react";
import "./CircularKnob.css";

interface CircularKnobProps {
  min: number;
  max: number;
  value: number;
  step: number;
  onChange: (next: number) => void;
  onLiveChange?: (next: number) => void;
  format?: (v: number) => string;
  size?: "sm" | "md" | "lg";
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

const SIZE_PX: Record<"sm" | "md" | "lg", number> = { sm: 80, md: 108, lg: 132 };
const ARC_DEG = 360;
const START_DEG = -90;

/** Neumorphic circular knob. SVG-based progress arc with center value, drag + wheel + keyboard. */
export function CircularKnob({ min, max, value, step, onChange, onLiveChange, format, size = "md", label, disabled = false, ariaLabel }: CircularKnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const px = SIZE_PX[size];
  const display = dragValue ?? value;
  const pct = max === min ? 0.5 : (display - min) / (max - min);

  const formatted = format ? format(display) : formatDefault(display);
  const arcLen = computeArcLength(px);
  const dashOffset = arcLen * (1 - pct);

  const commit = useCallback((next: number) => {
    const clamped = clamp(next, min, max);
    onChange(parseFloat(clamped.toFixed(4)));
  }, [min, max, onChange]);

  const liveCommit = useCallback((next: number) => {
    const clamped = clamp(next, min, max);
    setDragValue(parseFloat(clamped.toFixed(4)));
    onLiveChange?.(clamped);
  }, [min, max, onLiveChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    setDragValue(value);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    const sensitivity = (max - min) / 200;
    const next = dragRef.current.startVal - dy * sensitivity;
    liveCommit(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const final = dragValue ?? value;
    dragRef.current = null;
    setDragValue(null);
    commit(final);
  };

  const onWheel = useCallback((e: WheelEvent) => {
    if (disabled) return;
    if (!ref.current) return;
    if (!ref.current.contains(e.target as Node)) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    commit(value + dir * step);
  }, [disabled, value, step, commit]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        e.preventDefault(); commit(value + step); break;
      case "ArrowDown":
      case "ArrowLeft":
        e.preventDefault(); commit(value - step); break;
      case "PageUp":
        e.preventDefault(); commit(value + step * 10); break;
      case "PageDown":
        e.preventDefault(); commit(value - step * 10); break;
      case "Home":
        e.preventDefault(); commit(min); break;
      case "End":
        e.preventDefault(); commit(max); break;
    }
  };

  return (
    <div
      ref={ref}
      className={`circ-knob circ-knob--${size}${disabled ? " circ-knob--disabled" : ""}`}
      style={{ width: px, height: px }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={display}
      aria-valuetext={formatted}
      aria-label={ariaLabel ?? label}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <svg
        className="circ-knob__svg"
        viewBox={`0 0 ${px} ${px}`}
        width={px}
        height={px}
      >
        <defs>
          <linearGradient id={`knob-grad-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2F6BFF" />
            <stop offset="100%" stopColor="#6F96FF" />
          </linearGradient>
        </defs>
        {renderArc(px, "track", arcLen, 0, `var(--ink-200)`)}
        {renderArc(px, "fill", arcLen, dashOffset, `url(#knob-grad-${size})`)}
      </svg>
      <div className="circ-knob__center">
        <span className="circ-knob__value">{formatted}</span>
        {label && <span className="circ-knob__label">{label}</span>}
      </div>
    </div>
  );
}

/** Render one of the two stroked progress circles, rotated so the gap is at bottom. */
function renderArc(px: number, kind: "track" | "fill", arcLen: number, dashOffset: number, color: string) {
  const cx = px / 2;
  const cy = px / 2;
  const r = px / 2 - 8;
  return (
    <circle
      className={`circ-knob__arc circ-knob__arc--${kind}`}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={kind === "track" ? 5 : 6}
      strokeLinecap="round"
      strokeDasharray={`${arcLen} ${2 * Math.PI * r}`}
      strokeDashoffset={dashOffset}
      transform={`rotate(${START_DEG} ${cx} ${cy})`}
    />
  );
}

function computeArcLength(px: number): number {
  const r = px / 2 - 8;
  const circ = 2 * Math.PI * r;
  return (circ * ARC_DEG) / 360;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function formatDefault(v: number): string {
  const abs = Math.abs(v);
  if (Math.abs(v - Math.round(v)) < 0.001) return Math.round(v).toString();
  if (abs < 10) return v.toFixed(2);
  return v.toFixed(1);
}
