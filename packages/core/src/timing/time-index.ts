/** Centered interval tree over `[start, end)` ranges, built once, queried in O(log N + K). */
export class TimeIndex {
  /** Number of indexed ranges, empty ranges excluded. */
  readonly size: number;
  /** Most ranges active at one instant. Size query buffers with it. */
  readonly maxActive: number;

  private readonly starts: Float64Array;
  private readonly ends: Float64Array;
  private readonly centers: Float64Array;
  private readonly left: Int32Array;
  private readonly right: Int32Array;
  private readonly offsets: Int32Array;
  private readonly counts: Int32Array;
  private readonly byStart: Int32Array;
  private readonly byEnd: Int32Array;

  /** Ids are the array positions. Ranges with `end <= start` or NaN bounds are never active. */
  constructor(starts: Float64Array, ends: Float64Array) {
    if (starts.length !== ends.length) {
      throw new RangeError('starts and ends must have the same length');
    }
    this.starts = starts;
    this.ends = ends;

    const ids: number[] = [];
    for (let i = 0; i < starts.length; i++) {
      if ((ends[i] as number) > (starts[i] as number)) ids.push(i);
    }
    this.size = ids.length;
    ids.sort((a, b) => (starts[a] as number) - (starts[b] as number) || a - b);

    const nodes: { center: number; members: number[]; left: number; right: number }[] = [];
    const build = (sorted: number[]): number => {
      if (sorted.length === 0) return -1;
      const center = starts[sorted[sorted.length >> 1] as number] as number;
      const lower: number[] = [];
      const upper: number[] = [];
      const members: number[] = [];
      for (const id of sorted) {
        if ((ends[id] as number) <= center) lower.push(id);
        else if ((starts[id] as number) > center) upper.push(id);
        else members.push(id);
      }
      const index = nodes.length;
      nodes.push({ center, members, left: -1, right: -1 });
      const node = nodes[index] as (typeof nodes)[number];
      node.left = build(lower);
      node.right = build(upper);
      return index;
    };
    build(ids);

    const count = nodes.length;
    this.centers = new Float64Array(count);
    this.left = new Int32Array(count);
    this.right = new Int32Array(count);
    this.offsets = new Int32Array(count);
    this.counts = new Int32Array(count);
    this.byStart = new Int32Array(ids.length);
    this.byEnd = new Int32Array(ids.length);
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const node = nodes[i] as (typeof nodes)[number];
      this.centers[i] = node.center;
      this.left[i] = node.left;
      this.right[i] = node.right;
      this.offsets[i] = offset;
      this.counts[i] = node.members.length;
      const byEnd = node.members.slice().sort((a, b) => (ends[b] as number) - (ends[a] as number));
      for (let k = 0; k < node.members.length; k++) {
        this.byStart[offset + k] = node.members[k] as number;
        this.byEnd[offset + k] = byEnd[k] as number;
      }
      offset += node.members.length;
    }

    this.maxActive = maxOverlap(ids, starts, ends);
  }

  /** Writes ids active at `time` into `out`, ascending, and returns the count. */
  /** @frameLoop */
  query(time: number, out: Int32Array): number {
    if (this.size === 0 || Number.isNaN(time)) return 0;
    const capacity = out.length;
    let n = 0;
    let node = 0;
    while (node >= 0) {
      const offset = this.offsets[node] as number;
      const end = offset + (this.counts[node] as number);
      if (time < (this.centers[node] as number)) {
        for (let k = offset; k < end; k++) {
          const id = this.byStart[k] as number;
          if ((this.starts[id] as number) > time) break;
          if (n < capacity) out[n++] = id;
        }
        node = this.left[node] as number;
      } else {
        for (let k = offset; k < end; k++) {
          const id = this.byEnd[k] as number;
          if ((this.ends[id] as number) <= time) break;
          if (n < capacity) out[n++] = id;
        }
        node = this.right[node] as number;
      }
    }
    for (let i = 1; i < n; i++) {
      const id = out[i] as number;
      let j = i - 1;
      while (j >= 0 && (out[j] as number) > id) {
        out[j + 1] = out[j] as number;
        j--;
      }
      out[j + 1] = id;
    }
    return n;
  }
}

function maxOverlap(sortedByStart: number[], starts: Float64Array, ends: Float64Array): number {
  const endTimes = sortedByStart.map((id) => ends[id] as number).sort((a, b) => a - b);
  let max = 0;
  let active = 0;
  let e = 0;
  for (const id of sortedByStart) {
    const start = starts[id] as number;
    while (e < endTimes.length && (endTimes[e] as number) <= start) {
      e++;
      active--;
    }
    active++;
    if (active > max) max = active;
  }
  return max;
}
