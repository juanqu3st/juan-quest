import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
    BARRIO_ASKALS,
    BARRIO_KUBOS,
    BARRIO_TINDAHANS,
    BRIDGE_X,
    createWorldCurve,
    FINISH_ARCH_T,
    getTerrainHeight,
    MAP_NODE_STOPS,
    PAHINGAHAN_ZONE,
    PATINTERO_ZONE,
    PLAZA_RADIUS,
    RIVER_FISHERMAN,
    RIVER_WASHER,
    riverCenterZ,
    WORLD_SCALE,
} from './worldConfig';

useGLTF.preload('/models/tree_acacia.glb', '/draco/');
useGLTF.preload('/models/tree_banana.glb', '/draco/');

const S = WORLD_SCALE;

// Hand-placed scenic Branched Acacia/Mango trees right inside the heart of the barrio so the meadow feels lush & cozy!
const CURATED_ACACIAS = [
    [-58, 22, 1.85, 0.4],
    [-46, -4, 1.78, 1.2],
    [-31, -8, 1.82, 2.3],
    [-19, 17, 1.75, 0.9],
    [-17, -23, 1.85, 3.1],
    [-3, -2, 1.72, 1.6],
    [13, 14, 1.82, 2.5],
    [22, -6, 1.76, 0.7],
    [34, -10, 1.80, 4.1],
    [40, 26, 1.88, 1.1],
    [55, 6, 1.92, 2.0],
    [62, 26, 1.82, 3.4],
    [-42, 34, 1.90, 0.6],
    [-8, 36, 1.85, 2.8],
    [18, 40, 1.88, 1.7],
    [-22, -46, 1.95, 0.5],
    [2, -44, 1.88, 2.2],
    [26, -42, 1.90, 3.9],
    [50, -34, 1.85, 1.4],
    [-50, -30, 1.90, 2.9],
];

// Hand-placed Pinoy Banana Trees (Puno ng Saging) right beside kubos, tindahans, riverbanks & scenic roadside edges!
const CURATED_BANANAS = [
    // Beside Tindahan 1, 2, 3
    [-45.5, 5.5, 1.38, 0.4],
    [-44.0, 11.2, 1.18, 2.1],
    [-18.0, -16.2, 1.35, 1.1],
    [-9.2, -18.2, 1.20, 3.5],
    [46.8, 7.2, 1.35, 0.8],
    [45.5, 13.0, 1.16, 2.7],
    // Along scenic riverbanks (near Fisherman, Bridge, Washerwoman & Mapa 3)
    [-25.0, -26.5, 1.40, 1.4],
    [-6.5, -24.5, 1.26, 2.9],
    [12.5, -18.5, 1.32, 0.5],
    [33.5, -14.8, 1.36, 1.9],
    [45.5, -11.5, 1.28, 3.2],
    [54.0, -12.0, 1.35, 0.7],
    // Beside neighborhood Bahay Kubos & Patintero outer sideline
    [-62.5, 14.5, 1.35, 1.5],
    [-53.5, -10.5, 1.30, 2.8],
    [-29.5, -20.5, 1.32, 0.9],
    [-21.5, 30.5, 1.34, 2.2],
    [10.2, 27.5, 1.36, 1.1],
    [22.0, 31.8, 1.28, 3.4],
    [48.5, -2.5, 1.32, 0.6],
    [6.0, -40.5, 1.38, 1.8],
    [31.5, -36.5, 1.34, 2.6],
    // Cozy roadside & meadow accents (clear of dirt road & Patintero court!)
    [-33.5, 22.5, 1.28, 1.3],
    [-12.5, 9.5, 1.22, 2.4],
    [8.5, 3.5, 1.26, 0.7],
    [34.5, 15.5, 1.28, 3.1],
    [58.5, 16.5, 1.32, 1.7],
];

function generatePinoyBarrioFoliage() {
    const trees = [];
    const bananas = [];
    const grassTufts = [];
    const fences = [];
    const flowers = [];

    const curve = createWorldCurve();
    const pathPts = curve.getSpacedPoints(240);
    const finishPt = curve.getPointAt(FINISH_ARCH_T);
    const bridgeZ = riverCenterZ(BRIDGE_X);

    const isClear = (x, z, landmarkPad, pathPad) => {
        if (Math.abs(z - riverCenterZ(x)) < 4.5 * S) return false;
        if (Math.hypot(x - BRIDGE_X, z - bridgeZ) < 13.5) return false;
        if (Math.hypot(x - finishPt.x, z - finishPt.z) < 8.5) return false;
        if (Math.hypot(x - PAHINGAHAN_ZONE.x, z - PAHINGAHAN_ZONE.z) < PAHINGAHAN_ZONE.clearRadius + landmarkPad * 0.35) {
            return false;
        }
        // Keep camera sightline in front of Pahingahan open and clean
        if (Math.hypot(x - (PAHINGAHAN_ZONE.x - 5.5), z - (PAHINGAHAN_ZONE.z + 13.5)) < 7.0) {
            return false;
        }

        if (Math.hypot(x - PATINTERO_ZONE.x, z - PATINTERO_ZONE.z) < PATINTERO_ZONE.clearRadius + landmarkPad * 0.3) {
            return false;
        }
        if (Math.hypot(x - RIVER_FISHERMAN.x, z - RIVER_FISHERMAN.z) < 6.0) return false;
        if (Math.hypot(x - RIVER_WASHER.x, z - RIVER_WASHER.z) < 6.0) return false;

        for (let m = 1; m <= 5; m++) {
            const s = MAP_NODE_STOPS[m];
            if (Math.hypot(x - s.x, z - s.z) < PLAZA_RADIUS + landmarkPad) return false;
        }
        for (const st of BARRIO_TINDAHANS) {
            if (Math.hypot(x - st.x, z - st.z) < 6.8 + landmarkPad * 0.35) return false;
        }
        for (const kb of BARRIO_KUBOS) {
            if (Math.hypot(x - kb.x, z - kb.z) < 6.2 + landmarkPad * 0.3) return false;
        }
        for (const dg of BARRIO_ASKALS) {
            if (Math.hypot(x - dg.x, z - dg.z) < 3.2) return false;
        }
        for (const p of pathPts) {
            if (Math.hypot(x - p.x, z - p.z) < pathPad) return false;
        }
        return true;
    };

    // 1. Add all curated hero Branched Acacia trees first (so even lowQuality mobile always sees lush central trees!)
    for (const [x, z, scale, rot] of CURATED_ACACIAS) {
        trees.push({ x, y: getTerrainHeight(x, z), z, scale, rot });
    }

    // 2. Add all curated hero Pinoy Banana trees first!
    for (const [x, z, scale, rot] of CURATED_BANANAS) {
        bananas.push({ x, y: getTerrainHeight(x, z), z, scale, rot });
    }

    let seed = 209;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };

    // 3. Natural surrounding hillside Acacia trees (keeps spacing clean from curated trees)
    for (let i = 0; i < 420 && trees.length < 78; i++) {
        const x = (rand() - 0.5) * 90 * S;
        const z = (rand() - 0.5) * 74 * S;
        if (isClear(x, z, 3.8, 5.2) && trees.every((t) => Math.hypot(t.x - x, t.z - z) > 8.5)) {
            trees.push({ x, y: getTerrainHeight(x, z), z, scale: 1.50 + rand() * 0.72, rot: rand() * Math.PI * 2 });
        }
    }

    // 4. Extra natural banana clumps along outer riverbanks & meadows
    for (let i = 0; i < 200 && bananas.length < 40; i++) {
        const x = (rand() - 0.5) * 78 * S;
        const z = (rand() - 0.5) * 62 * S;
        if (isClear(x, z, 2.0, 4.4) && bananas.every((b) => Math.hypot(b.x - x, b.z - z) > 6.5)) {
            bananas.push({ x, y: getTerrainHeight(x, z), z, scale: 1.15 + rand() * 0.42, rot: rand() * Math.PI * 2 });
        }
    }

    // 5. Pinoy Meadow Grass Tufts (Talahib / tropical grass blades)
    for (let i = 0; i < 900 && grassTufts.length < 220; i++) {
        const x = (rand() - 0.5) * 84 * S;
        const z = (rand() - 0.5) * 68 * S;
        if (isClear(x, z, 0.2, 3.0)) {
            grassTufts.push({ x, y: getTerrainHeight(x, z), z, scale: 0.75 + rand() * 0.85, rot: rand() * Math.PI * 2 });
        }
    }

    // 6. Rustic Split-Bamboo Village Fences (Bakod)
    const fenceLines = [
        { x0: -52, z0: 14, dx: 2.8, dz: -0.9, count: 3 },
        { x0: -38, z0: 27, dx: 2.8, dz: -0.4, count: 4 },
        { x0: -12, z0: 29, dx: 2.8, dz: 0.2, count: 4 },
        { x0: 36, z0: -3, dx: 2.7, dz: 0.7, count: 3 },
        { x0: 54, z0: 12, dx: 2.5, dz: -1.1, count: 3 },
    ];
    for (const fl of fenceLines) {
        const yaw = Math.atan2(-fl.dz, fl.dx);
        for (let k = 0; k < fl.count; k++) {
            const fx = fl.x0 + fl.dx * k;
            const fz = fl.z0 + fl.dz * k;
            fences.push({ x: fx, y: getTerrainHeight(fx, fz), z: fz, yaw });
        }
    }

    // 7. Meadow Wildflowers
    for (let i = 0; i < 320 && flowers.length < 100; i++) {
        const x = (rand() - 0.5) * 74 * S;
        const z = (rand() - 0.5) * 60 * S;
        if (isClear(x, z, 0.4, 2.9)) {
            flowers.push({ x, y: getTerrainHeight(x, z) + 0.14, z, colorIdx: i % 3 });
        }
    }

    return { trees, bananas, grassTufts, fences, flowers };
}

function createGrassTuftGeo() {
    const positions = [];
    const normals = [];
    const indices = [];
    const bladeCount = 5;

    for (let b = 0; b < bladeCount; b++) {
        const ang = (b / bladeCount) * Math.PI * 2 + 0.3;
        const tilt = 0.34 + (b % 2) * 0.16;
        const h = 0.78 + (b % 3) * 0.22;
        const w = 0.15;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const px = -sin * w;
        const pz = cos * w;
        const tipX = cos * h * tilt;
        const tipZ = sin * h * tilt;

        const base = b * 3;
        positions.push(-px, 0, -pz, px, 0, pz, tipX, h, tipZ);
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    return geo;
}

const CLOUD_CLUSTERS = [
    { x: -34, y: 20, z: -26, scale: 1.65 },
    { x: -12, y: 22, z: -30, scale: 1.85 },
    { x: 12, y: 21, z: -26, scale: 1.60 },
    { x: 36, y: 23, z: -22, scale: 1.80 },
    { x: -22, y: 20.5, z: 18, scale: 1.45 },
    { x: 20, y: 21, z: 22, scale: 1.50 },
    { x: 44, y: 20, z: 4, scale: 1.60 },
].map((c) => ({ x: c.x * S, y: c.y * 1.6, z: c.z * S, scale: c.scale * 1.95 }));

class TreeErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

function createFadedTreeMaterial(baseMaterial) {
    const mat = baseMaterial.clone();
    mat.transparent = true;
    mat.opacity = 1;
    mat.depthWrite = false;
    // FrontSide avoids double-blending overlapping leaf lobes, keeping occluding trees crystal clear
    mat.side = THREE.FrontSide;
    mat.customProgramCacheKey = () => 'juanquest_tree_fade_v2';
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
attribute float aOpacity;
varying float vOpacity;`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vOpacity = aOpacity;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
varying float vOpacity;`
            )
            .replace(
                '#include <color_fragment>',
                `#include <color_fragment>
diffuseColor.a *= vOpacity;`
            );
    };
    mat.needsUpdate = true;
    return mat;
}

/**
 * Checks whether a tree's canopy or trunk sphere blocks the sight line from camera (A) to character (B),
 * or sits directly over the camera lens. Returns:
 *   0 = clear (solid 1.0)
 *   1 = between camera and character (ultra-sheer 0.06)
 *   2 = camera inside/right against foliage (near-invisible 0.025)
 */
function sphereBlockLevel(ax, ay, az, abx, aby, abz, lenSq, px, py, pz, radius) {
    const dxA = px - ax;
    const dyA = py - ay;
    const dzA = pz - az;
    const distASq = dxA * dxA + dyA * dyA + dzA * dzA;
    const nearCamR = radius + 2.3;
    if (distASq < nearCamR * nearCamR) {
        return 2;
    }

    const t = (dxA * abx + dyA * aby + dzA * abz) / lenSq;
    if (t < -0.05 || t > 0.96) return 0;

    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + tc * abx;
    const cy = ay + tc * aby;
    const cz = az + tc * abz;

    const ddx = px - cx;
    const ddy = py - cy;
    const ddz = pz - cz;
    const effR = radius + 0.95;
    return ddx * ddx + ddy * ddy + ddz * ddz < effR * effR ? 1 : 0;
}

/**
 * Dual-Pass GPU-Instanced Tree Species with Smooth Per-Tree Camera Occlusion Fade:
 * - All clear trees stay in the opaque, shadow-casting InstancedMesh (zero alpha-sorting issues!).
 * - ONLY the exact tree(s) blocking camera <-> character smoothly fade to 0.22 opacity in a secondary pass.
 * - Zero extra draw calls when no tree is blocking; zero GPU buffer uploads when stationary!
 */
function OccludableTreeSpecies({
    parts,
    items,
    activeCount,
    castShadow,
    varyY = false,
    canopyY,
    canopyRadius,
    trunkY,
    trunkRadius,
    playerPosRef,
    tourActive,
}) {
    const opaqueRefs = useRef([]);
    const fadedRefs = useRef([]);
    const opacitiesRef = useRef(null);
    if (!opacitiesRef.current || opacitiesRef.current.length !== items.length) {
        opacitiesRef.current = new Float32Array(items.length).fill(1);
    }

    // Precompute each tree's exact world transform matrix once
    const { baseMatrices, treeScalesY } = useMemo(() => {
        const dummy = new THREE.Object3D();
        const mats = new Array(items.length);
        const sys = new Float32Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const { x, y, z, scale, rot } = items[i];
            const sy = varyY ? scale * (0.94 + (i % 3) * 0.06) : scale;
            sys[i] = sy;
            dummy.position.set(x, y, z);
            dummy.scale.set(scale, sy, scale);
            dummy.rotation.set(0, rot, 0);
            dummy.updateMatrix();
            mats[i] = dummy.matrix.clone();
        }
        return { baseMatrices: mats, treeScalesY: sys };
    }, [items, varyY]);

    // Clone geometry wrapper (shares vertex buffers!) + per-instance opacity attribute + faded material
    const fadedParts = useMemo(() => {
        return parts.map((p) => {
            const geo = p.geometry.clone();
            const opacityArr = new Float32Array(items.length).fill(1);
            const attr = new THREE.InstancedBufferAttribute(opacityArr, 1);
            attr.setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute('aOpacity', attr);
            const mat = createFadedTreeMaterial(p.material);
            return { geometry: geo, material: mat, opacityAttr: attr };
        });
    }, [parts, items.length]);

    useEffect(() => {
        return () => {
            fadedParts.forEach((fp) => {
                fp.geometry.dispose();
                fp.material.dispose();
            });
        };
    }, [fadedParts]);

    // Initialize opaque matrices & hide faded slots on mount or quality change
    useLayoutEffect(() => {
        const opacities = opacitiesRef.current;
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
            const opMesh = opaqueRefs.current[pIdx];
            const fdMesh = fadedRefs.current[pIdx];
            const attr = fadedParts[pIdx]?.opacityAttr;
            if (!opMesh || !fdMesh || !attr) continue;

            let anyFaded = false;
            for (let i = 0; i < items.length; i++) {
                const isFaded = i < activeCount && opacities[i] < 0.992;
                if (isFaded) {
                    anyFaded = true;
                    opMesh.setMatrixAt(i, ZERO_MATRIX);
                    fdMesh.setMatrixAt(i, baseMatrices[i]);
                    attr.setX(i, opacities[i]);
                } else {
                    opMesh.setMatrixAt(i, baseMatrices[i]);
                    fdMesh.setMatrixAt(i, ZERO_MATRIX);
                    attr.setX(i, 1);
                }
            }
            opMesh.count = activeCount;
            fdMesh.count = activeCount;
            fdMesh.visible = anyFaded;
            opMesh.instanceMatrix.needsUpdate = true;
            fdMesh.instanceMatrix.needsUpdate = true;
            attr.needsUpdate = true;
        }
    }, [parts, fadedParts, items, activeCount, baseMatrices]);

    useFrame(({ camera }, delta) => {
        const opacities = opacitiesRef.current;
        const playerPos = playerPosRef?.current;
        const dt = Math.min(delta, 0.05);
        const lerpAlpha = Math.min(1, dt * 10.5);

        let checkSight = false;
        let ax = 0, ay = 0, az = 0, abx = 0, aby = 0, abz = 0, lenSq = 0;

        if (!tourActive && playerPos) {
            ax = camera.position.x;
            ay = camera.position.y;
            az = camera.position.z;
            abx = playerPos.x - ax;
            aby = playerPos.y + 1.45 - ay;
            abz = playerPos.z - az;
            lenSq = abx * abx + aby * aby + abz * abz;
            checkSight = lenSq > 0.25;
        }

        let dirty = false;
        let anyFaded = false;

        for (let i = 0; i < activeCount; i++) {
            let blockLevel = 0;
            if (checkSight) {
                const t = items[i];
                const sy = treeScalesY[i];
                const cLvl = sphereBlockLevel(
                    ax, ay, az, abx, aby, abz, lenSq,
                    t.x, t.y + canopyY * sy, t.z, canopyRadius * t.scale
                );
                const tLvl = sphereBlockLevel(
                    ax, ay, az, abx, aby, abz, lenSq,
                    t.x, t.y + trunkY * sy, t.z, trunkRadius * t.scale
                );
                blockLevel = cLvl > tLvl ? cLvl : tLvl;
            }

            const target = blockLevel === 2 ? 0.025 : blockLevel === 1 ? 0.06 : 1.0;
            const prev = opacities[i];
            let next = prev + (target - prev) * lerpAlpha;
            if (next > 0.992 && target === 1.0) next = 1.0;
            else if (Math.abs(next - target) < 0.003) next = target;

            if (next !== prev) {
                opacities[i] = next;
                dirty = true;
            }
            if (next < 0.992) {
                anyFaded = true;
            }
        }

        if (!dirty) return;

        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
            const opMesh = opaqueRefs.current[pIdx];
            const fdMesh = fadedRefs.current[pIdx];
            const attr = fadedParts[pIdx]?.opacityAttr;
            if (!opMesh || !fdMesh || !attr) continue;

            for (let i = 0; i < activeCount; i++) {
                const op = opacities[i];
                if (op < 0.992) {
                    opMesh.setMatrixAt(i, ZERO_MATRIX);
                    fdMesh.setMatrixAt(i, baseMatrices[i]);
                    attr.setX(i, op);
                } else {
                    opMesh.setMatrixAt(i, baseMatrices[i]);
                    fdMesh.setMatrixAt(i, ZERO_MATRIX);
                    attr.setX(i, 1);
                }
            }
            fdMesh.visible = anyFaded;
            opMesh.instanceMatrix.needsUpdate = true;
            fdMesh.instanceMatrix.needsUpdate = true;
            attr.needsUpdate = true;
        }
    });

    return (
        <group>
            {parts.map((m, idx) => (
                <React.Fragment key={idx}>
                    <instancedMesh
                        ref={(el) => {
                            opaqueRefs.current[idx] = el;
                        }}
                        args={[m.geometry, m.material, items.length]}
                        dispose={null}
                        frustumCulled={false}
                        castShadow={castShadow}
                        receiveShadow
                    />
                    <instancedMesh
                        ref={(el) => {
                            fadedRefs.current[idx] = el;
                        }}
                        args={[fadedParts[idx].geometry, fadedParts[idx].material, items.length]}
                        frustumCulled={false}
                        renderOrder={4}
                        visible={false}
                    />
                </React.Fragment>
            ))}
        </group>
    );
}

/** GPU-Instanced Sculpted Branched Acacia Trees & Realistic Pinoy Banana Trees with Camera Occlusion Fade */
function InstancedSculptedTrees({ trees, bananas, lowQuality, playerPosRef, tourActive }) {
    const acacia = useGLTF('/models/tree_acacia.glb', '/draco/');
    const banana = useGLTF('/models/tree_banana.glb', '/draco/');

    const treeCount = lowQuality ? Math.min(28, trees.length) : trees.length;
    const bananaCount = lowQuality ? Math.min(14, bananas.length) : bananas.length;

    const acaciaParts = useMemo(() => {
        const list = [];
        acacia.scene.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                list.push({ geometry: child.geometry, material: child.material });
            }
        });
        return list;
    }, [acacia.scene]);

    const bananaParts = useMemo(() => {
        const list = [];
        banana.scene.traverse((child) => {
            if (child.isMesh && child.geometry && child.material) {
                if (child.name.includes('Leaves')) child.material.side = THREE.DoubleSide;
                list.push({ geometry: child.geometry, material: child.material });
            }
        });
        return list;
    }, [banana.scene]);

    return (
        <group>
            <OccludableTreeSpecies
                parts={acaciaParts}
                items={trees}
                activeCount={treeCount}
                castShadow={!lowQuality}
                varyY
                canopyY={3.95}
                canopyRadius={3.05}
                trunkY={1.75}
                trunkRadius={1.45}
                playerPosRef={playerPosRef}
                tourActive={tourActive}
            />
            <OccludableTreeSpecies
                parts={bananaParts}
                items={bananas}
                activeCount={bananaCount}
                castShadow={!lowQuality}
                canopyY={3.25}
                canopyRadius={2.6}
                trunkY={1.25}
                trunkRadius={0.85}
                playerPosRef={playerPosRef}
                tourActive={tourActive}
            />
        </group>
    );
}

const CLOUD_PUFFS = [
    { ox: 0, oy: 0.24, oz: 0, r: 1.35, color: new THREE.Color('#FFFDF5') },
    { ox: -1.18, oy: -0.08, oz: 0.14, r: 0.96, color: new THREE.Color('#FAF8F0') },
    { ox: 1.22, oy: -0.1, oz: -0.1, r: 1.02, color: new THREE.Color('#FAF8F0') },
    { ox: 0.25, oy: -0.22, oz: 0.72, r: 0.82, color: new THREE.Color('#F1F5F9') },
];

export default function EnvironmentInstanced({ lowQuality, playerPosRef, tourActive = false }) {
    const grassRef = useRef();
    const fencePostRef = useRef();
    const fenceRailRef = useRef();
    const flowerRef = useRef();
    const cloudsMeshRef = useRef();

    const { trees, bananas, grassTufts, fences, flowers } = useMemo(() => generatePinoyBarrioFoliage(), []);
    const grassGeo = useMemo(() => createGrassTuftGeo(), []);

    useEffect(() => () => grassGeo.dispose(), [grassGeo]);

    const grassCount = lowQuality ? Math.min(45, grassTufts.length) : grassTufts.length;
    const fenceCount = fences.length;
    const flowerCount = lowQuality ? 0 : flowers.length;
    const cloudList = useMemo(() => (lowQuality ? CLOUD_CLUSTERS.slice(0, 3) : CLOUD_CLUSTERS), [lowQuality]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useLayoutEffect(() => {
        if (grassRef.current) {
            const greens = [new THREE.Color('#4EA832'), new THREE.Color('#69BE3A'), new THREE.Color('#3D8B2A')];
            for (let i = 0; i < grassTufts.length; i++) {
                const { x, y, z, scale, rot } = grassTufts[i];
                dummy.position.set(x, y - 0.04, z);
                dummy.scale.set(scale * 1.2, scale * 1.15, scale * 1.2);
                dummy.rotation.set(0, rot, 0);
                dummy.updateMatrix();
                grassRef.current.setMatrixAt(i, dummy.matrix);
                grassRef.current.setColorAt(i, greens[i % greens.length]);
            }
            grassRef.current.count = grassCount;
            grassRef.current.instanceMatrix.needsUpdate = true;
            if (grassRef.current.instanceColor) grassRef.current.instanceColor.needsUpdate = true;
        }

        if (fencePostRef.current && fenceRailRef.current) {
            for (let i = 0; i < fences.length; i++) {
                const { x, y, z, yaw } = fences[i];
                dummy.position.set(x, y + 0.55, z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, yaw, 0);
                dummy.updateMatrix();
                fencePostRef.current.setMatrixAt(i, dummy.matrix);

                dummy.position.set(x, y + 0.82, z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, yaw, Math.PI / 2);
                dummy.updateMatrix();
                fenceRailRef.current.setMatrixAt(i, dummy.matrix);
            }
            fencePostRef.current.count = fenceCount;
            fenceRailRef.current.count = fenceCount;
            fencePostRef.current.instanceMatrix.needsUpdate = true;
            fenceRailRef.current.instanceMatrix.needsUpdate = true;
        }

        if (flowerRef.current) {
            const palette = [new THREE.Color('#FACC15'), new THREE.Color('#FFFBEB'), new THREE.Color('#FB7185')];
            for (let i = 0; i < flowers.length; i++) {
                const { x, y, z, colorIdx } = flowers[i];
                dummy.position.set(x, y, z);
                dummy.scale.set(0.24, 0.24, 0.24);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                flowerRef.current.setMatrixAt(i, dummy.matrix);
                flowerRef.current.setColorAt(i, palette[colorIdx]);
            }
            flowerRef.current.count = flowerCount;
            flowerRef.current.instanceMatrix.needsUpdate = true;
            if (flowerRef.current.instanceColor) flowerRef.current.instanceColor.needsUpdate = true;
        }

        if (cloudsMeshRef.current) {
            let slot = 0;
            for (let i = 0; i < cloudList.length; i += 1) {
                const c = cloudList[i];
                for (let p = 0; p < CLOUD_PUFFS.length; p += 1) {
                    const puff = CLOUD_PUFFS[p];
                    dummy.position.set(c.x + puff.ox * c.scale, c.y + puff.oy * c.scale, c.z + puff.oz * c.scale);
                    const s = puff.r * c.scale;
                    dummy.scale.set(s, s, s);
                    dummy.rotation.set(0, 0, 0);
                    dummy.updateMatrix();
                    cloudsMeshRef.current.setMatrixAt(slot, dummy.matrix);
                    cloudsMeshRef.current.setColorAt(slot, puff.color);
                    slot += 1;
                }
            }
            cloudsMeshRef.current.count = slot;
            cloudsMeshRef.current.instanceMatrix.needsUpdate = true;
            if (cloudsMeshRef.current.instanceColor) cloudsMeshRef.current.instanceColor.needsUpdate = true;
        }
    }, [grassCount, fenceCount, flowerCount, grassTufts, fences, flowers, cloudList, dummy]);

    useFrame(({ clock }) => {
        if (lowQuality || !cloudsMeshRef.current) return;
        const t = clock.getElapsedTime();
        const span = 112 * S;
        let slot = 0;
        for (let i = 0; i < cloudList.length; i += 1) {
            const c = cloudList[i];
            const cx = ((((c.x + t * 0.65 + span / 2) % span) + span) % span) - span / 2;
            const cy = c.y + Math.sin(t * 0.5 + i) * 0.22;
            for (let p = 0; p < CLOUD_PUFFS.length; p += 1) {
                const puff = CLOUD_PUFFS[p];
                dummy.position.set(cx + puff.ox * c.scale, cy + puff.oy * c.scale, c.z + puff.oz * c.scale);
                const s = puff.r * c.scale;
                dummy.scale.set(s, s, s);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                cloudsMeshRef.current.setMatrixAt(slot, dummy.matrix);
                slot += 1;
            }
        }
        cloudsMeshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            {/* Sculpted Branched Acacia Trees & Realistic Pinoy Banana Trees (GPU-Instanced!) */}
            <TreeErrorBoundary>
                <Suspense fallback={null}>
                    <InstancedSculptedTrees
                        trees={trees}
                        bananas={bananas}
                        lowQuality={lowQuality}
                        playerPosRef={playerPosRef}
                        tourActive={tourActive}
                    />
                </Suspense>
            </TreeErrorBoundary>

            {/* Pinoy Meadow Grass Tufts */}
            <instancedMesh ref={grassRef} args={[grassGeo, null, grassTufts.length]} frustumCulled={false}>
                <meshStandardMaterial roughness={0.88} side={THREE.DoubleSide} />
            </instancedMesh>

            {/* Rustic Split-Bamboo Village Fences */}
            <instancedMesh ref={fencePostRef} args={[null, null, fences.length]} frustumCulled={false} castShadow={!lowQuality}>
                <cylinderGeometry args={[0.09, 0.10, 1.8, 6]} />
                <meshStandardMaterial color="#A67B42" roughness={0.85} />
            </instancedMesh>
            <instancedMesh ref={fenceRailRef} args={[null, null, fences.length]} frustumCulled={false} castShadow={!lowQuality}>
                <cylinderGeometry args={[0.07, 0.07, 2.95, 6]} />
                <meshStandardMaterial color="#C29656" roughness={0.82} />
            </instancedMesh>

            {/* Meadow Wildflowers */}
            {flowerCount > 0 && (
                <instancedMesh ref={flowerRef} args={[null, null, flowers.length]} frustumCulled={false}>
                    <sphereGeometry args={[1, 6, 6]} />
                    <meshStandardMaterial roughness={0.65} />
                </instancedMesh>
            )}

            {/* Warm Fluffy Tropical Cumulus Clouds (GPU-Instanced: 28 draw calls -> 1!) */}
            <instancedMesh
                ref={cloudsMeshRef}
                args={[null, null, CLOUD_CLUSTERS.length * CLOUD_PUFFS.length]}
                frustumCulled={false}
            >
                <sphereGeometry args={[1, 10, 8]} />
                <meshStandardMaterial color="#FFFFFF" roughness={0.93} />
            </instancedMesh>
        </group>
    );
}
