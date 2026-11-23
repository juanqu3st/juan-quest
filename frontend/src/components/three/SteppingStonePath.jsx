import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTerrainHeight } from './worldConfig';
import { getPbrTextures } from './pbrTextures';

/**
 * Builds a terrain-hugging curved Pinoy dirt road ribbon (lupa) with a gentle crown
 * and feathered grass-edge UVs so it blends seamlessly into the rolling meadows!
 */
function buildDirtTrailRibbon(curve) {
    const steps = 180;
    const positions = [];
    const uvs = [];
    const indices = [];

    const pts = curve.getSpacedPoints(steps);
    const totalLen = curve.getLength();
    let distAcc = 0;

    for (let i = 0; i <= steps; i++) {
        const p = pts[i];
        if (i > 0) distAcc += p.distanceTo(pts[i - 1]);
        const u = distAcc / totalLen;

        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(steps, i + 1)];
        const dx = next.x - prev.x;
        const dz = next.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        // Local right normal in XZ
        const nx = -dz / len;
        const nz = dx / len;

        // Organic natural dirt footpath width (slight gentle winding variation)
        const halfW = 2.45 + Math.sin(u * Math.PI * 14) * 0.25;

        const lx = p.x - nx * halfW;
        const lz = p.z - nz * halfW;
        const rx = p.x + nx * halfW;
        const rz = p.z + nz * halfW;

        const ly = getTerrainHeight(lx, lz) + 0.11;
        const cy = getTerrainHeight(p.x, p.z) + 0.17;
        const ry = getTerrainHeight(rx, rz) + 0.11;

        positions.push(lx, ly, lz);
        uvs.push(u, 0.0);

        positions.push(p.x, cy, p.z);
        uvs.push(u, 0.5);

        positions.push(rx, ry, rz);
        uvs.push(u, 1.0);

        if (i < steps) {
            const b = i * 3;
            // Left strip (b, b+1, b+3) and (b+1, b+4, b+3)
            indices.push(b, b + 1, b + 3);
            indices.push(b + 1, b + 4, b + 3);
            // Right strip (b+1, b+2, b+4) and (b+2, b+5, b+4)
            indices.push(b + 1, b + 2, b + 4);
            indices.push(b + 2, b + 5, b + 4);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

export default function SteppingStonePath({ curve, maps = [], lowQuality = false }) {
    const { dirtMap, dirtBump } = useMemo(() => getPbrTextures(), []);
    const roadGeo = useMemo(() => buildDirtTrailRibbon(curve), [curve]);

    useEffect(() => () => roadGeo.dispose(), [roadGeo]);

    const finishTransform = useMemo(() => {
        const p = curve.getPointAt(1);
        const tan = curve.getTangentAt(0.99);
        const yaw = Math.atan2(tan.x, tan.z);
        return {
            position: [p.x, getTerrainHeight(p.x, p.z), p.z],
            yaw,
        };
    }, [curve]);

    const allDone = maps.length > 0 && maps.every((m) => m.progress?.is_completed);

    return (
        <group>
            {/* Natural Winding Pinoy Dirt Path (Lupa) — No Numbered Stepping Stones */}
            <mesh geometry={roadGeo} receiveShadow>
                <meshStandardMaterial
                    map={dirtMap}
                    bumpMap={dirtBump}
                    bumpScale={0.08}
                    roughness={0.94}
                    transparent
                    depthWrite={false}
                    polygonOffset
                    polygonOffsetFactor={-2}
                />
            </mesh>

            {/* Pinoy Bamboo Finish Arch with Fiesta Banderitas after Mapa 5 */}
            <PinoyFinishArch
                position={finishTransform.position}
                yaw={finishTransform.yaw}
                done={allDone}
                lowQuality={lowQuality}
            />
        </group>
    );
}

const BANDERITA_COLORS = ['#EF4444', '#FACC15', '#2563EB', '#22C55E', '#F97316', '#EC4899'];

function PinoyFinishArch({ position, yaw, done, lowQuality }) {
    const bannerGroupRef = useRef();

    const signTex = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = done ? '#15803D' : '#9A3412';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, 496, 112);
        ctx.fillStyle = '#FFFBEB';
        ctx.font = '800 56px Inter, "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(done ? 'TAGUMPAY!' : 'DULO NG LAKBAY', 256, 66);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, [done]);

    useEffect(() => () => signTex.dispose(), [signTex]);

    useFrame(({ clock }) => {
        if (!bannerGroupRef.current || lowQuality) return;
        const t = clock.getElapsedTime();
        bannerGroupRef.current.children.forEach((flag, idx) => {
            flag.rotation.x = Math.sin(t * 3.8 + idx * 0.7) * 0.22;
        });
    });

    const flags = useMemo(() => {
        const arr = [];
        const count = 9;
        for (let i = 0; i < count; i++) {
            const frac = (i + 0.5) / count;
            const x = -2.6 + frac * 5.2;
            const sag = Math.sin(frac * Math.PI) * 0.42;
            arr.push({ x, y: 4.55 - sag, color: BANDERITA_COLORS[i % BANDERITA_COLORS.length] });
        }
        return arr;
    }, []);

    return (
        <group position={position} rotation={[0, yaw, 0]}>
            {/* Twin Sturdy Double-Pole Bamboo Pillars anchored deep (-0.8) into soil */}
            {[-2.85, 2.85].map((xSide, idx) => (
                <group key={idx} position={[xSide, 0, 0]}>
                    <mesh position={[0, 2.35, -0.22]} castShadow={!lowQuality}>
                        <cylinderGeometry args={[0.14, 0.17, 6.2, 8]} />
                        <meshStandardMaterial color="#B58946" roughness={0.76} />
                    </mesh>
                    <mesh position={[0, 2.35, 0.22]} castShadow={!lowQuality}>
                        <cylinderGeometry args={[0.14, 0.17, 6.2, 8]} />
                        <meshStandardMaterial color="#C89B54" roughness={0.76} />
                    </mesh>
                    {/* Bamboo cross-rungs */}
                    {[1.4, 3.0, 4.4].map((ry) => (
                        <mesh key={ry} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.07, 0.07, 0.65, 6]} />
                            <meshStandardMaterial color="#9C7134" roughness={0.8} />
                        </mesh>
                    ))}
                </group>
            ))}

            {/* Overhead Bamboo Lintel Beams */}
            <mesh position={[0, 5.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={!lowQuality}>
                <cylinderGeometry args={[0.14, 0.14, 6.5, 8]} />
                <meshStandardMaterial color="#B58946" roughness={0.76} />
            </mesh>
            <mesh position={[0, 4.72, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={!lowQuality}>
                <cylinderGeometry args={[0.10, 0.10, 6.2, 8]} />
                <meshStandardMaterial color="#C89B54" roughness={0.76} />
            </mesh>

            {/* Traditional Mini Nipa Awning Cap on top of the Arch */}
            <mesh position={[0, 5.75, 0]} rotation={[0, Math.PI / 4, 0]} scale={[2.6, 0.72, 0.85]} castShadow={!lowQuality}>
                <coneGeometry args={[1.4, 1.35, 4]} />
                <meshStandardMaterial color="#A87A3A" roughness={0.92} />
            </mesh>

            {/* Fiesta Wooden Plaque Signboard ("TAGUMPAY!" / "DULO NG LAKBAY") */}
            <mesh position={[0, 5.12, 0.24]} castShadow={!lowQuality}>
                <boxGeometry args={[3.9, 0.96, 0.14]} />
                <meshStandardMaterial map={signTex} roughness={0.55} />
            </mesh>
            <mesh position={[0, 5.12, -0.24]} rotation={[0, Math.PI, 0]}>
                <boxGeometry args={[3.9, 0.96, 0.14]} />
                <meshStandardMaterial map={signTex} roughness={0.55} />
            </mesh>

            {/* Swooping Pinoy Fiesta Banderitas (Colorful Triangular Pennants) */}
            <group ref={bannerGroupRef}>
                {flags.map((f, idx) => (
                    <mesh key={idx} position={[f.x, f.y, 0]} rotation={[0, 0, Math.PI]}>
                        <coneGeometry args={[0.24, 0.56, 3]} />
                        <meshStandardMaterial
                            color={f.color}
                            emissive={done ? f.color : '#000000'}
                            emissiveIntensity={done ? 0.35 : 0}
                            roughness={0.55}
                        />
                    </mesh>
                ))}
            </group>
        </group>
    );
}
