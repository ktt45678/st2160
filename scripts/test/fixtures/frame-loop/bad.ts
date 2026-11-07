function helper(value: number): number {
  return value * 2;
}

/** @frameLoop */
function tagged(value: number): number {
  return value + 1;
}

/** @frameLoop */
export function badFrame(values: Float64Array, label: string): number {
  const copy = new Float64Array(4);
  const list = [1, 2];
  const point = { x: 1 };
  const doubled = Array.from(values).map((v) => v * 2);
  const text = `frame ${label}`;
  const joined = label + '!';
  const rest = [...list];
  return copy[0]! + point.x + doubled.length + text.length + joined.length + rest.length + helper(1);
}

/** @frameLoop */
export function goodFrame(values: Float64Array, out: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  out.fill(0);
  out[0] = Math.max(sum, 0);
  // frame-loop-ignore: rare error path, never taken in steady state
  if (sum < 0) throw new RangeError('negative');
  return tagged(sum);
}
