/** Normalized reading fraction (0–1) of a scroll container. */
export function scrollFraction(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / max));
}

/** Pixel scrollTop that corresponds to a normalized fraction (0–1). */
export function scrollTopForFraction(
  fraction: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, fraction)) * max;
}

/** ScrollTop that centers a mark (by its offsetTop) in the viewport. */
export function scrollTopForMark(markTop: number, viewportHeight: number): number {
  return Math.max(0, markTop - viewportHeight / 2);
}
