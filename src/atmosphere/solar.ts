import { Color, MathUtils, Vector3 } from "three";

type Sample = [elapsed: number, sunAltitude: number, sunBearing: number, moonAltitude: number, moonBearing: number];
export type SolarData = { localStartSeconds: number; step: number; samples: Sample[] };

function bearingLerp(a: number, b: number, t: number) {
  return MathUtils.euclideanModulo(a + (MathUtils.euclideanModulo(b - a + 180, 360) - 180) * t, 360);
}

export function solarAt(data: SolarData, elapsed: number) {
  const index = Math.min(Math.floor(elapsed / data.step), data.samples.length - 2);
  const a = data.samples[index];
  const b = data.samples[index + 1];
  const t = MathUtils.clamp((elapsed - a[0]) / (b[0] - a[0]), 0, 1);
  return {
    altitude: MathUtils.lerp(a[1], b[1], t),
    bearing: bearingLerp(a[2], b[2], t),
    moonAltitude: MathUtils.lerp(a[3], b[3], t),
    moonBearing: bearingLerp(a[4], b[4], t),
  };
}

function direction(altitude: number, bearing: number) {
  const height = MathUtils.degToRad(altitude);
  const angle = MathUtils.degToRad(bearing);
  // Local coordinates are east (+X), up (+Y), south (+Z).
  return new Vector3(Math.cos(height) * Math.sin(angle), Math.sin(height), -Math.cos(height) * Math.cos(angle));
}

const palette = {
  day: { key: new Color("#fff6e5"), fill: new Color("#b8d4e8"), sky: new Color("#101415"), keyPower: 2.2, fillPower: 0.7, exposure: 1 },
  gold: { key: new Color("#ffb066"), fill: new Color("#ffd9b0"), sky: new Color("#1f1917"), keyPower: 1.8, fillPower: 0.5, exposure: 1.1 },
  blue: { key: new Color("#5a7fff"), fill: new Color("#1a2340"), sky: new Color("#0f1423"), keyPower: 0.25, fillPower: 0.15, exposure: 1.4 },
};

export function lightingAt(solar?: ReturnType<typeof solarAt>) {
  const altitude = solar?.altitude ?? 60;
  const sun = solar ? direction(altitude, solar.bearing) : new Vector3(-0.6, 0.79, -0.43).normalize();
  const moon = solar ? direction(solar.moonAltitude, solar.moonBearing) : new Vector3(0, 1, 0);
  const lower = altitude >= 0 ? palette.gold : palette.blue;
  const upper = altitude >= 0 ? palette.day : palette.gold;
  const mix = altitude >= 0 ? MathUtils.smoothstep(altitude, 10, 30) : MathUtils.smoothstep(altitude, -6, 0);
  const moonMix = 1 - MathUtils.smoothstep(altitude, -6, 0);
  return {
    sun,
    moon,
    sunWeight: 1 - moonMix,
    moonWeight: moonMix * MathUtils.smoothstep(solar?.moonAltitude ?? 0, 0, 6),
    key: lower.key.clone().lerp(upper.key, mix),
    fill: lower.fill.clone().lerp(upper.fill, mix),
    sky: lower.sky.clone().lerp(upper.sky, mix),
    keyPower: MathUtils.lerp(lower.keyPower, upper.keyPower, mix),
    fillPower: MathUtils.lerp(lower.fillPower, upper.fillPower, mix),
    exposure: MathUtils.lerp(lower.exposure, upper.exposure, mix),
  };
}

export type Lighting = ReturnType<typeof lightingAt>;
