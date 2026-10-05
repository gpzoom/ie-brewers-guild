/**
 * The desktop and phone lists are both in the page, one hidden by CSS; a
 * card key matches a node in each. The visible one is the one to scroll.
 */
export function pickVisible<T extends { offsetParent: unknown }>(nodes: T[]): T | null {
  return nodes.find((n) => n.offsetParent !== null) ?? null;
}

/**
 * Where a scrolling list should sit to show a card (top relative to the
 * list's content): unchanged when it's in view, else the card at the top
 * of the list -- for one container, so the page itself never jumps.
 */
export function nearestScrollTop(
  card: { top: number; height: number },
  list: { scrollTop: number; height: number },
): number {
  if (card.top < list.scrollTop) return card.top;
  if (card.top + card.height > list.scrollTop + list.height) return card.top;
  return list.scrollTop;
}
