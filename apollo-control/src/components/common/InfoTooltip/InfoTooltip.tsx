import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TooltipInfo } from "../../../utils/tooltipContent";
import "./InfoTooltip.css";

interface InfoTooltipProps {
  info: TooltipInfo;
  children: React.ReactNode;
}

const TOOLTIP_WIDTH = 248;
const TOOLTIP_GAP = 10;
const ESTIMATED_HEIGHT = 95;

/** Wraps children and shows a floating neumorphic info panel on hover. */
export function InfoTooltip({ info, children }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const anchorRef = useRef<HTMLSpanElement>(null);

  function handleMouseEnter() {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = rect.bottom + TOOLTIP_GAP;
    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;

    if (top + ESTIMATED_HEIGHT > vh - 8) {
      top = rect.top - TOOLTIP_GAP - ESTIMATED_HEIGHT;
    }

    left = Math.max(8, Math.min(left, vw - TOOLTIP_WIDTH - 8));

    setStyle({ top, left, width: TOOLTIP_WIDTH });
    setVisible(true);
  }

  return (
    <>
      <span
        ref={anchorRef}
        className="info-tooltip-anchor"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible && createPortal(
        <div className="info-tooltip" style={style}>
          <div className="info-tooltip__title">{info.title}</div>
          <div className="info-tooltip__body">{info.description}</div>
        </div>,
        document.body
      )}
    </>
  );
}
