export interface TerrainMeta {
  grid: number;
  elev_min: number;
  elev_max: number;
  size_m: [number, number];
  crs: string;
  vef: number;
  encoding: "uint16-le";
  row_order: "north-to-south";
  albedo: string | null;
  surface_detail?: "surface-detail.webp";
  relief?: "terrain-relief.webp";
  dem_source?: "hk-landsd-dtm-5m";
  orthophoto?: { file: "east-dam-orthophoto.webp"; bounds_m: [number, number, number, number] };
  orthophoto_mosaic?: {
    file: "sai-kung-orthophoto.webp";
    coverage: number;
    solid_coverage: number;
    estimated_land_coverage: number;
    metres_per_pixel: number;
  };
}

export interface TerrainData {
  meta: TerrainMeta;
  heightmap: Uint16Array;
}

export function decodeHeightmap(buffer: ArrayBuffer, meta: TerrainMeta): Uint16Array {
  if (
    !Number.isInteger(meta.grid) || meta.grid < 2 || meta.grid > 548 ||
    buffer.byteLength !== meta.grid * meta.grid * 2 ||
    meta.encoding !== "uint16-le" || meta.row_order !== "north-to-south" ||
    !meta.size_m.every((size) => Number.isFinite(size) && size > 0) ||
    !Number.isFinite(meta.elev_min) || !Number.isFinite(meta.elev_max) ||
    meta.elev_max <= meta.elev_min || !(meta.vef >= 1 && meta.vef <= 2.5)
  ) {
    throw new Error("高程文件与地形配置不匹配。");
  }
  const source = new DataView(buffer);
  const heightmap = new Uint16Array(meta.grid ** 2);
  for (let i = 0; i < heightmap.length; i++) heightmap[i] = source.getUint16(i * 2, true);
  return heightmap;
}

export function sampleHeight({ meta, heightmap }: TerrainData, x: number, z: number): number {
  const [width, depth] = meta.size_m;
  const last = meta.grid - 1;
  const u = Math.max(0, Math.min(last, (x / width + 0.5) * last));
  const v = Math.max(0, Math.min(last, (z / depth + 0.5) * last));
  const i = Math.min(last - 1, Math.floor(u));
  const j = Math.min(last - 1, Math.floor(v));
  const du = u - i;
  const dv = v - j;
  const top = j * meta.grid + i;
  const bottom = top + meta.grid;
  // Match PlaneGeometry's diagonal between the northeast and southwest vertices.
  const height = du + dv <= 1
    ? heightmap[top] * (1 - du - dv) + heightmap[top + 1] * du + heightmap[bottom] * dv
    : heightmap[bottom + 1] * (du + dv - 1) + heightmap[top + 1] * (1 - dv) + heightmap[bottom] * (1 - du);
  return meta.elev_min + (height / 65535) * (meta.elev_max - meta.elev_min);
}
