import type { TerrainData } from "../terrain/sampleHeight";
import type { TrackData } from "../trail/track";

export type Sample = [x: number, z: number, elevation: number | null, elapsed: number];
export type GeoFrame = { lat: number; lon: number };
export type TrailProject = {
  version: 1;
  title: string;
  size: [width: number, depth: number];
  samples: Sample[];
  time: "recorded" | "estimated";
  frame?: GeoFrame;
  terrain?: { grid: number; min: number; max: number; heights: string; coastal?: boolean; lakeLevel?: number; attribution: string };
};

const metrePerDegree = Math.PI * 6371008.8 / 180;
const maxPoints = 50_000;
export const maxFileBytes = 12 * 1024 * 1024;

export function toLocal(lat: number, lon: number, frame: GeoFrame) {
  const longitude = ((lon - frame.lon + 540) % 360) - 180;
  return {
    x: longitude * metrePerDegree * Math.cos(frame.lat * Math.PI / 180),
    z: (frame.lat - lat) * metrePerDegree,
  };
}

function elevation(value: number | null) {
  return value === null || (Number.isFinite(value) && value >= -12000 && value <= 10000);
}

function finiteList(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

export function importProject(value: unknown): TrailProject {
  const project = value as TrailProject | null;
  if (!project || project.version !== 1 || typeof project.title !== "string" || !project.title.trim() || project.title.length > 100 ||
      (project.time !== "estimated" && project.time !== "recorded") ||
      !finiteList(project.size, 2) || project.size.some((m) => m < 1) || Math.hypot(...project.size) > 15000 ||
      !Array.isArray(project.samples) || project.samples.length < 2 || project.samples.length > maxPoints) {
    throw new Error("路线包格式不正确，或范围超过 15 公里。");
  }
  if (project.frame && (!Number.isFinite(project.frame.lat) || Math.abs(project.frame.lat) > 89 ||
      !Number.isFinite(project.frame.lon) || Math.abs(project.frame.lon) > 180)) {
    throw new Error("路线包坐标参考无效。");
  }
  for (const [index, row] of project.samples.entries()) {
    const previous = project.samples[index - 1];
    if (!Array.isArray(row) || row.length !== 4 || !Number.isFinite(row[0]) || Math.abs(row[0]) > project.size[0] / 2 ||
        !Number.isFinite(row[1]) || Math.abs(row[1]) > project.size[1] / 2 || !elevation(row[2]) ||
        !Number.isFinite(row[3]) || (previous ? row[3] <= previous[3] || (row[0] === previous[0] && row[1] === previous[1]) : row[3] !== 0)) {
      throw new Error("路线点有重复、越界、高程无效或时间顺序错误。");
    }
  }
  if (project.terrain !== undefined) {
    const surface = project.terrain;
    if (!surface || !Number.isInteger(surface.grid) || surface.grid < 2 || surface.grid > 512 ||
        !Number.isFinite(surface.min) || !Number.isFinite(surface.max) || !elevation(surface.min) || !elevation(surface.max) ||
        surface.max <= surface.min || typeof surface.heights !== "string" ||
        surface.heights.length !== 4 * Math.ceil(surface.grid ** 2 * 2 / 3) ||
        typeof surface.attribution !== "string" || !surface.attribution.trim() || surface.attribution.length > 300 ||
        (surface.coastal !== undefined && typeof surface.coastal !== "boolean") ||
        (surface.lakeLevel !== undefined && (!Number.isFinite(surface.lakeLevel) ||
          surface.lakeLevel < surface.min || surface.lakeLevel > surface.max))) {
      throw new Error("高程网格格式无效。");
    }
    try {
      if (atob(surface.heights).length !== surface.grid ** 2 * 2) throw new Error();
    } catch {
      throw new Error("高程网格大小不匹配。");
    }
  }
  return project;
}

const children = (node: Element, name: string) => Array.from(node.children).filter((child) => child.localName === name);
const valueOf = (node: Element, name: string) => children(node, name)[0]?.textContent?.trim();
type Fix = { lat: number; lon: number; elevation: number | null; time: number };

function convert(points: Element[], name: string): TrailProject {
  const fixes: Fix[] = [];
  for (const point of points) {
    const lat = Number(point.getAttribute("lat") ?? NaN);
    const lon = Number(point.getAttribute("lon") ?? NaN);
    if (!point.getAttribute("lat")?.trim() || !point.getAttribute("lon")?.trim() ||
        !Number.isFinite(lat) || Math.abs(lat) > 89 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
      throw new Error("GPX 中有无效的 WGS84 坐标。");
    }
    const previous = fixes.at(-1);
    if (previous?.lat === lat && previous.lon === lon) continue;
    const ele = valueOf(point, "ele");
    const height = ele ? Number(ele) : null;
    fixes.push({ lat, lon, elevation: elevation(height) ? height : null, time: Date.parse(valueOf(point, "time") ?? "") });
  }
  if (fixes.length < 2) throw new Error("每段路线至少需要两个不同位置的轨迹点。");
  const first = fixes[0];
  const offsets = fixes.map((point) => ((point.lon - first.lon + 540) % 360) - 180);
  const lats = fixes.map((point) => point.lat);
  const centerLon = first.lon + (Math.min(...offsets) + Math.max(...offsets)) / 2;
  const frame = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: ((centerLon + 540) % 360) - 180 };
  const local = fixes.map(({ lat, lon }) => toLocal(lat, lon, frame));
  const width = 2 * Math.max(...local.map(({ x }) => Math.abs(x)));
  const depth = 2 * Math.max(...local.map(({ z }) => Math.abs(z)));
  const diagonal = Math.hypot(width, depth);
  if (diagonal >= 15000) throw new Error("路线范围超过 15 公里，请先分段导出。");
  const padding = Math.min(550, diagonal * 0.17 + 20, (15000 - diagonal) / 4);
  const size: TrailProject["size"] = [Math.max(1, width + padding * 2), Math.max(1, depth + padding * 2)];
  const recorded = fixes.every((point, index) => Number.isFinite(point.time) && (!index || point.time > fixes[index - 1].time));
  let elapsed = 0;
  const samples: Sample[] = local.map(({ x, z }, index) => {
    if (recorded) elapsed = (fixes[index].time - first.time) / 1000;
    else if (index > 0) elapsed += Math.hypot(x - local[index - 1].x, z - local[index - 1].z) / 1.35;
    return [x, z, fixes[index].elevation, elapsed];
  });
  return importProject({ version: 1, title: name.trim().slice(0, 100) || "未命名路线", size, samples, frame, time: recorded ? "recorded" : "estimated" });
}

export function parseGpx(source: string, filename = "徒步路线"): TrailProject[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("GPX 不支持文档类型声明。");
  const document = new DOMParser().parseFromString(source, "text/xml");
  const root = document.documentElement;
  if (root.localName !== "gpx" || document.querySelector("parsererror")) throw new Error("无法读取 GPX 文件，请重新导出。");
  const groups = [
    ...children(root, "trk").flatMap((track) => children(track, "trkseg").map((segment, index, all) => ({
      name: (valueOf(track, "name") || filename) + (all.length > 1 ? ` · 第 ${index + 1} 段` : ""),
      points: children(segment, "trkpt"),
    }))),
    ...children(root, "rte").map((route) => ({ name: valueOf(route, "name") || filename, points: children(route, "rtept") })),
  ].filter(({ points }) => points.length >= 2);
  if (!groups.length) throw new Error("GPX 没有可渲染的路线。");
  if (groups.length > 100 || groups.reduce((total, { points }) => total + points.length, 0) > maxPoints) {
    throw new Error("轨迹点过多，请把 GPX 拆成更小的文件。");
  }
  return groups.map(({ points, name }) => convert(points, name));
}

export async function readTrailFile(file: File) {
  if (file.size > maxFileBytes) throw new Error("文件超过 12 MB，请缩小高程网格或拆分轨迹。");
  const source = await file.text();
  if (/\.gpx$/i.test(file.name)) return parseGpx(source, file.name.replace(/\.gpx$/i, ""));
  if (/\.json$/i.test(file.name)) {
    let parsed;
    try { parsed = JSON.parse(source); }
    catch { throw new Error("无法读取 JSON 路线包。"); }
    return [importProject(parsed)];
  }
  throw new Error("请选择 GPX 或 Trail JSON 文件。");
}

export function sceneData(project: TrailProject) {
  const { terrain, size, samples } = project;
  const elevations = samples.flatMap((point) => point[2] === null ? [] : [point[2]]);
  const completeProfile = elevations.length === samples.length;
  const min = completeProfile ? Math.min(...elevations) : 0;
  const max = completeProfile ? Math.max(...elevations) : 0;
  let distance = 0;
  const points: TrackData["points"] = samples.map(([x, z, , elapsed], index) => {
    if (index > 0) distance += Math.hypot(x - samples[index - 1][0], z - samples[index - 1][1]);
    return [x, z, distance, elapsed];
  });
  const track: TrackData = {
    points, timing: points.map((point) => [point[3], point[2]]), distance_m: distance,
    duration_s: points.at(-1)![3], time_estimated: project.time === "estimated",
  };
  const grid = terrain?.grid ?? 2;
  const datum = terrain && !terrain.coastal ? terrain.min : 0;
  const source = terrain ? Uint8Array.from(atob(terrain.heights), (byte) => byte.charCodeAt(0)) : new Uint8Array(8);
  const view = new DataView(source.buffer);
  const data: TerrainData = {
    meta: {
      grid, size_m: size, elev_min: (terrain?.min ?? 0) - datum,
      elev_max: terrain ? terrain.max - datum : Math.max(1, max - min),
      vef: 1, crs: "local-metre", encoding: "uint16-le", row_order: "north-to-south", albedo: null,
    },
    heightmap: Uint16Array.from({ length: grid ** 2 }, (_, index) => view.getUint16(index * 2, true)),
  };
  return { data, track, min, max, hasElevation: completeProfile, profile: !terrain && completeProfile ? elevations.map((height) => height - min) : null };
}
