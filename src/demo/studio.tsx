import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";
import { SRGBColorSpace, TextureLoader } from "three";
import { asset } from "../assets";
import type { Orthophoto } from "../terrain/HeightmapTerrain";
import type { GroundTrack } from "../trail/track";

export const aerialSource = "https://data.gov.hk/en-data/dataset/hk-landsd-openmap-true-digital-orthophoto";
export const aerialCredit = "航片 © 香港特别行政区政府地政总署 · DATA.GOV.HK / CSDI Portal";
export const studioAsset = (name: string) => asset("demo/studio/" + name);

export const routePhotos = [
  { id: "po-pin-chau", label: "破边洲", english: "Po Pin Chau", x: 1578, z: 2075,
    image: "po-pin-chau.webp", creator: "ImMrDrake", source: "https://commons.wikimedia.org/wiki/File:PoPinChau.JPG",
    license: "公有领域", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", width: 1333, height: 1000 },
  { id: "long-ke-wan", label: "浪茄湾", english: "Long Ke Wan", x: 1897, z: 678,
    image: "long-ke-wan.webp", creator: "Minghong", source: "https://commons.wikimedia.org/wiki/File:Long_Ke_Wan_2.jpg",
    license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", width: 1440, height: 533 },
] as const;
export type RoutePhoto = typeof routePhotos[number];
export type PhotoStop = { photo: RoutePhoto; progress: number };

export function useOrthophoto(enabled: boolean) {
  const [layer, setLayer] = useState<Orthophoto | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const loader = new TextureLoader();
    const load = (name: string, loaded: () => void, failed: () => void) => {
      const texture = loader.load(studioAsset(name), loaded, undefined, failed);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    };
    let fullReady = false;
    let insetReady = false;
    function update() {
      if (cancelled || !fullReady) return;
      setLayer({
        map: full,
        inset: insetReady ? { map: inset, bounds: [560, 1210, 1900, 2103.3032682645135] } : undefined,
      });
    }
    const full = load("sai-kung-orthophoto.webp", () => { fullReady = true; update(); }, () => { if (!cancelled) setError(true); });
    const inset = load("east-dam-orthophoto.webp", () => { insetReady = true; update(); }, () => {});
    return () => { cancelled = true; full.dispose(); inset.dispose(); };
  }, [enabled]);
  return { layer, error };
}

export function PhotoPins({ stops, route, selected, onSelect }: {
  stops: PhotoStop[]; route: GroundTrack; selected?: string; onSelect: (stop: PhotoStop) => void;
}) {
  return stops.map((stop) => {
    const point = route.getPointAt(stop.progress);
    return <Html key={stop.photo.id} position={[point.x, point.y + 22, point.z]} center zIndexRange={[10, 2]}>
      <button type="button" className="photo-pin" aria-label={`打开照片 · ${stop.photo.label}`}
        aria-pressed={selected === stop.photo.id} onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onSelect(stop)}>
        <span>{stop.photo.label}</span><small>{stop.photo.english}</small>
      </button>
    </Html>;
  });
}

export function PhotoRail({ stops, selected, onSelect, onClose }: {
  stops: PhotoStop[]; selected?: PhotoStop; onSelect: (stop: PhotoStop) => void; onClose: () => void;
}) {
  return <section className="panel-section photo-section" aria-label="沿途照片">
    <div className="photo-heading"><h2>沿途照片</h2>{selected && <button type="button" onClick={onClose}>关闭照片</button>}</div>
    {selected && <figure className="route-photo">
      <img src={studioAsset(selected.photo.image)} width={selected.photo.width} height={selected.photo.height} alt={selected.photo.label} />
      <figcaption>{selected.photo.label} · <a href={selected.photo.source}>{selected.photo.creator}</a>
        {" · "}<a href={selected.photo.licenseUrl}>{selected.photo.license}</a></figcaption>
    </figure>}
    <div className="photo-rail">
      {stops.map((stop) => <button type="button" key={stop.photo.id} aria-pressed={selected?.photo.id === stop.photo.id}
        onClick={() => onSelect(stop)}>
        <img src={studioAsset(stop.photo.image)} alt="" loading="lazy" />
        <span>{stop.photo.label}</span>
      </button>)}
    </div>
  </section>;
}
