/** QR Model 2 module classifications for component-aware styling.
 * The placement order mirrors the function-pattern drawing order of Nayuki's encoder.
 * Roles never change the underlying QR symbol or its error-correction codes.
 */
export const ROLES = Object.freeze({
  DATA: 0,
  FINDER: 1,
  FINDER_CENTER: 2,
  SEPARATOR: 3,
  TIMING: 4,
  ALIGNMENT: 5,
  FORMAT: 6,
  VERSION: 7,
  DARK_MODULE: 8,
});

export const ROLE_NAMES = Object.freeze([
  'data', 'finder', 'finderCenter', 'separator', 'timing',
  'alignment', 'format', 'version', 'darkModule',
]);

function alignmentPositions(version) {
  if (version === 1) return [];
  const numberOfCenters = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  // Match Nayuki QR Model 2 alignment centers exactly for every version.
  // The previous ceil formula shifted all intermediate centers in versions 7–40,
  // making component-aware coloring cover actual data modules.
  const step = Math.floor((version * 8 + numberOfCenters * 3 + 5)
    / (numberOfCenters * 4 - 4)) * 2;
  const result = [6];
  for (let p = last; result.length < numberOfCenters; p -= step) result.splice(1, 0, p);
  return result;
}

export function createRoleMap(version) {
  if (!Number.isInteger(version) || version < 1 || version > 40) {
    throw new RangeError('QR version must be an integer from 1 to 40');
  }
  const size = 4 * version + 17;
  const roles = new Uint8Array(size * size);
  const put = (x, y, role) => { if (x >= 0 && y >= 0 && x < size && y < size) roles[y * size + x] = role; };

  // Timing patterns are drawn first and are overwritten where function patterns overlap.
  for (let i = 0; i < size; i++) {
    put(i, 6, ROLES.TIMING);
    put(6, i, ROLES.TIMING);
  }

  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const radius = Math.max(Math.abs(dx), Math.abs(dy));
        const role = radius === 4 ? ROLES.SEPARATOR : radius <= 1 ? ROLES.FINDER_CENTER : ROLES.FINDER;
        put(cx + dx, cy + dy, role);
      }
    }
  }

  const centers = alignmentPositions(version);
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if ((i === 0 && j === 0)
        || (i === 0 && j === centers.length - 1)
        || (i === centers.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) put(centers[i] + dx, centers[j] + dy, ROLES.ALIGNMENT);
      }
    }
  }

  // Two copies of the format bits, plus the fixed dark module.
  for (let i = 0; i <= 5; i++) put(8, i, ROLES.FORMAT);
  put(8, 7, ROLES.FORMAT);
  put(8, 8, ROLES.FORMAT);
  put(7, 8, ROLES.FORMAT);
  for (let i = 9; i < 15; i++) put(14 - i, 8, ROLES.FORMAT);
  for (let i = 0; i < 8; i++) put(size - 1 - i, 8, ROLES.FORMAT);
  for (let i = 8; i < 15; i++) put(8, size - 15 + i, ROLES.FORMAT);
  put(8, size - 8, ROLES.DARK_MODULE);

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      put(a, b, ROLES.VERSION);
      put(b, a, ROLES.VERSION);
    }
  }
  return roles;
}
