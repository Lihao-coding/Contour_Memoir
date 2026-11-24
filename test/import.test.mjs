import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import { importProject, sceneData, toLocal } from "../src/project/import.ts";

const sample = {
  version: 1, title: "Test route", size: [120, 120],
  samples: [[-40, 0, 2970, 0], [0, 20, 3010, 45], [40, 0, 3000, 90]],
  time: "recorded", frame: { lat: 31, lon: 103 },
};

test("the demo validates and decodes without absolute position or timestamps", async () => {
  const demo = importProject(JSON.parse(await readFile(new URL("../public/demo/maclehose.trail.json", import.meta.url), "utf8")));
  assert.equal(demo.frame, undefined);
  assert.equal(demo.time, "estimated");
  assert.ok(demo.samples.every((sample) => sample[2] === null));
  const scene = sceneData(demo);
  assert.equal(scene.data.heightmap.length, demo.terrain.grid ** 2);
  assert.ok(scene.track.distance_m > 10000);
  assert.equal(scene.profile, null);
});

test("route-only imports keep recorded elevation and time", () => {
  const route = sceneData(importProject(sample));
  assert.deepEqual(route.profile, [0, 40, 30]);
  assert.equal(route.max, 3010);
  assert.equal(route.track.duration_s, 90);
  assert.deepEqual(toLocal(31, 103, sample.frame), { x: 0, z: 0 });
});

test("inland grids use local render height while preserving original altitude", () => {
  const terrain = { grid: 2, min: 2990, max: 3100, heights: "AAD/////AAA=", attribution: "Test" };
  const project = importProject({ ...sample, terrain });
  const route = sceneData(project);
  assert.equal(project.terrain.max, 3100);
  assert.equal(route.data.meta.elev_min, 0);
  assert.equal(route.data.meta.elev_max, 110);
  assert.deepEqual([...route.data.heightmap], [0, 65535, 65535, 0]);
});

test("rejects oversized, duplicate, out-of-range or incomplete input", () => {
  assert.throws(() => importProject({ ...sample, size: [15000, 15000] }));
  assert.throws(() => importProject({ ...sample, samples: [sample.samples[0], sample.samples[0]] }));
  assert.throws(() => importProject({ ...sample, samples: [...sample.samples, [100, 0, 20, 100]] }));
  assert.throws(() => importProject({ ...sample, terrain: { grid: 2, min: 0, max: 10, heights: "AAAA", attribution: "Test" } }));
});
