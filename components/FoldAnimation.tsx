/**
 * The Sealed mark is a box seen from above one corner. Here it is a real 3D box:
 * it floats, turns a quarter, and the seal presses back onto the near corner, so
 * every time it settles it looks exactly like the logo. Pure CSS; still for reduced motion.
 */
export function FoldAnimation({ busy = false }: { busy?: boolean }) {
  return (
    <div className={`fold-stage${busy ? " fold-busy" : ""}`} aria-hidden>
      <div className="fold-hang">
        <div className="fold-view">
          <div className="fold-cube">
            <span className="fc-face fc-top" />
            <span className="fc-face fc-front" />
            <span className="fc-face fc-right" />
            <span className="fc-face fc-back" />
            <span className="fc-face fc-left" />
            <span className="fc-face fc-bottom" />
          </div>
        </div>
        <span className="fold-seal" />
      </div>
      <div className="fold-shadow" />
    </div>
  );
}
