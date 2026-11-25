import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getHammockSwingAngle, getTerrainHeight, PAHINGAHAN_ZONE } from './worldConfig';
import { getCharacterMeta } from '../../utils/characters';
import MapLabelSprite from './MapLabelSprite';
import CameraFadeGroup from './CameraFadeGroup';

useGLTF.preload('/models/kubo_bg.glb', '/draco/');
useGLTF.preload('/models/tree_acacia.glb', '/draco/');
useGLTF.preload('/models/tree_banana.glb', '/draco/');
useGLTF.preload('/models/askal_rest.glb', '/draco/');

class PahingahanErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        return this.state.hasError ? null : this.props.children;
    }
}

function ClonedModel({ url, position, yaw = 0, scale = 1, castShadow = true }) {
    const { scene } = useGLTF(url, '/draco/');
    const cloned = useMemo(() => {
        const c = scene.clone(true);
        c.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = castShadow;
                child.receiveShadow = true;
            }
        });
        return c;
    }, [scene, castShadow]);

    return (
        <group position={position} rotation={[0, yaw, 0]} scale={scale}>
            <primitive object={cloned} />
        </group>
    );
}

/**
 * Procedural Pinoy woven striped cloth texture for the Duyan (hammock) sling.
 * Warm cream abaca weave accented with terracotta, emerald, and golden fiesta bands.
 */
function createHammockTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FDF6E3';
    ctx.fillRect(0, 0, 256, 128);

    const stripes = [
        { y: 0, h: 14, color: '#C2410C' },
        { y: 18, h: 6, color: '#F59E0B' },
        { y: 30, h: 10, color: '#15803D' },
        { y: 58, h: 12, color: '#EA580C' },
        { y: 88, h: 10, color: '#15803D' },
        { y: 104, h: 6, color: '#F59E0B' },
        { y: 114, h: 14, color: '#C2410C' },
    ];
    for (const st of stripes) {
        ctx.fillStyle = st.color;
        ctx.fillRect(0, st.y, 256, st.h);
    }

    // Subtle woven cross-hatch thread detail
    ctx.fillStyle = 'rgba(120, 72, 32, 0.08)';
    for (let x = 0; x < 256; x += 8) {
        ctx.fillRect(x, 0, 2, 128);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

/**
 * Soft radial-gradient packed-earth clearing texture so the Pahingahan yard
 * blends organically into the surrounding grass with zero hard disk edge.
 */
function createYardClearingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 22, 128, 128, 126);
    grad.addColorStop(0, 'rgba(202, 166, 118, 0.72)');
    grad.addColorStop(0.52, 'rgba(196, 160, 112, 0.45)');
    grad.addColorStop(0.82, 'rgba(182, 152, 102, 0.14)');
    grad.addColorStop(1, 'rgba(182, 152, 102, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/**
 * Curved woven catenary hammock sling geometry in pendulum-pivot local space
 * (pivot at y = 0, spreader bars at x = ±1.92, y = -0.58, deepest center at y = -1.24).
 */
function buildHammockSlingGeo() {
    const segX = 28;
    const segZ = 12;
    const halfLen = 1.92;
    const halfW = 0.74;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let ix = 0; ix <= segX; ix++) {
        const uNorm = ix / segX; // 0..1
        const u = uNorm * 2 - 1; // -1..1
        const x = u * halfLen;
        // Deep plush catenary sag cradling the entire character cleanly underneath (zero shoe/back poking!)
        const baseY = -0.58 - (1 - u * u) * 0.72;
        const widthFactor = 0.86 + 0.18 * (1 - u * u);

        for (let iz = 0; iz <= segZ; iz++) {
            const vNorm = iz / segZ; // 0..1
            const v = vNorm * 2 - 1; // -1..1
            const z = v * halfW * widthFactor;
            // Raised cozy cradle lips along front & back edges
            const edgeLift = v * v * 0.21 * (1 - 0.32 * u * u);
            const y = baseY + edgeLift;

            positions.push(x, y, z);
            uvs.push(uNorm, vNorm);
        }
    }

    const stride = segZ + 1;
    for (let ix = 0; ix < segX; ix++) {
        for (let iz = 0; iz < segZ; iz++) {
            const a = ix * stride + iz;
            const b = (ix + 1) * stride + iz;
            const c = (ix + 1) * stride + (iz + 1);
            const d = ix * stride + (iz + 1);
            indices.push(a, b, d, b, c, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

/** Helper to render a thin taut rope segment between two 3D points. */
function RopeSegment({ from, to, radius = 0.026, color = '#C8A26A' }) {
    const { mid, len, quat } = useMemo(() => {
        const a = new THREE.Vector3(...from);
        const b = new THREE.Vector3(...to);
        const dir = new THREE.Vector3().subVectors(b, a);
        const l = dir.length();
        const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir.clone().normalize()
        );
        return { mid: [m.x, m.y, m.z], len: l, quat: q };
    }, [from, to]);

    return (
        <mesh position={mid} quaternion={quat}>
            <cylinderGeometry args={[radius, radius, len, 6]} />
            <meshStandardMaterial color={color} roughness={0.92} />
        </mesh>
    );
}

/** Soft drifting "Z" sprites floating upward while Juan/Pedro naps in the Duyan. */
function FloatingSleepZzz({ active, origin }) {
    const spriteRefs = useRef([]);

    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 96, 96);
        ctx.font = '900 66px Inter, "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(124, 45, 18, 0.72)';
        ctx.strokeText('Z', 48, 52);
        ctx.fillStyle = '#FFFBEB';
        ctx.fillText('Z', 48, 52);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, []);

    useEffect(() => () => texture.dispose(), [texture]);

    useFrame(({ clock }) => {
        if (!active) return;
        const t = clock.getElapsedTime();
        for (let i = 0; i < 3; i++) {
            const sp = spriteRefs.current[i];
            if (!sp) continue;
            const cycle = ((t * 0.42 + i / 3) % 1);
            const x = origin[0] - 0.15 + Math.sin(cycle * Math.PI * 2 + i) * 0.24 + cycle * 0.35;
            const y = origin[1] + cycle * 1.75;
            const z = origin[2] + Math.cos(cycle * Math.PI * 1.5) * 0.12;
            sp.position.set(x, y, z);
            const scale = 0.28 + Math.sin(cycle * Math.PI) * 0.32;
            sp.scale.set(scale, scale, 1);
            // Smooth fade-in and fade-out at ends of cycle
            const alpha = cycle < 0.2 ? cycle / 0.2 : cycle > 0.72 ? (1 - cycle) / 0.28 : 1;
            sp.material.opacity = Math.max(0, Math.min(1, alpha)) * 0.92;
        }
    });

    if (!active) return null;

    return (
        <group>
            {[0, 1, 2].map((i) => (
                <sprite
                    key={i}
                    ref={(el) => {
                        spriteRefs.current[i] = el;
                    }}
                    renderOrder={9}
                >
                    <spriteMaterial map={texture} transparent opacity={0} depthWrite={false} />
                </sprite>
            ))}
        </group>
    );
}

const _dreamWorldPos = new THREE.Vector3();

/**
 * Zero-re-render 3D -> 2D screen projector that locks the native Retina DOM Dream Cloud overlay
 * directly above the sleeping character's head as you orbit or zoom the 3D camera.
 */
function DreamBubbleProjector({ active, position, overlayElRef }) {
    const anchorRef = useRef();
    const { camera, size } = useThree();

    useEffect(() => {
        const el = overlayElRef?.current;
        if (!active && el) {
            el.style.visibility = 'hidden';
        }
        return () => {
            if (overlayElRef?.current) {
                overlayElRef.current.style.visibility = 'hidden';
            }
        };
    }, [active, overlayElRef]);

    useFrame(() => {
        const el = overlayElRef?.current;
        const anchor = anchorRef.current;
        if (!el) return;
        if (!active || !anchor) {
            if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
            return;
        }

        anchor.getWorldPosition(_dreamWorldPos);
        _dreamWorldPos.project(camera);

        // Hide cleanly if behind the camera or far off-screen
        if (_dreamWorldPos.z > 1 || _dreamWorldPos.z < -1) {
            if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
            return;
        }

        const rawX = ((_dreamWorldPos.x + 1) * 0.5) * size.width;
        const rawY = ((-_dreamWorldPos.y + 1) * 0.5) * size.height;

        // Clamp horizontally slightly inside narrow phone edges so the cloud text NEVER clips off-screen
        const halfW = size.width < 640 ? 116 : 132;
        const sx = Math.max(halfW, Math.min(size.width - halfW, rawX));
        const sy = Math.max(88, Math.min(size.height - 130, rawY));

        el.style.visibility = 'visible';
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
    });

    return <group ref={anchorRef} position={position} />;
}

/** Lush procedural Pinoy backyard flowering shrub (halaman / gumamela bush) around the Bahay Kubo. */
function TropicalHalamanBush({ position, scale = 1, flowerColor = '#EF4444' }) {
    return (
        <group position={position} scale={scale}>
            <mesh position={[0, 0.42, 0]} scale={[1.15, 0.82, 1.05]}>
                <dodecahedronGeometry args={[0.62, 1]} />
                <meshStandardMaterial color="#2E7D32" roughness={0.88} />
            </mesh>
            <mesh position={[-0.44, 0.32, 0.24]} scale={[0.92, 0.72, 0.88]}>
                <dodecahedronGeometry args={[0.48, 1]} />
                <meshStandardMaterial color="#3F9142" roughness={0.88} />
            </mesh>
            <mesh position={[0.46, 0.34, -0.16]} scale={[0.95, 0.76, 0.9]}>
                <dodecahedronGeometry args={[0.5, 1]} />
                <meshStandardMaterial color="#256D29" roughness={0.88} />
            </mesh>
            {/* Bright Pinoy Gumamela blossom accents */}
            <mesh position={[-0.22, 0.76, 0.34]}>
                <sphereGeometry args={[0.11, 7, 6]} />
                <meshStandardMaterial color={flowerColor} roughness={0.55} />
            </mesh>
            <mesh position={[0.32, 0.68, 0.22]}>
                <sphereGeometry args={[0.1, 7, 6]} />
                <meshStandardMaterial color="#FACC15" roughness={0.55} />
            </mesh>
            <mesh position={[0.04, 0.84, -0.18]}>
                <sphereGeometry args={[0.095, 7, 6]} />
                <meshStandardMaterial color={flowerColor} roughness={0.55} />
            </mesh>
        </group>
    );
}

const BANDERITA_COLORS = ['#EF4444', '#FACC15', '#2563EB', '#22C55E', '#F97316', '#EC4899'];

/** Festive overhead Pinoy fiesta banderitas strung between the new Bahay Kubo and the Acacia shade tree. */
function PahingahanBanderitas({ from, to, done, lowQuality }) {
    const flagsRef = useRef();

    const { flags, curveGeo } = useMemo(() => {
        const a = new THREE.Vector3(...from);
        const b = new THREE.Vector3(...to);
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        mid.y -= 0.75;
        const c = new THREE.QuadraticBezierCurve3(a, mid, b);
        const ropeGeo = new THREE.TubeGeometry(c, 16, 0.022, 5, false);

        const count = 11;
        const arr = [];
        for (let i = 0; i < count; i++) {
            const u = (i + 0.5) / count;
            const pt = c.getPointAt(u);
            const tan = c.getTangentAt(u);
            const yaw = Math.atan2(tan.x, tan.z);
            arr.push({
                pos: [pt.x, pt.y - 0.24, pt.z],
                yaw: yaw + Math.PI / 2,
                color: BANDERITA_COLORS[i % BANDERITA_COLORS.length],
            });
        }
        return { flags: arr, curveGeo: ropeGeo };
    }, [from, to]);

    useEffect(() => () => curveGeo.dispose(), [curveGeo]);

    useFrame(({ clock }) => {
        if (lowQuality || !flagsRef.current) return;
        const t = clock.getElapsedTime();
        flagsRef.current.children.forEach((child, idx) => {
            child.rotation.z = Math.sin(t * 3.2 + idx * 0.65) * 0.2;
        });
    });

    return (
        <group>
            <mesh geometry={curveGeo}>
                <meshStandardMaterial color="#9C7134" roughness={0.85} />
            </mesh>
            <group ref={flagsRef}>
                {flags.map((f, idx) => (
                    <group key={idx} position={f.pos} rotation={[0, f.yaw, 0]}>
                        <mesh rotation={[0, 0, Math.PI]}>
                            <coneGeometry args={[0.2, 0.46, 3]} />
                            <meshStandardMaterial
                                color={f.color}
                                emissive={done ? f.color : '#000000'}
                                emissiveIntensity={done ? 0.32 : 0}
                                roughness={0.55}
                            />
                        </mesh>
                    </group>
                ))}
            </group>
        </group>
    );
}

/**
 * "Pahingahan ni Juan" — Ending Sanctuary right past the "TAGUMPAY!" Bamboo Finish Arch:
 * - Bagong Bahay Kubo (reuses preloaded /models/kubo_bg.glb) with warm porch lantern
 * - Shady Acacia Tree (/models/tree_acacia.glb) + Napping Askal (/models/askal_rest.glb)
 * - Procedural woven Pinoy Duyan (hammock) swinging in locked sync with resting Juan/Pedro + floating Zzz
 * - Clickable to return to the Duyan, open Resulta/QR, or celebrate!
 */
export default function PahingahanNode({
    characterKey = 'juan',
    allCompleted = false,
    isResting = false,
    tourActive = false,
    guideActive = false,
    lowQuality = false,
    playerPosRef,
    dreamBubbleElRef,
    onSelectPahingahan,
}) {
    const pendulumRef = useRef();
    const lanternRef = useRef();
    const groundY = useMemo(() => getTerrainHeight(PAHINGAHAN_ZONE.x, PAHINGAHAN_ZONE.z), []);
    const hammockTex = useMemo(() => createHammockTexture(), []);
    const yardTex = useMemo(() => createYardClearingTexture(), []);
    const slingGeo = useMemo(() => buildHammockSlingGeo(), []);

    useEffect(() => {
        return () => {
            hammockTex.dispose();
            yardTex.dispose();
            slingGeo.dispose();
            if (typeof document !== 'undefined' && document.body.style.cursor === 'pointer') {
                document.body.style.cursor = '';
            }
        };
    }, [hammockTex, yardTex, slingGeo]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (pendulumRef.current) {
            pendulumRef.current.rotation.x = getHammockSwingAngle(t, isResting);
        }
        if (lanternRef.current && allCompleted) {
            lanternRef.current.scale.setScalar(1 + Math.sin(t * 2.8) * 0.06);
        }
    });

    const halfSpan = PAHINGAHAN_ZONE.hammockSpan / 2;
    const anchorY = PAHINGAHAN_ZONE.hammockAnchorY;
    const [hx, , hz] = PAHINGAHAN_ZONE.hammockOffset;
    const [kx, , kz] = PAHINGAHAN_ZONE.kuboOffset;
    const [tx, , tz] = PAHINGAHAN_ZONE.treeOffset;
    const [ax, , az] = PAHINGAHAN_ZONE.askalOffset;

    const ownerName = getCharacterMeta(characterKey).shortName;
    const labelTitle = allCompleted ? `Pahingahan ni ${ownerName}` : 'Pahingahan';

    const handleClick = (e) => {
        if (e.delta > 6) return;
        e.stopPropagation();
        onSelectPahingahan?.();
    };

    return (
        <group
            position={[PAHINGAHAN_ZONE.x, groundY, PAHINGAHAN_ZONE.z]}
            onClick={handleClick}
            onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                document.body.style.cursor = '';
            }}
        >
            {/* Soft feathered packed-earth home yard clearing under the Duyan & Kubo entrance */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, 0.06, -1.2]} receiveShadow>
                <circleGeometry args={[6.4, 32]} />
                <meshStandardMaterial
                    map={yardTex}
                    transparent
                    roughness={0.96}
                    depthWrite={false}
                />
            </mesh>

            {/* Bagong Bahay Kubo ni Juan + Shady Acacia Trees + Banana Plants + Napping Askal (all camera-occlusion aware!) */}
            <PahingahanErrorBoundary>
                <Suspense fallback={null}>
                    <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.55} lensMargin={1.8}>
                        <ClonedModel
                            url="/models/kubo_bg.glb"
                            position={[kx, 0, kz]}
                            yaw={PAHINGAHAN_ZONE.kuboYaw}
                            scale={2.15}
                            castShadow={!lowQuality}
                        />
                        {/* Warm Glowing Welcome Lantern near the Kubo porch */}
                        <group position={[kx - 1.6, 2.75, kz + 2.3]}>
                            <mesh position={[0, 0.35, 0]}>
                                <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
                                <meshStandardMaterial color="#78350F" roughness={0.85} />
                            </mesh>
                            <mesh ref={lanternRef}>
                                <sphereGeometry args={[0.24, 12, 10]} />
                                <meshStandardMaterial
                                    color={allCompleted ? '#FEF08A' : '#FDE68A'}
                                    emissive="#F59E0B"
                                    emissiveIntensity={allCompleted ? 1.15 : 0.45}
                                    roughness={0.35}
                                />
                            </mesh>
                            <mesh position={[0, 0.22, 0]}>
                                <coneGeometry args={[0.32, 0.16, 6]} />
                                <meshStandardMaterial color="#9A3412" roughness={0.8} />
                            </mesh>
                        </group>
                    </CameraFadeGroup>

                    <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.1} shrinkXZ={0.68} lensMargin={1.8}>
                        <ClonedModel
                            url="/models/tree_acacia.glb"
                            position={[tx, 0, tz]}
                            yaw={1.15}
                            scale={1.85}
                            castShadow={!lowQuality}
                        />
                    </CameraFadeGroup>

                    <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.15} shrinkXZ={0.72} lensMargin={1.8}>
                        <ClonedModel
                            url="/models/tree_acacia.glb"
                            position={[kx + 5.2, 0, kz - 1.4]}
                            yaw={2.35}
                            scale={1.88}
                            castShadow={!lowQuality}
                        />
                    </CameraFadeGroup>

                    <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.15} shrinkXZ={0.72} lensMargin={1.7}>
                        <ClonedModel
                            url="/models/tree_banana.glb"
                            position={[kx + 3.4, 0, kz + 2.5]}
                            yaw={0.85}
                            scale={1.36}
                            castShadow={!lowQuality}
                        />
                    </CameraFadeGroup>

                    <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.15} shrinkXZ={0.72} lensMargin={1.7}>
                        <ClonedModel
                            url="/models/tree_banana.glb"
                            position={[kx - 3.3, 0, kz - 1.6]}
                            yaw={2.1}
                            scale={1.26}
                            castShadow={!lowQuality}
                        />
                    </CameraFadeGroup>

                    <ClonedModel
                        url="/models/askal_rest.glb"
                        position={[ax, 0, az]}
                        yaw={-0.78}
                        scale={1.52}
                        castShadow={!lowQuality}
                    />
                </Suspense>
            </PahingahanErrorBoundary>

            {/* Cozy Flowering Backyard Plants (Halaman / Gumamela Bushes) framing the Bahay Kubo */}
            <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.35} lensMargin={1.4}>
                <TropicalHalamanBush position={[kx + 2.4, 0, kz + 2.1]} scale={1.15} flowerColor="#EF4444" />
                <TropicalHalamanBush position={[kx + 3.8, 0, kz + 0.3]} scale={0.95} flowerColor="#FB7185" />
            </CameraFadeGroup>
            <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.35} lensMargin={1.4}>
                <TropicalHalamanBush position={[kx - 2.9, 0, kz + 0.6]} scale={1.05} flowerColor="#F97316" />
                <TropicalHalamanBush position={[kx + 0.4, 0, kz - 3.4]} scale={1.2} flowerColor="#EF4444" />
            </CameraFadeGroup>

            {/* Festive Pinoy Fiesta Banderitas strung from Bagong Bahay Kubo to the Acacia Shade Tree */}
            <CameraFadeGroup playerPosRef={playerPosRef} tourActive={tourActive} pad={0.45} lensMargin={1.6}>
                <PahingahanBanderitas
                    from={[kx - 1.2, 4.6, kz + 1.4]}
                    to={[tx + 0.8, 4.4, tz + 0.4]}
                    done={allCompleted}
                    lowQuality={lowQuality}
                />
            </CameraFadeGroup>

            {/* Procedural Woven Pinoy Duyan (Hammock) on Sturdy Bamboo Support Posts */}
            <group position={[hx, 0, hz]} rotation={[0, PAHINGAHAN_ZONE.hammockYaw, 0]}>
                {/* Soft oval ground shadow directly beneath the Duyan */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} scale={[2.1, 0.72, 1]}>
                    <circleGeometry args={[1, 20]} />
                    <meshBasicMaterial color="#0F172A" transparent opacity={0.22} depthWrite={false} />
                </mesh>

                {/* Twin Double-Lashed Bamboo Support Posts */}
                {[-halfSpan, halfSpan].map((xPos, idx) => (
                    <group key={idx} position={[xPos, 0, 0]}>
                        <mesh position={[0, 1.05, 0]} castShadow={!lowQuality}>
                            <cylinderGeometry args={[0.11, 0.135, 3.3, 8]} />
                            <meshStandardMaterial color="#B58946" roughness={0.78} />
                        </mesh>
                        {/* Angled stabilizer brace anchored into soil */}
                        <mesh
                            position={[idx === 0 ? -0.32 : 0.32, 0.62, 0]}
                            rotation={[0, 0, idx === 0 ? -0.36 : 0.36]}
                            castShadow={!lowQuality}
                        >
                            <cylinderGeometry args={[0.065, 0.08, 1.65, 6]} />
                            <meshStandardMaterial color="#9C7134" roughness={0.82} />
                        </mesh>
                        {/* Rope lash collar at tie height */}
                        <mesh position={[0, anchorY, 0]}>
                            <cylinderGeometry args={[0.145, 0.145, 0.18, 8]} />
                            <meshStandardMaterial color="#D6B27A" roughness={0.92} />
                        </mesh>
                    </group>
                ))}

                {/* Swinging Pendulum Group (Locked in 100% sync with resting Juan/Pedro!) */}
                <group ref={pendulumRef} position={[0, anchorY, 0]}>
                    {/* Left & Right Abaca V-Suspension Ropes */}
                    <RopeSegment from={[-halfSpan, 0, 0]} to={[-1.92, -0.58, -0.62]} />
                    <RopeSegment from={[-halfSpan, 0, 0]} to={[-1.92, -0.58, 0.62]} />
                    <RopeSegment from={[-halfSpan, 0, 0]} to={[-1.92, -0.58, 0]} />
                    <RopeSegment from={[halfSpan, 0, 0]} to={[1.92, -0.58, -0.62]} />
                    <RopeSegment from={[halfSpan, 0, 0]} to={[1.92, -0.58, 0.62]} />
                    <RopeSegment from={[halfSpan, 0, 0]} to={[1.92, -0.58, 0]} />

                    {/* Twin Wooden Spreader Bars */}
                    <mesh position={[-1.92, -0.58, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!lowQuality}>
                        <cylinderGeometry args={[0.048, 0.048, 1.34, 8]} />
                        <meshStandardMaterial color="#7C4A22" roughness={0.82} />
                    </mesh>
                    <mesh position={[1.92, -0.58, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!lowQuality}>
                        <cylinderGeometry args={[0.048, 0.048, 1.34, 8]} />
                        <meshStandardMaterial color="#7C4A22" roughness={0.82} />
                    </mesh>

                    {/* Woven Pinoy Striped Hammock Cradle */}
                    <mesh geometry={slingGeo} castShadow={!lowQuality} receiveShadow>
                        <meshStandardMaterial
                            map={hammockTex}
                            roughness={0.88}
                            side={THREE.DoubleSide}
                        />
                    </mesh>

                    {/* Cozy Stuffed Pillow (Unan) tucked neatly under the character's head */}
                    <mesh
                        position={[-1.06, -1.04, 0]}
                        rotation={[0, 0, -0.24]}
                        scale={[0.42, 0.16, 0.5]}
                        castShadow={!lowQuality}
                    >
                        <sphereGeometry args={[1, 12, 10]} />
                        <meshStandardMaterial color="#FFFBEB" roughness={0.92} />
                    </mesh>
                </group>

                {/* Drifting Soft Zzz Sprites + 3D->2D Screen Anchor for Razor-Sharp Retina Dream Cloud */}
                <FloatingSleepZzz active={isResting && !tourActive && !guideActive} origin={[-1.18, 2.08, 0.15]} />
                <DreamBubbleProjector
                    active={isResting && !tourActive && !guideActive}
                    position={[-0.08, 4.18, 0.35]}
                    overlayElRef={dreamBubbleElRef}
                />
            </group>

            {/* Floating Name Tag neatly framed above the new Bahay Kubo (auto-fits long names like Magnanakaw on mobile!) */}
            {!tourActive && !guideActive && (
                <MapLabelSprite
                    title={labelTitle}
                    state={allCompleted ? 'done' : 'locked'}
                    score={0}
                    maxScore={0}
                    hideScore
                    position={[
                        kx - (labelTitle.length > 20 ? 2.45 : labelTitle.length > 16 ? 1.75 : 1.15),
                        6.25,
                        kz + 0.55,
                    ]}
                    height={labelTitle.length > 20 ? 0.72 : labelTitle.length > 16 ? 0.82 : 0.92}
                />
            )}
        </group>
    );
}
