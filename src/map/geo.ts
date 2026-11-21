import type { CircleFeature, Feature, LngLat, PathFeature } from "./types";

const EARTH = 6371000;

export function distMeters(a: LngLat, b: LngLat): number {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function normDeg(value: number): number {
  return (value % 360 + 360) % 360;
}

export function destination(from: LngLat, bearingDeg: number, distM: number): LngLat {
  const δ = distM / EARTH;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (from[1] * Math.PI) / 180;
  const λ1 = (from[0] * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
  return [(((λ2 * 180) / Math.PI + 540) % 360) - 180, (φ2 * 180) / Math.PI];
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function pathLength(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distMeters(points[i - 1]!, points[i]!);
  return total;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

export function formatBearing(degrees: number): string {
  const value = normDeg(degrees);
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return `${dirs[Math.round(value / 45) % 8]} ${Math.round(value)}°`;
}

export function formatPair(lng: number, lat: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${ns}  ${Math.abs(lng).toFixed(5)}°${ew}`;
}

export function catmullRom(points: LngLat[], closed: boolean, samples = 8): LngLat[] {
  const n = points.length;
  if (n < 2) return points.slice();
  if (!closed && n === 2) return points.slice();
  if (closed && n < 3) return points.slice();
  const out: LngLat[] = [];
  const segments = closed ? n : n - 1;
  const at = (index: number): LngLat => {
    if (closed) return points[(index + n) % n]!;
    if (index < 0) return points[0]!;
    if (index >= n) return points[n - 1]!;
    return points[index]!;
  };
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(points[n - 1]!);
  return out;
}

function perpDist(p: LngLat, a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / mag;
}

export function simplify(points: LngLat[], epsilon: number): LngLat[] {
  if (points.length < 3) return points.slice();
  let max = 0;
  let index = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpDist(points[i]!, first, last);
    if (dist > max) {
      max = dist;
      index = i;
    }
  }
  if (max > epsilon) {
    const left = simplify(points.slice(0, index + 1), epsilon);
    const right = simplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

export function simplifyCap(points: LngLat[], epsilon: number, cap = 48): LngLat[] {
  let eps = Math.max(epsilon, 1e-8);
  let out = simplify(points, eps);
  let guard = 0;
  while (out.length > cap && guard < 12) {
    eps *= 1.7;
    out = simplify(points, eps);
    guard += 1;
  }
  return out;
}

export function dedupe(points: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(prev[0] - point[0], prev[1] - point[1]) > 1e-7) out.push(point);
  }
  return out;
}

export function pathClosed(feature: PathFeature): boolean {
  return feature.kind === "polygon" ? true : feature.closed;
}

export function pathDisplay(feature: PathFeature): LngLat[] {
  const closed = pathClosed(feature);
  if (feature.smooth && feature.points.length >= (closed ? 3 : 2)) {
    return catmullRom(feature.points, closed, 8);
  }
  return feature.points;
}

export function arrowGeometry(
  points: LngLat[],
  headM: number,
): { line: LngLat[]; head: LngLat[] } {
  if (points.length < 2) return { line: points.slice(), head: [] };
  const prev = points[points.length - 2]!;
  const tip = points[points.length - 1]!;
  const span = distMeters(prev, tip);
  const back = Math.min(headM * 0.7, span * 0.42);
  const stem = back > 1 ? destination(tip, bearing(tip, prev), back) : tip;
  const left = destination(tip, bearing(prev, tip) + 152, headM);
  const right = destination(tip, bearing(prev, tip) - 152, headM);
  return { line: points.slice(0, -1).concat([stem]), head: [left, tip, right] };
}

export function militaryArrow(points: LngLat[], widthM: number, smooth: boolean): LngLat[] {
  const raw = dedupe(points);
  if (raw.length < 2) return raw.slice();
  const line = smooth && raw.length >= 3 ? catmullRom(raw, false, 10) : raw;
  const width = Math.max(12, widthM);
  const total = pathLength(line);
  const cut = Math.min(width * 2.6, Math.max(width, total * 0.42));
  const tip = line[line.length - 1]!;
  let remain = cut;
  let neck = tip;
  let shaft = line.slice();
  for (let i = line.length - 1; i > 0; i--) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const span = distMeters(a, b);
    if (span >= remain) {
      neck = destination(b, bearing(b, a), remain);
      shaft = line.slice(0, i).concat([neck]);
      remain = 0;
      break;
    }
    remain -= span;
  }
  if (remain > 0) {
    neck = line[0]!;
    shaft = [neck];
  }
  const body = shaft.length >= 2 ? shaft : [shaft[0] ?? neck, neck];
  const left: LngLat[] = [];
  const right: LngLat[] = [];
  for (let i = 0; i < body.length; i++) {
    const prev = body[Math.max(0, i - 1)]!;
    const next = body[Math.min(body.length - 1, i + 1)]!;
    const dir = bearing(prev, next);
    left.push(destination(body[i]!, dir - 90, width / 2));
    right.push(destination(body[i]!, dir + 90, width / 2));
  }
  const aim = bearing(body.length >= 2 ? body[body.length - 2]! : body[0]!, tip);
  const headL = destination(neck, aim - 90, width * 1.15);
  const headR = destination(neck, aim + 90, width * 1.15);
  return [...left, headL, tip, headR, ...right.reverse()];
}

export function centroidOf(feature: Feature): LngLat {
  if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") return feature.at;
  if (feature.kind === "circle") return feature.center;
  if (!feature.points.length) return [0, 0];
  let x = 0;
  let y = 0;
  for (const point of feature.points) {
    x += point[0];
    y += point[1];
  }
  return [x / feature.points.length, y / feature.points.length];
}

export function translateFeature(feature: Feature, dLng: number, dLat: number): Feature {
  if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") {
    const at: LngLat = [feature.at[0] + dLng, feature.at[1] + dLat];
    if (feature.kind === "fort" && feature.reach) {
      return {
        ...feature,
        at,
        reach: feature.reach.map((point) => [point[0] + dLng, point[1] + dLat]),
      };
    }
    return { ...feature, at };
  }
  if (feature.kind === "circle") {
    return { ...feature, center: [feature.center[0] + dLng, feature.center[1] + dLat] };
  }
  return {
    ...feature,
    points: feature.points.map((point) => [point[0] + dLng, point[1] + dLat]),
  };
}

export function gridStep(lat: number, zoom: number): number {
  const mpp = metersPerPixel(lat, zoom);
  const steps = [30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005];
  let best = steps[0]!;
  let bestScore = Infinity;
  for (const step of steps) {
    const px = (step * 111320) / mpp;
    const score = Math.abs(Math.log((px || 1) / 140));
    if (px >= 70 && px <= 280 && score < bestScore) {
      best = step;
      bestScore = score;
    }
  }
  if (bestScore === Infinity) {
    for (const step of steps) {
      const px = (step * 111320) / mpp;
      const score = Math.abs(Math.log((px || 1) / 140));
      if (score < bestScore) {
        best = step;
        bestScore = score;
      }
    }
  }
  return best;
}

export function coordText(value: number, step: number, axis: "lat" | "lng"): string {
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const hemisphere = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(digits)}°${hemisphere}`;
}

export function isCircle(feature: Feature): feature is CircleFeature {
  return feature.kind === "circle";
}
