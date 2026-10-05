/**
 * The desktop and phone lists are both in the page, one hidden by CSS; a
 * card key matches a node in each. The visible one is the one to scroll.
 */
export function pickVisible<T extends { offsetParent: unknown }>(nodes: T[]): T | null {
  return nodes.find((n) => n.offsetParent !== null) ?? null;
}
