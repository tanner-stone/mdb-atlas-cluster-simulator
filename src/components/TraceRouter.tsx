/**
 * ============================================================================
 *  SVG TRACE ROUTER (absolute overlay)
 * ============================================================================
 *  Renders animated neon trace lines between live DOM elements referenced by
 *  the active SimulationStep's `traceLinePath`. It works by:
 *    1. Reading the bounding rectangles of each element id off the DOM.
 *    2. Translating those into coordinates relative to a positioned container.
 *    3. Drawing dashed, flowing <path> segments between consecutive hops
 *       (or fanning out from the first hop when step.branch === true).
 *
 *  Color is driven by query type: WRITE -> neon green, READ -> neon cyan.
 *  A ResizeObserver + window resize listener keep coordinates accurate.
 * ============================================================================
 */

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useSimulator } from '../state/SimulatorContext';

interface Pt {
  x: number;
  y: number;
}
interface Segment {
  from: Pt;
  to: Pt;
}

/** Props: the positioned container the overlay is anchored within. */
export default function TraceRouter({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const { activeStep, queryType } = useSimulator();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  /** Resolve an element id to its center point relative to the container. */
  const centerOf = useCallback(
    (id: string, host: DOMRect): Pt | null => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left - host.left + r.width / 2,
        y: r.top - host.top + r.height / 2,
      };
    },
    []
  );

  /** Recompute all trace segments for the current step. */
  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const host = container.getBoundingClientRect();
    setDims({ w: host.width, h: host.height });

    // Collect every (path, branch) group we need to draw. A step may declare
    // either a single `traceLinePath` OR multiple concurrent `traceLineGroups`
    // (e.g. ack-to-client AND async replication tail at the same time).
    const groups: Array<{ path: string[]; branch?: boolean }> = [];
    if (activeStep?.traceLineGroups?.length) {
      groups.push(...activeStep.traceLineGroups);
    } else if (activeStep?.traceLinePath?.length) {
      groups.push({ path: activeStep.traceLinePath, branch: activeStep.branch });
    }

    if (groups.length === 0) {
      setSegments([]);
      return;
    }

    const segs: Segment[] = [];
    for (const g of groups) {
      const pts = g.path
        .map((id) => ({ id, pt: centerOf(id, host) }))
        .filter((p): p is { id: string; pt: Pt } => p.pt !== null);
      if (pts.length < 2) continue;

      if (g.branch) {
        const source = pts[0].pt;
        for (let i = 1; i < pts.length; i++) {
          segs.push({ from: source, to: pts[i].pt });
        }
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          segs.push({ from: pts[i].pt, to: pts[i + 1].pt });
        }
      }
    }
    setSegments(segs);

  }, [activeStep, centerOf, containerRef]);

  // Recompute synchronously after layout whenever the step changes.
  useLayoutEffect(() => {
    recompute();
    // A short follow-up pass catches late layout/animation shifts.
    const t = setTimeout(recompute, 60);
    return () => clearTimeout(t);
  }, [recompute]);

  // Keep traces aligned on resize / scroll.
  useEffect(() => {
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [recompute, containerRef]);

  const isWrite = queryType === 'WRITE';
  const stroke = isWrite ? '#22ff88' : '#22d3ee'; // neon green / neon cyan
  const glow = isWrite ? 'rgba(34,255,136,0.7)' : 'rgba(34,211,238,0.7)';

  if (segments.length === 0) return null;

  /** Build a gently curved cubic path between two points. */
  const buildCurve = (s: Segment) => {
    const { from, to } = s;
    const dx = to.x - from.x;
    // Horizontal-leaning control points create smooth network-style routing.
    const c1x = from.x + dx * 0.5;
    const c2x = to.x - dx * 0.5;
    return `M ${from.x},${from.y} C ${c1x},${from.y} ${c2x},${to.y} ${to.x},${to.y}`;
  };

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      width={dims.w}
      height={dims.h}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="trace-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={glow} />
        </filter>
        <marker
          id="trace-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>

      {segments.map((s, i) => {
        const d = buildCurve(s);
        return (
          <g key={i} filter="url(#trace-glow)">
            {/* Soft static base line */}
            <path d={d} fill="none" stroke={stroke} strokeOpacity={0.25} strokeWidth={4} />
            {/* Animated flowing dash on top */}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="10 14"
              markerEnd="url(#trace-arrow)"
              className="animate-dash-flow"
            />
            {/* Origin pip */}
            <circle cx={s.from.x} cy={s.from.y} r={4} fill={stroke} />
          </g>
        );
      })}
    </svg>
  );
}
