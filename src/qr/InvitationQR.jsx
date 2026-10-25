import React, { useMemo } from 'react';
import { getInvitationQrDrawing } from './invitationQr.js';

/** Accessible, standard QR code. ref is an optional SVG ref for the book reveal. */
export function InvitationQR({ url, presetId, svgRef, className = '' }) {
  const drawing = useMemo(() => getInvitationQrDrawing(url, presetId), [url, presetId]);
  if (!drawing) {
    return <p role="status" className="text-sm text-red-800">This invitation cannot be shown as a QR code.</p>;
  }
  const { preset, width, paths } = drawing;
  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${width} ${width}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Scan to open the Scripture Baseball invitation link"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={width} height={width} fill={preset.background} />
      <path d={paths.data} fill={preset.data} />
      <path d={paths.finder} fill={preset.finder} />
      <path d={paths.finderCenter} fill={preset.finderCenter} />
    </svg>
  );
}
