import { CatmullRomCurve3, Curve, TubeGeometry, Vector3 } from "three";
import { sampleHeight, type TerrainData } from "../terrain/sampleHeight";

type TrackPoint = [x: number, z: number, distance: number, seconds: number];
export const trackOffset = 1.7;

export interface TrackData {
  points: TrackPoint[];
  timing: [seconds: number, metres: number][];
  distance_m: number;
  duration_s: number;
  time_estimated: boolean;
}

export function validateTrack(track: TrackData): TrackData {
  if (!Array.isArray(track.points) || track.points.length < 2 || !(track.distance_m > 0) ||
      track.points[0][2] !== 0 || track.points.at(-1)?.[2] !== track.distance_m ||
      track.points.some((point, i) => point.length !== 4 || !point.every(Number.isFinite) ||
        (i > 0 && (point[2] <= track.points[i - 1][2] || point[3] < track.points[i - 1][3])))) {
    throw new Error("轨迹文件格式不正确。");
  }
  if (!Number.isFinite(track.duration_s) || track.duration_s <= 0 ||
      !Array.isArray(track.timing) || track.timing.length < 2 ||
      track.timing[0][0] !== 0 || track.timing[0][1] !== 0 ||
      track.timing.at(-1)?.[0] !== track.duration_s || track.timing.at(-1)?.[1] !== track.distance_m ||
      track.timing.some((point, i) => point.length !== 2 || !point.every(Number.isFinite) ||
        (i > 0 && (point[0] < track.timing[i - 1][0] || point[1] < track.timing[i - 1][1])))) {
    throw new Error("轨迹播放时间轴格式不正确。");
  }
  return track;
}

export function distanceAtTime(track: TrackData, seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds >= track.duration_s) return track.distance_m;
  const { timing } = track;
  let lo = 0;
  let hi = timing.length - 1;
  while (hi - lo > 1) {
    const mid = (hi + lo) >> 1;
    if (timing[mid][0] <= seconds) lo = mid;
    else hi = mid;
  }
  const [start, a] = timing[lo];
  const [end, b] = timing[hi];
  return a + (b - a) * (seconds - start) / (end - start);
}

export class GroundTrack extends Curve<Vector3> {
  private readonly planar: CatmullRomCurve3;

  constructor(
    private readonly track: TrackData,
    private readonly terrain: TerrainData,
    private readonly exaggeration: number,
    private readonly offset = trackOffset,
    private readonly profile: number[] | null = null,
  ) {
    super();
    this.planar = new CatmullRomCurve3(track.points.map(([x, z]) => new Vector3(x, 0, z)), false, "centripetal");
  }

  private segment(progress: number) {
    const { points, distance_m } = this.track;
    const distance = Math.min(1, Math.max(0, progress)) * distance_m;
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (hi + lo) >> 1;
      if (points[mid][2] <= distance) lo = mid;
      else hi = mid;
    }
    const fraction = (distance - points[lo][2]) / (points[hi][2] - points[lo][2]);
    return { lo, hi, fraction };
  }

  getPoint(progress: number, target = new Vector3()): Vector3 {
    const { lo, hi, fraction } = this.segment(progress);
    const planarProgress = (lo + fraction) / (this.track.points.length - 1);
    this.planar.getPoint(planarProgress, target);
    const elevation = this.profile
      ? this.profile[lo] + (this.profile[hi] - this.profile[lo]) * fraction
      : sampleHeight(this.terrain, target.x, target.z);
    target.y = elevation * this.exaggeration + this.offset;
    return target;
  }

  getPointAt(progress: number, target?: Vector3): Vector3 {
    return this.getPoint(progress, target);
  }

  getTangentAt(progress: number, target?: Vector3): Vector3 {
    return this.getTangent(progress, target);
  }

  elapsedAt(progress: number): number {
    const { lo, hi, fraction } = this.segment(progress);
    const a = this.track.points[lo][3];
    return a + fraction * (this.track.points[hi][3] - a);
  }

  createTube(distance: number): TubeGeometry {
    const segments = Math.max(12, Math.min(4800, Math.ceil(distance / 3)));
    const sides = 6;
    const radius = Math.max(...this.terrain.meta.size_m) / 4200;
    const tube = new TubeGeometry(this, segments, radius, sides, false);
    if (this.profile) return tube;
    const positions = tube.getAttribute("position");
    const center = new Vector3();
    for (let ring = 0; ring <= segments; ring++) {
      this.getPointAt(ring / segments, center);
      for (let side = 0; side <= sides; side++) {
        const i = ring * (sides + 1) + side;
        const surface = sampleHeight(this.terrain, positions.getX(i), positions.getZ(i)) * this.exaggeration;
        const relative = positions.getY(i) - center.y;
        positions.setY(i, surface + this.offset + relative);
      }
    }
    tube.computeVertexNormals();
    return tube;
  }

}
