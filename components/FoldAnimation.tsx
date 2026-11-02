import { MARK } from "./brandPaths";

const DEPTH = 14; // layers that give the mark its thickness as it turns

/**
 * The Sealed mark floating on the page: it hangs, bobs gently and turns in 3D,
 * with a soft shadow below that breathes with it. Pure CSS; still for reduced motion.
 */
export function FoldAnimation({ busy = false }: { busy?: boolean }) {
  const face = (body: string, dot: string) => (
    <svg viewBox={`0 0 ${MARK.w} ${MARK.h}`}>
      <path d={MARK.body} fill={body} fillRule="evenodd" />
      <path d={MARK.dot} fill={dot} />
    </svg>
  );
  return (
    <div className={`fold-stage${busy ? " fold-busy" : ""}`} aria-hidden>
      <div className="fold-hang">
        <div className="fold-spin">
          {Array.from({ length: DEPTH }, (_, i) => (
            <div key={i} className="fold-layer" style={{ transform: `translateZ(${-i * 0.9}px)` }}>
              {face(i === 0 ? "#12172E" : "#0A0D1C", i === 0 ? "#4C44E0" : "#2A2580")}
            </div>
          ))}
          <div className="fold-layer fold-back" style={{ transform: `translateZ(${-(DEPTH - 1) * 0.9}px) rotateY(180deg)` }}>
            {face("#12172E", "#4C44E0")}
          </div>
        </div>
      </div>
      <div className="fold-shadow" />
    </div>
  );
}
