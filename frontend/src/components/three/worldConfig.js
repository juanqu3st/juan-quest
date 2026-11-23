import * as THREE from 'three';

/**
 * JuanQuest 3D Living Pinoy Barrio World Layout.
 * Expanded rolling valley with natural flat clearings for the 5 map landmarks,
 * an open tree-free earthen Patintero playground, scenic riverside fishing & laundry spots,
 * roadside sari-sari stores, scattered hillside bahay kubos, and winding dirt trail.
 */
export const WORLD_SCALE = 2;
export const BUILD_SCALE = 1.9;
export const DIORAMA_SCALE = 1.0;
export const HEIGHT_SCALE = 1.5;

export const PLAZA_RADIUS = 8.5;
export const PLAZA_INNER = 7.5;
export const PLAZA_TOP = 0;

export const BRIDGE_X = 22;

/** Dedicated wide open tree-free dirt clearing (palaruan) for kids playing Patintero — 100% off the road! */
export const PATINTERO_ZONE = { x: -3, z: 18, yaw: 0.14, clearRadius: 14.5 };

/** Riverside life spots cleanly clear of bridge & landmarks */
export const RIVER_FISHERMAN = { x: -12, z: -28.2, yaw: Math.PI };
export const RIVER_WASHER = { x: 40, z: -13.2, yaw: Math.PI };

/** Character size on the map (the GLB is ~1.06 units tall). */
export const CHAR_SCALE = 2.6;

/** Camera position relative to the character; pulls back gracefully on portrait phones. */
const BASE_CAM_OFFSET = new THREE.Vector3(-5.5, 8.5, 14.5);
export function cameraOffset(aspect, out = new THREE.Vector3()) {
    const k = aspect >= 1 ? 1 : Math.min(1.9, 0.85 / Math.max(0.3, aspect));
    return out.copy(BASE_CAM_OFFSET).multiplyScalar(Math.max(1, k));
}

export const WALK_SPEED = 7.2;

const S = WORLD_SCALE;

const BASE_STOPS = {
    1: [-24, 13], // Mapa 1: Ang Curfew (Munisipyo)
    2: [-11, 2], // Mapa 2: Ang Kuwartel
    3: [2, -8], // Mapa 3: Ang Kariton ng Lupa
    4: [14, 4], // Mapa 4: Ang Pinto at Palakol (Bahay Kubo)
    5: [25, 12], // Mapa 5: Ang mga Magnanakaw (Kagubatan)
};

// Natural winding Pinoy dirt trail (lupa) connecting Mapa 1..5 straight to the Bamboo Finish Arch.
const BASE_PATH = [
    [-24, 13],
    [-18, 8],
    [-11, 2],
    [-4.5, -3.5],
    [2, -8],
    [8.5, -2.5],
    [14, 4],
    [19.5, 8.5],
    [25, 12],
    [29.5, 11.2],
    [32.5, 5.5],
];

/** Curated roadside Pinoy Sari-Sari Stores (Tindahan), verified clear of landmarks, road, and river. */
export const BARRIO_TINDAHANS = [
    { x: -41, z: 8, yaw: 0.65, scale: 1.48 },
    { x: -13.5, z: -14.5, yaw: 0.58, scale: 1.48 },
    { x: 42.5, z: 9.5, yaw: -0.55, scale: 1.48 },
];

/** Curated resting Pinoy Askals curled peacefully in the shade (running askals are animated in BarrioLivingWorld). */
export const BARRIO_ASKALS = [
    { x: -10.0, z: -12.6, yaw: 0.35, scale: 1.48, resting: true },
    { x: 39.2, z: 11.8, yaw: -0.45, scale: 1.48, resting: true },
];

/** Curated Background Bahay Kubo Huts scattered across the expanded rolling hills & across the stream. */
export const BARRIO_KUBOS = [
    { x: -68, z: 12, yaw: 0.45, scale: 1.75 },
    { x: -58, z: -14, yaw: 0.30, scale: 1.65 },
    { x: -34, z: -22, yaw: 0.18, scale: 1.70 },
    { x: -26, z: 32, yaw: -0.25, scale: 1.65 },
    { x: 14, z: 29, yaw: -0.22, scale: 1.72 },
    { x: 26, z: 34, yaw: -0.35, scale: 1.65 },
    { x: 52, z: -6, yaw: -0.45, scale: 1.70 },
    { x: 10, z: -44, yaw: 0.12, scale: 1.85 },
    { x: 36, z: -40, yaw: -0.22, scale: 1.80 },
];

function baseRiverZ(x) {
    return -15.5 + Math.sin(x * 0.075) * 3.6 + x * 0.09;
}

export function riverCenterZ(x) {
    return baseRiverZ(x / S) * S;
}

function rawValleyHeight(x, z) {
    let y = Math.sin(x * 0.07) * Math.cos(z * 0.07) * 0.42 + Math.sin((x + z) * 0.045) * 0.28;

    const distRiver = Math.abs(z - baseRiverZ(x));
    if (distRiver < 5.2) {
        const t = 1 - distRiver / 5.2;
        y -= t * t * (3 - 2 * t) * 1.15;
    }

    // Expanded wider Pinoy valley meadow before rising gently toward the distant mountain rim!
    const radial = Math.sqrt((x / 50) ** 2 + (z / 42) ** 2);
    if (radial > 0.85) {
        const rim = radial - 0.85;
        y += rim * rim * 6.0;
    }
    return y;
}

// Natural flat clearings for all 5 map stops + the open Patintero playground!
const STOP_PLATEAU_Y = {};
for (let m = 1; m <= 5; m++) {
    const [sx, sz] = BASE_STOPS[m];
    STOP_PLATEAU_Y[m] = rawValleyHeight(sx, sz) + 0.52;
}
const PATINTERO_PLATEAU_Y = rawValleyHeight(PATINTERO_ZONE.x / S, PATINTERO_ZONE.z / S) + 0.18;

function baseHeight(x, z) {
    let y = rawValleyHeight(x, z);

    for (let m = 1; m <= 5; m++) {
        const [sx, sz] = BASE_STOPS[m];
        const d = Math.hypot(x - sx, z - sz);
        if (d < 7.6) {
            const inner = 4.4;
            const outer = 7.6;
            const k = d <= inner ? 1 : 1 - (d - inner) / (outer - inner);
            const blend = k * k * (3 - 2 * k);
            y = y + (STOP_PLATEAU_Y[m] - y) * blend;
        }
    }

    // Smoothly level the wide open Patintero playground clearing (flat within 11.5 world units!)
    const pd = Math.hypot(x - PATINTERO_ZONE.x / S, z - PATINTERO_ZONE.z / S);
    if (pd < 8.8) {
        const k = pd <= 5.8 ? 1 : 1 - (pd - 5.8) / 3.0;
        const blend = k * k * (3 - 2 * k);
        y = y + (PATINTERO_PLATEAU_Y - y) * blend;
    }

    return y;
}

/** Ground height shared by the terrain mesh, buildings, guards, dirt trail, trees, kubos, NPCs, and character. */
export function getTerrainHeight(x, z) {
    return baseHeight(x / S, z / S) * HEIGHT_SCALE;
}

export function createWorldCurve() {
    const pts = BASE_PATH.map(([x, z]) => new THREE.Vector3(x * S, getTerrainHeight(x * S, z * S), z * S));
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.45);
}

export const MAP_NODE_STOPS = (() => {
    const curve = createWorldCurve();
    const samples = 1600;
    const pts = curve.getSpacedPoints(samples);
    const stops = {};
    for (let m = 1; m <= 5; m++) {
        const x = BASE_STOPS[m][0] * S;
        const z = BASE_STOPS[m][1] * S;
        let best = 0;
        let bestD = Infinity;
        pts.forEach((p, i) => {
            const d = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        stops[m] = { t: best / samples, x, z };
    }
    return stops;
})();

export const FINISH_T = 1;

export function getWalkHeight(x, z) {
    return getTerrainHeight(x, z);
}

export function roadHeadingAt(curve, t) {
    const tan = curve.getTangentAt(Math.min(0.999, Math.max(0.001, t)));
    return Math.atan2(-tan.z, tan.x);
}
