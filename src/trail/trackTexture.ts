import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, UnsignedByteType, Vector3 } from "three";
import type { GroundTrack } from "./track";

export function trackTexture(route: GroundTrack, distance: number, size: [number, number], maxPixels: number) {
  const [width, depth] = size;
  const density = maxPixels / Math.max(...size);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(depth * density);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / depth, canvas.width / 2, canvas.height / 2);
  ctx.lineWidth = 8;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.beginPath();
  const samples = Math.ceil(distance / 2);
  const point = new Vector3();
  for (let i = 0; i <= samples; i++) {
    route.getPointAt(i / samples, point);
    if (i === 0) ctx.moveTo(point.x, point.z);
    else ctx.lineTo(point.x, point.z);
  }
  ctx.stroke();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[4 * i + 3];
  const texture = new DataTexture(alpha, canvas.width, canvas.height, RedFormat, UnsignedByteType);
  texture.flipY = true;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
