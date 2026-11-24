import { useEffect, useState } from "react";
import { toLocal, type GeoFrame } from "../project/import";
import { type MapPoint } from "./position";

type Fix = { point: MapPoint; accuracy: number; altitude: number | null; stale: boolean };

export function useLocation(frame: GeoFrame | undefined) {
  const supported = !!frame && window.isSecureContext && "geolocation" in navigator;
  const [watching, setWatching] = useState(false);
  const [issue, setIssue] = useState("");
  const [fix, setFix] = useState<Fix | null>(null);

  useEffect(() => {
    if (!watching || !frame || !supported) return;
    let expiry: number;
    const id = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      if (!Number.isFinite(coords.accuracy)) return;
      const remaining = 25_000 - (Date.now() - timestamp);
      setIssue("");
      setFix({ point: toLocal(coords.latitude, coords.longitude, frame), accuracy: coords.accuracy,
        altitude: coords.altitude, stale: remaining <= 0 });
      window.clearTimeout(expiry);
      if (remaining > 0) expiry = window.setTimeout(() => setFix((latest) => latest && { ...latest, stale: true }), remaining);
    }, (error) => {
      setIssue(error.code === 1 ? "定位权限已关闭。" : "暂未收到新位置。");
      setFix((latest) => latest && { ...latest, stale: true });
      if (error.code === 1) setWatching(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 });
    return () => { navigator.geolocation.clearWatch(id); window.clearTimeout(expiry); };
  }, [watching, frame, supported]);

  function toggle() {
    setFix(null);
    setIssue("");
    setWatching(!watching);
  }
  return { supported, watching, fix, issue, toggle };
}
