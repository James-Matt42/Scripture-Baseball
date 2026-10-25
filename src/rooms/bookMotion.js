// The physical page count and easing schedule are preserved from Book V6.
// Kept separate from React so regressions in the paper-turn system are testable.
export const BOOK_LEAVES = 42;
export const BOOK_SEGMENTS = 12;
export const BOOK_DURATION = 5.85;

export function buildBookTurns() {
  const turns = [];
  let clock = 1.04;
  for (let i = 0; i < BOOK_LEAVES; i += 1) {
    const u = i / (BOOK_LEAVES - 1);
    const gap = .034 + .166 * u ** 3.8;
    const duration = .20 + .42 * u ** 2;
    turns.push({ start: clock, end: clock + duration });
    clock += gap;
  }
  return turns;
}
