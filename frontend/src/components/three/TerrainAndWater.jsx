import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    BRIDGE_X,
    getTerrainHeight,
    HEIGHT_SCALE,
    MAP_NODE_STOPS,
    PATINTERO_ZONE,
    riverCenterZ,
    WORLD_SCALE,
} from './worldConfig';
import { getPbrTextures } from './pbrTextures';

function bakeTransformedPart(rawGeo, position, rotation = [0, 0, 0]) {
    const g = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    rawGeo.dispose();
    const mat = new THREE.Matrix4().compose(
        new THREE.Vector3(position[0], position[1], position[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ')),
        new THREE.Vector3(1, 1, 1)
    );
    g.applyMatrix4(mat);
    return g;
}

function mergeAndDispose(parts) {
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
}

const S = WORLD_SCALE;
const WATER_Y = -0.32 * HEIGHT_SCALE;

function createMountainRings() {
    const innerPeaks = [];
    const outerPeaks = [];

    for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const rx = (64 + Math.sin(i * 3.1) * 5.0) * S;
        const rz = (55 + Math.cos(i * 2.7) * 5.0) * S;
        innerPeaks.push({
            x: Math.cos(angle) * rx,
            z: Math.sin(angle) * rz,
            radius: (13.0 + (i % 4) * 3.0) * S,
            height: (11.5 + ((i * 7) % 5) * 2.8) * S,
            rot: i * 0.7,
        });
    }

    for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2 + 0.11;
        const rx = (86 + Math.cos(i * 2.3) * 6.0) * S;
        const rz = (76 + Math.sin(i * 1.9) * 6.0) * S;
        outerPeaks.push({
            x: Math.cos(angle) * rx,
            z: Math.sin(angle) * rz,
            radius: (17.5 + (i % 5) * 3.6) * S,
            height: (23 + ((i * 5) % 6) * 3.8) * S,
            rot: i * 1.1,
        });
    }

    return { innerPeaks, outerPeaks };
}

/**
 * Builds a clean flat UV-mapped curved ribbon mesh following riverCenterZ(x)
 * so scrolling waterFlowMap.offset.x creates authentic downstream water current!
 */
function buildFlowingRiverRibbon() {
    const steps = 120;
    const halfWidth = 3.25 * S;
    const xStart = -76 * S;
    const xEnd = 76 * S;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const x = xStart + (xEnd - xStart) * f;
        const z = riverCenterZ(x);
        // Compute local perpendicular normal to river curve so width stays uniform
        const dz = (riverCenterZ(x + 0.5) - riverCenterZ(x - 0.5)) / 1.0;
        const len = Math.hypot(1, dz);
        const nx = -dz / len;
        const nz = 1 / len;

        // Left bank vertex (v = 0) & Right bank vertex (v = 1)
        positions.push(x - nx * halfWidth, 0, z - nz * halfWidth);
        uvs.push(f, 0);

        positions.push(x + nx * halfWidth, 0, z + nz * halfWidth);
        uvs.push(f, 1);

        if (i < steps) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

export default function TerrainAndWater({ lowQuality }) {
    const waterRef = useRef();
    const riverRocksRef = useRef();
    const innerPeaksRef = useRef();
    const outerPeaksRef = useRef();
    const { grassMap, grassBump, stoneMap, stoneBump, woodMap, waterFlowMap, waterBump } = useMemo(
        () => getPbrTextures(),
        []
    );

    const terrainGeo = useMemo(() => {
        const segX = lowQuality ? 104 : 180;
        const segZ = lowQuality ? 88 : 156;
        const geo = new THREE.PlaneGeometry(164 * S, 140 * S, segX, segZ);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const col = new THREE.Color();

        const colGrassLow = new THREE.Color('#6BB536');
        const colGrassHigh = new THREE.Color('#80C942');
        const colHill = new THREE.Color('#51982E');
        const colBank = new THREE.Color('#C8A26A');
        const colBankEdge = new THREE.Color('#86B046');
        const colEarth = new THREE.Color('#BC935A');

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = getTerrainHeight(x, z);
            pos.setY(i, y);

            const distRiver = Math.abs(z - riverCenterZ(x)) / S;
            if (distRiver < 3.6) {
                col.copy(colBank);
            } else if (distRiver < 4.9) {
                col.copy(colBankEdge);
            } else if (y > 2.4 * HEIGHT_SCALE) {
                col.copy(colHill);
            } else if (y > 0.65 * HEIGHT_SCALE) {
                col.copy(colGrassHigh);
            } else {
                col.copy(colGrassLow);
            }

            // Soft natural Pinoy packed-earth yard (bakuran) around each of the 5 map stops — no concrete slab!
            for (let m = 1; m <= 5; m++) {
                const st = MAP_NODE_STOPS[m];
                const d = Math.hypot(x - st.x, z - st.z);
                if (d < 8.6) {
                    const k = Math.max(0, Math.min(1, 1 - (d - 3.6) / 5.0));
                    col.lerp(colEarth, k * k * 0.58);
                }
            }

            // Wide sunny open dirt playground clearing (palaruan) for kids playing Patintero!
            const pd = Math.hypot(x - PATINTERO_ZONE.x, z - PATINTERO_ZONE.z);
            if (pd < 11.2) {
                const k = Math.max(0, Math.min(1, 1 - (pd - 6.0) / 5.2));
                col.lerp(colEarth, k * k * 0.72);
            }

            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
    }, [lowQuality]);

    const riverGeo = useMemo(() => buildFlowingRiverRibbon(), []);
    const { innerPeaks, outerPeaks } = useMemo(() => createMountainRings(), []);

    // Bridge placed cleanly across the river at BRIDGE_X=22 (completely clear of Mapa 3 & Mapa 4!)
    const bridgeX = BRIDGE_X;
    const bridgeZ = riverCenterZ(bridgeX);
    const riverSlope = (riverCenterZ(bridgeX + 1) - riverCenterZ(bridgeX - 1)) / 2;
    const bridgeYaw = -Math.atan2(riverSlope, 1);
    const halfSpan = 8.4;

    // Grounded riverside rocks for natural shore transition (keeping bridge zone clear)
    const riverRocks = useMemo(() => {
        const arr = [];
        for (let i = -8; i <= 8; i++) {
            const rx = i * 11;
            if (Math.abs(rx - bridgeX) < 12) continue;
            const side = i % 2 === 0 ? 1 : -1;
            const rz = riverCenterZ(rx) + side * (3.1 * S);
            arr.push({ x: rx, y: getTerrainHeight(rx, rz), z: rz, s: 0.65 + (Math.abs(i * 3) % 4) * 0.22 });
        }
        return arr;
    }, []);

    useEffect(() => {
        return () => {
            terrainGeo.dispose();
            riverGeo.dispose();
        };
    }, [terrainGeo, riverGeo]);

    // Smooth continuous downstream water flow animation (even on balanced & low quality!)
    useFrame(({ clock }, delta) => {
        const dt = Math.min(delta, 0.05);
        waterFlowMap.offset.x -= dt * 0.24;
        if (!lowQuality) {
            waterBump.offset.x -= dt * 0.38;
            waterBump.offset.y = Math.sin(clock.getElapsedTime() * 0.9) * 0.04;
            if (waterRef.current) {
                waterRef.current.position.y = WATER_Y + Math.sin(clock.getElapsedTime() * 1.6) * 0.025;
            }
        }
    });

    // Exact terrain-sampled north & south riverbank heights so both bridge abutments ground flush into the soil!
    const bankWorldPt = (zLocal) => ({
        x: bridgeX + zLocal * Math.sin(bridgeYaw),
        z: bridgeZ + zLocal * Math.cos(bridgeYaw),
    });
    const northPt = bankWorldPt(-halfSpan);
    const southPt = bankWorldPt(halfSpan);
    const yNorth = getTerrainHeight(northPt.x, northPt.z) + 0.04;
    const ySouth = getTerrainHeight(southPt.x, southPt.z) + 0.04;

    const bridgeDeckY = (zOff) => {
        const frac = (zOff + halfSpan) / (2 * halfSpan);
        const linearY = yNorth + frac * (ySouth - yNorth);
        const u = Math.min(1, Math.abs(zOff) / halfSpan);
        return linearY + Math.cos(u * Math.PI * 0.5) * 1.18;
    };
    const bridgeSlopePitch = (zOff) => {
        const dy = bridgeDeckY(zOff + 0.12) - bridgeDeckY(zOff - 0.12);
        return -Math.atan2(dy, 0.24);
    };

    // 21 tightly-spaced seamless planks (0.80 step vs 0.84 depth = zero cracks/gaps!)
    const plankOffsets = useMemo(() => {
        const arr = [];
        for (let z = -8.0; z <= 8.01; z += 0.8) arr.push(Number(z.toFixed(2)));
        return arr;
    }, []);

    // 8 continuous endpoint-to-endpoint arched segments so stringers & handrails join seamlessly with zero seams!
    const archSegments = useMemo(() => {
        const segs = [];
        const count = 8;
        const step = (halfSpan * 2) / count;
        for (let i = 0; i < count; i++) {
            const z0 = -halfSpan + i * step;
            const z1 = z0 + step;
            const y0 = bridgeDeckY(z0);
            const y1 = bridgeDeckY(z1);
            const dz = z1 - z0;
            const dy = y1 - y0;
            segs.push({
                zMid: (z0 + z1) * 0.5,
                yMid: (y0 + y1) * 0.5,
                len: Math.hypot(dz, dy) + 0.08,
                pitch: -Math.atan2(dy, dz),
            });
        }
        return segs;
    }, [yNorth, ySouth]);

    // Merge the 93 static bridge pieces into just 3 GPU draw calls (stone, dark stringers, timber deck/rails)!
    const { bridgeStoneGeo, bridgeStringerGeo, bridgeTimberGeo } = useMemo(() => {
        const stoneParts = [];
        const stringerParts = [];
        const timberParts = [];

        // Deep Grounded Stone Abutment Ramps & Entry Bollards
        [
            { zEnd: -halfSpan - 0.55, bankY: yNorth },
            { zEnd: halfSpan + 0.55, bankY: ySouth },
        ].forEach(({ zEnd, bankY }) => {
            stoneParts.push(bakeTransformedPart(new THREE.BoxGeometry(4.7, 1.55, 1.9), [0, bankY - 0.68, zEnd]));
            [-1.92, 1.92].forEach((bxOff) => {
                stoneParts.push(
                    bakeTransformedPart(new THREE.BoxGeometry(0.5, 1.32, 0.5), [bxOff, bankY + 0.56, zEnd])
                );
            });
        });

        // Twin Stone Mid-River Support Piers
        [-3.8, 3.8].forEach((zMid) => {
            const topY = bridgeDeckY(zMid) - 0.18;
            const botY = -2.2;
            const h = Math.max(0.8, topY - botY);
            [-1.55, 1.55].forEach((xPier) => {
                stoneParts.push(
                    bakeTransformedPart(new THREE.CylinderGeometry(0.36, 0.48, h, 10), [xPier, botY + h * 0.5, zMid])
                );
            });
        });

        // Twin Continuous Arched Under-Deck Timber Stringer Beams
        [-1.65, 1.65].forEach((xBeam) => {
            archSegments.forEach((seg) => {
                stringerParts.push(
                    bakeTransformedPart(
                        new THREE.BoxGeometry(0.28, 0.3, seg.len),
                        [xBeam, seg.yMid - 0.22, seg.zMid],
                        [seg.pitch, 0, 0]
                    )
                );
            });
        });

        // Seamless Arched Timber Bridge Deck Planks
        plankOffsets.forEach((zOff) => {
            timberParts.push(
                bakeTransformedPart(
                    new THREE.BoxGeometry(4.2, 0.2, 0.84),
                    [0, bridgeDeckY(zOff), zOff],
                    [bridgeSlopePitch(zOff), 0, 0]
                )
            );
        });

        // Left & Right Timber Handrails (Posts + Top Rail + Mid Safety Rail)
        [-1.92, 1.92].forEach((xSide) => {
            [-6.3, -4.2, -2.1, 0, 2.1, 4.2, 6.3].forEach((zp) => {
                timberParts.push(
                    bakeTransformedPart(new THREE.BoxGeometry(0.2, 1.32, 0.2), [xSide, bridgeDeckY(zp) + 0.62, zp])
                );
            });
            archSegments.forEach((seg) => {
                timberParts.push(
                    bakeTransformedPart(
                        new THREE.BoxGeometry(0.16, 0.14, seg.len),
                        [xSide, seg.yMid + 1.18, seg.zMid],
                        [seg.pitch, 0, 0]
                    )
                );
                timberParts.push(
                    bakeTransformedPart(
                        new THREE.BoxGeometry(0.12, 0.1, seg.len),
                        [xSide, seg.yMid + 0.64, seg.zMid],
                        [seg.pitch, 0, 0]
                    )
                );
            });
        });

        return {
            bridgeStoneGeo: mergeAndDispose(stoneParts),
            bridgeStringerGeo: mergeAndDispose(stringerParts),
            bridgeTimberGeo: mergeAndDispose(timberParts),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [archSegments, plankOffsets, yNorth, ySouth]);

    useEffect(() => {
        return () => {
            bridgeStoneGeo?.dispose();
            bridgeStringerGeo?.dispose();
            bridgeTimberGeo?.dispose();
        };
    }, [bridgeStoneGeo, bridgeStringerGeo, bridgeTimberGeo]);

    // Populate instanced matrices for riverbank stones + inner/outer mountain rings (77 draw calls -> 3!)
    useLayoutEffect(() => {
        const dummy = new THREE.Object3D();

        if (riverRocksRef.current) {
            riverRocks.forEach((rk, i) => {
                dummy.position.set(rk.x, rk.y + 0.15, rk.z);
                dummy.rotation.set(0, i * 0.6, 0);
                dummy.scale.set(rk.s * 1.3, rk.s * 0.7, rk.s);
                dummy.updateMatrix();
                riverRocksRef.current.setMatrixAt(i, dummy.matrix);
            });
            riverRocksRef.current.instanceMatrix.needsUpdate = true;
        }

        if (innerPeaksRef.current) {
            innerPeaks.forEach((p, idx) => {
                dummy.position.set(p.x, p.height * 0.42 - 1.2, p.z);
                dummy.rotation.set(0, p.rot, 0);
                dummy.scale.set(p.radius, p.height, p.radius);
                dummy.updateMatrix();
                innerPeaksRef.current.setMatrixAt(idx, dummy.matrix);
            });
            innerPeaksRef.current.instanceMatrix.needsUpdate = true;
        }

        if (outerPeaksRef.current) {
            const colA = new THREE.Color('#68A4B5');
            const colB = new THREE.Color('#7EB9C8');
            outerPeaks.forEach((p, idx) => {
                dummy.position.set(p.x, p.height * 0.45 - 2.0, p.z);
                dummy.rotation.set(0, p.rot, 0);
                dummy.scale.set(p.radius, p.height, p.radius);
                dummy.updateMatrix();
                outerPeaksRef.current.setMatrixAt(idx, dummy.matrix);
                outerPeaksRef.current.setColorAt(idx, idx % 2 === 0 ? colA : colB);
            });
            outerPeaksRef.current.instanceMatrix.needsUpdate = true;
            if (outerPeaksRef.current.instanceColor) outerPeaksRef.current.instanceColor.needsUpdate = true;
        }
    }, [riverRocks, innerPeaks, outerPeaks]);

    return (
        <group>
            {/* PBR Curved Textured Meadow Terrain */}
            <mesh geometry={terrainGeo} receiveShadow>
                <meshStandardMaterial
                    map={grassMap}
                    bumpMap={grassBump}
                    bumpScale={0.16}
                    vertexColors
                    roughness={0.88}
                    metalness={0.02}
                />
            </mesh>

            {/* Truly Flowing Animated River Surface */}
            <mesh ref={waterRef} geometry={riverGeo} position={[0, WATER_Y, 0]} receiveShadow>
                <meshStandardMaterial
                    map={waterFlowMap}
                    bumpMap={waterBump}
                    bumpScale={0.14}
                    roughness={0.12}
                    metalness={0.24}
                    transparent
                    opacity={0.95}
                />
            </mesh>

            {/* Natural Riverbank Stones (GPU-Instanced: 1 draw call!) */}
            <instancedMesh
                ref={riverRocksRef}
                args={[null, null, riverRocks.length]}
                castShadow={!lowQuality}
                frustumCulled={false}
            >
                <dodecahedronGeometry args={[0.75, 1]} />
                <meshStandardMaterial map={stoneMap} roughness={0.9} />
            </instancedMesh>

            {/* Properly Aligned & Grounded Arched Stone-and-Timber Footbridge (Merged: 3 draw calls!) */}
            <group position={[bridgeX, 0, bridgeZ]} rotation={[0, bridgeYaw, 0]}>
                {bridgeStoneGeo && (
                    <mesh geometry={bridgeStoneGeo} castShadow={!lowQuality} receiveShadow>
                        <meshStandardMaterial map={stoneMap} bumpMap={stoneBump} bumpScale={0.1} roughness={0.85} />
                    </mesh>
                )}
                {bridgeStringerGeo && (
                    <mesh geometry={bridgeStringerGeo} castShadow={!lowQuality}>
                        <meshStandardMaterial map={woodMap} color="#8B5A2B" roughness={0.78} />
                    </mesh>
                )}
                {bridgeTimberGeo && (
                    <mesh geometry={bridgeTimberGeo} castShadow={!lowQuality} receiveShadow>
                        <meshStandardMaterial map={woodMap} roughness={0.75} />
                    </mesh>
                )}
            </group>

            {/* Sculpted Lush Pinoy Foothill Ridges (GPU-Instanced: 1 draw call!) */}
            <instancedMesh
                ref={innerPeaksRef}
                args={[null, null, innerPeaks.length]}
                receiveShadow
                frustumCulled={false}
            >
                <coneGeometry args={[1, 1, 14]} />
                <meshStandardMaterial
                    map={grassMap}
                    bumpMap={grassBump}
                    bumpScale={0.14}
                    color="#4F9A3D"
                    roughness={0.92}
                />
            </instancedMesh>

            {/* Distant Atmospheric Blue-Teal Cordillera / Sierra Madre Mountain Range (GPU-Instanced: 1 draw call!) */}
            <instancedMesh
                ref={outerPeaksRef}
                args={[null, null, outerPeaks.length]}
                frustumCulled={false}
            >
                <coneGeometry args={[1, 1, 12]} />
                <meshStandardMaterial
                    bumpMap={stoneBump}
                    bumpScale={0.1}
                    color="#FFFFFF"
                    roughness={0.95}
                />
            </instancedMesh>
        </group>
    );
}
