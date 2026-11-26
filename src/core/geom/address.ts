/** MVR stores DMX addresses as one absolute number: (universe - 1) × 512 + address. */
export function toUniverseAddress(abs: number): { universe: number; address: number } {
  const a = Math.max(1, Math.floor(abs));
  return { universe: Math.floor((a - 1) / 512) + 1, address: ((a - 1) % 512) + 1 };
}
export const fromUniverseAddress = (u: number, a: number): number => (u - 1) * 512 + a;
export function formatUA(abs: number): string {
  const { universe, address } = toUniverseAddress(abs);
  return `${universe}.${address}`;
}
