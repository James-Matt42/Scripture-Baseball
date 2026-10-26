/** Shared rendered-QR sampling geometry. Decorative captions extend the canvas,
 * but not the QR matrix. All pixel analyzers must use the same module centers. */
export function rasterModuleCenter(qr, pixels, quietZone, frame = null, motion = null) {
  const w = qr.matrix.width ?? qr.matrix.size;
  const h = qr.matrix.height ?? qr.matrix.size;
  // The SVG viewBox reserves the outer artboard even for ink-only motion.
  // Sampling must use the *rendered* geometry, not infer layout from coverage.
  const artboard = motion?.type && motion.type!=='none' ? (motion.artboard??0) : 0;
  const width = w + 2 * quietZone + 2*artboard;
  const height = h + 2 * quietZone + 2*artboard;
  const extra = frame?.label ? frame.fontSize + 2 * frame.padding : 0;
  const scale = Math.min(pixels.width / width, pixels.height / (height + extra));
  // An SVG preserves the aspect ratio of its viewBox; round-off is centered.
  const xPad = (pixels.width - width * scale) / 2;
  const yPad = (pixels.height - (height + extra) * scale) / 2;
  return (x, y) => ({x: xPad + (x + quietZone + artboard + .5) * scale,
    y: yPad + (y + quietZone + artboard + .5) * scale});
}
