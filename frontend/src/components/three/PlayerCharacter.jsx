import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    cameraOffset,
    CHAR_SCALE,
    getHammockSwingAngle,
    getTerrainHeight,
    getWalkHeight,
    MAP_NODE_STOPS,
    PAHINGAHAN_ZONE,
    WALK_SPEED,
} from './worldConfig';
import { getCharacterMeta } from '../../utils/characters';
import { playFootstepSfx } from '../../utils/gameAudio';

const FEET_LIFT = 0.14; // stands on top of the sandy road / plaza
const DUST_POOL_SIZE = 6;
const DUST_SHARED_GEO = new THREE.SphereGeometry(0.17, 7, 6);

class ModelErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}

function shortestAngle(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/**
 * The pupil's Juan/Pedro on the world map. Walks along the road from map to map;
 * while standing it plays Idle (looks around) and turns to face the camera.
 */
export default function PlayerCharacter({
    characterKey,
    curve,
    startMapNumber,
    targetMapNumber,
    isWalking,
    isResting = false,
    tourActive,
    lowQuality = false,
    controlsRef,
    playerPosRef,
    onArrived,
}) {
    const groupRef = useRef();
    const pendulumRef = useRef();
    const bodyHopRef = useRef();
    const shadowRef = useRef();
    const dustMeshRefs = useRef([]);
    const dustSlotsRef = useRef(
        Array.from({ length: DUST_POOL_SIZE }, () => ({
            life: 0,
            maxLife: 0.52,
            x: 0,
            y: 0,
            z: 0,
            vx: 0,
            vy: 0,
            vz: 0,
        }))
    );
    const dustCursorRef = useRef(0);
    const stepAccumRef = useRef(0);
    const footSideRef = useRef(1);
    const hopTimerRef = useRef(0);

    const { camera, size } = useThree();
    const progressTRef = useRef(MAP_NODE_STOPS[startMapNumber]?.t ?? 0);
    const initializedRef = useRef(false);
    const yawRef = useRef(0);
    const faceCameraRef = useRef(true);
    const arrivedRef = useRef(false);
    const curveLength = useMemo(() => curve.getLength(), [curve]);
    const tmp = useMemo(
        () => ({
            pos: new THREE.Vector3(),
            tan: new THREE.Vector3(),
            cam: new THREE.Vector3(),
            off: new THREE.Vector3(),
            target: new THREE.Vector3(),
        }),
        []
    );

    const spawnFootDust = (x, y, z, tanX, tanZ) => {
        if (lowQuality) return;
        const slot = dustSlotsRef.current[dustCursorRef.current];
        dustCursorRef.current = (dustCursorRef.current + 1) % DUST_POOL_SIZE;
        const side = footSideRef.current;
        footSideRef.current = -side;
        // Perpendicular left/right foot offset
        const perpX = -tanZ * 0.22 * side;
        const perpZ = tanX * 0.22 * side;
        slot.life = slot.maxLife;
        slot.x = x + perpX;
        slot.y = y + 0.08;
        slot.z = z + perpZ;
        slot.vx = -tanX * 0.28 + perpX * 0.35;
        slot.vy = 0.42;
        slot.vz = -tanZ * 0.28 + perpZ * 0.35;
    };

    const hammockPivotPos = useMemo(() => {
        const hx = PAHINGAHAN_ZONE.x + PAHINGAHAN_ZONE.hammockOffset[0];
        const hz = PAHINGAHAN_ZONE.z + PAHINGAHAN_ZONE.hammockOffset[2];
        const gy = getTerrainHeight(PAHINGAHAN_ZONE.x, PAHINGAHAN_ZONE.z);
        return new THREE.Vector3(hx, gy + PAHINGAHAN_ZONE.hammockAnchorY, hz);
    }, []);

    const place = (t) => {
        curve.getPointAt(t, tmp.pos);
        tmp.pos.y = getWalkHeight(tmp.pos.x, tmp.pos.z) + FEET_LIFT;
        groupRef.current.position.copy(tmp.pos);
        if (playerPosRef?.current) {
            playerPosRef.current.copy(tmp.pos);
        }
    };

    useEffect(() => {
        if (!groupRef.current) return;
        // Place on initial mount OR snap cleanly back when teacher triggers a full reset while idle
        if (!initializedRef.current || !isWalking) {
            progressTRef.current = MAP_NODE_STOPS[startMapNumber]?.t ?? 0;
            if (isResting) {
                groupRef.current.position.copy(hammockPivotPos);
                groupRef.current.rotation.set(0, PAHINGAHAN_ZONE.hammockYaw, 0);
                if (playerPosRef?.current) {
                    playerPosRef.current.set(
                        hammockPivotPos.x,
                        hammockPivotPos.y - PAHINGAHAN_ZONE.hammockSeatDrop,
                        hammockPivotPos.z
                    );
                }
            } else {
                place(progressTRef.current);
            }
            initializedRef.current = true;
        }
    }, [curve, startMapNumber, isWalking, isResting, hammockPivotPos]);

    useEffect(() => {
        if (isWalking) {
            arrivedRef.current = false;
            // Prime stride accumulator so first earthen footstep plays right as the character steps off
            stepAccumRef.current = 0.72;
            if (pendulumRef.current) pendulumRef.current.rotation.set(0, 0, 0);
            if (groupRef.current) {
                place(progressTRef.current);
            }
        }
    }, [isWalking, targetMapNumber]);

    useFrame(({ clock }, delta) => {
        const g = groupRef.current;
        if (!g || tourActive) return;
        const dt = Math.min(delta, 0.05);

        if (isResting && !isWalking) {
            g.position.copy(hammockPivotPos);
            g.rotation.set(0, PAHINGAHAN_ZONE.hammockYaw, 0);
            if (pendulumRef.current) {
                pendulumRef.current.rotation.x = getHammockSwingAngle(clock.getElapsedTime(), true);
            }
            if (bodyHopRef.current) {
                bodyHopRef.current.position.y = 0;
            }
            if (shadowRef.current) {
                shadowRef.current.visible = false;
            }
            if (playerPosRef?.current) {
                playerPosRef.current.set(
                    hammockPivotPos.x,
                    hammockPivotPos.y - PAHINGAHAN_ZONE.hammockSeatDrop,
                    hammockPivotPos.z
                );
            }
            return;
        }

        if (pendulumRef.current && pendulumRef.current.rotation.x !== 0) {
            pendulumRef.current.rotation.x = 0;
        }
        if (shadowRef.current && !shadowRef.current.visible) {
            shadowRef.current.visible = true;
        }

        if (isWalking) {
            const targetT = MAP_NODE_STOPS[targetMapNumber]?.t ?? progressTRef.current;
            const diff = targetT - progressTRef.current;
            const step = (WALK_SPEED * dt) / curveLength;

            if (Math.abs(diff) <= step) {
                progressTRef.current = targetT;
                place(targetT);
                faceCameraRef.current = true;
                if (!arrivedRef.current) {
                    arrivedRef.current = true;
                    hopTimerRef.current = 0.36; // brief cheerful arrival hop
                    onArrived?.(targetMapNumber);
                }
            } else {
                const dir = Math.sign(diff);
                progressTRef.current += dir * step;
                place(progressTRef.current);
                curve.getTangentAt(progressTRef.current, tmp.tan);
                const desired = Math.atan2(tmp.tan.x * dir, tmp.tan.z * dir);
                yawRef.current += shortestAngle(yawRef.current, desired) * Math.min(1, dt * 10);
                faceCameraRef.current = false;

                // Subtle earthen footstep sound + dust puff along the dirt road every stride
                stepAccumRef.current += WALK_SPEED * dt;
                if (stepAccumRef.current >= 1.05) {
                    stepAccumRef.current = 0;
                    playFootstepSfx();
                    if (!lowQuality) {
                        spawnFootDust(g.position.x, g.position.y, g.position.z, tmp.tan.x * dir, tmp.tan.z * dir);
                    }
                }

                // camera follows, character stays in the middle of the screen
                cameraOffset(size.width / size.height, tmp.off);
                tmp.cam.copy(g.position).add(tmp.off);
                camera.position.lerp(tmp.cam, Math.min(1, dt * 2.6));
                tmp.target.copy(g.position).setY(g.position.y + 1.4);
                if (controlsRef?.current) {
                    controlsRef.current.target.lerp(tmp.target, Math.min(1, dt * 5));
                    controlsRef.current.update();
                } else {
                    camera.lookAt(tmp.target);
                }
            }
        } else if (faceCameraRef.current) {
            const desired = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
            yawRef.current += shortestAngle(yawRef.current, desired) * Math.min(1, dt * 4);
        }
        g.rotation.y = yawRef.current;

        // Animate brief cheerful arrival hop (smooth arc + gentle shadow shrink)
        if (hopTimerRef.current > 0) {
            hopTimerRef.current = Math.max(0, hopTimerRef.current - dt);
            const u = 1 - hopTimerRef.current / 0.36;
            const hopY = Math.sin(u * Math.PI) * 0.38;
            if (bodyHopRef.current) bodyHopRef.current.position.y = hopY;
            if (shadowRef.current) {
                const s = 1 - hopY * 0.42;
                shadowRef.current.scale.set(s, s, 1);
            }
        } else if (bodyHopRef.current && bodyHopRef.current.position.y !== 0) {
            bodyHopRef.current.position.y = 0;
            if (shadowRef.current) shadowRef.current.scale.set(1, 1, 1);
        }

        // Update pooled world-space footstep dust puffs (zero allocation, hidden when idle)
        if (!lowQuality) {
            const slots = dustSlotsRef.current;
            for (let i = 0; i < DUST_POOL_SIZE; i += 1) {
                const mesh = dustMeshRefs.current[i];
                if (!mesh) continue;
                const slot = slots[i];
                if (slot.life <= 0) {
                    if (mesh.visible) mesh.visible = false;
                    continue;
                }
                slot.life -= dt;
                if (slot.life <= 0) {
                    mesh.visible = false;
                    continue;
                }
                const progress = 1 - slot.life / slot.maxLife;
                slot.x += slot.vx * dt;
                slot.y += slot.vy * dt * (1 - progress * 0.55);
                slot.z += slot.vz * dt;
                mesh.visible = true;
                mesh.position.set(slot.x, slot.y, slot.z);
                const s = 0.65 + progress * 1.15;
                mesh.scale.set(s, s * 0.72, s);
                mesh.material.opacity = (1 - progress) * 0.42;
            }
        }
    });

    const charMeta = getCharacterMeta(characterKey);
    const modelUrl = charMeta.modelUrl;
    const fallback = <SimpleFallback charMeta={charMeta} />;

    return (
        <>
            <group ref={groupRef}>
                <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <circleGeometry args={[0.7, 24]} />
                    <meshBasicMaterial color="#0F172A" transparent opacity={0.25} depthWrite={false} />
                </mesh>
                <group ref={pendulumRef}>
                    <group ref={bodyHopRef}>
                        <group
                            position={isResting ? [0.16, -1.01, 0.02] : [0, 0, 0]}
                            rotation={isResting ? [0.16, Math.PI / 2, 0] : [0, 0, 0]}
                        >
                            <group rotation={isResting ? [-Math.PI / 2 + 0.02, 0, 0] : [0, 0, 0]}>
                                <group position={isResting ? [0, -1.16, 0] : [0, 0, 0]}>
                                    <ModelErrorBoundary key={modelUrl} fallback={fallback}>
                                        <Suspense fallback={fallback}>
                                            <GlbCharacter
                                                url={modelUrl}
                                                isWalking={isWalking}
                                                isResting={isResting}
                                            />
                                        </Suspense>
                                    </ModelErrorBoundary>
                                </group>
                            </group>
                        </group>
                    </group>
                </group>
            </group>

            {!lowQuality && (
                <group>
                    {Array.from({ length: DUST_POOL_SIZE }).map((_, idx) => (
                        <mesh
                            key={idx}
                            ref={(el) => {
                                dustMeshRefs.current[idx] = el;
                            }}
                            geometry={DUST_SHARED_GEO}
                            dispose={null}
                            visible={false}
                            frustumCulled={false}
                        >
                            <meshBasicMaterial
                                color="#E6D5B8"
                                transparent
                                opacity={0}
                                depthWrite={false}
                            />
                        </mesh>
                    ))}
                </group>
            )}
        </>
    );
}

function GlbCharacter({ url, isWalking, isResting = false }) {
    const { scene } = useGLTF(url, '/draco/');
    const model = useMemo(() => cloneSkinned(scene), [scene]);

    // Cache skeleton bones, exact rest poses, open eye meshes, and auto-fitted sleeping closed eyes!
    // Works automatically across ALL 7 playable characters (Juan, Pedro, Maria, Alkalde, Pulis, Guwardya, Magnanakaw).
    const rig = useMemo(() => {
        const canonical = (s) => (s || '').replace(/[._\-\s]/g, '').toLowerCase();
        const wanted = new Set([
            'hips',
            'spine',
            'chest',
            'neck',
            'head',
            'thighl',
            'shinl',
            'footl',
            'thighr',
            'shinr',
            'footr',
            'upperarml',
            'forearml',
            'upperarmr',
            'forearmr',
        ]);
        const bones = {};
        const restQ = {};
        const openEyeMeshes = [];
        let irisMesh = null;
        let headMesh = null;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;

                const cname = canonical(child.name);
                if (/(eyeiris|eyeshine|eyewhites|eyelids|eyelash)/.test(cname)) {
                    openEyeMeshes.push(child);
                }
                if (!irisMesh && cname.includes('eyeiris')) {
                    irisMesh = child;
                }
                if (!headMesh && (cname === 'jhead' || cname === 'phead' || cname === 'sphere001')) {
                    headMesh = child;
                }
            }
            const key = canonical(child.name);
            if ((child.isBone || child.type === 'Bone') && wanted.has(key) && !bones[key]) {
                bones[key] = child;
                restQ[key] = child.quaternion.clone();
            }
        });

        // Build curved peaceful closed-eye sleep arcs fitted directly to this character's face & bound to head bone!
        let closedEyesMesh = null;
        if (bones.head && irisMesh?.geometry) {
            model.updateMatrixWorld(true);
            irisMesh.geometry.computeBoundingBox();
            const irisBox = irisMesh.geometry.boundingBox;

            let hx0 = 0;
            let hy0 = (irisBox.min.y + irisBox.max.y) * 0.5 + 0.032;
            let hz0 = 0;
            let rx = 0.2;
            let ry = 0.185;
            let rz = irisBox.max.z;

            if (headMesh?.geometry) {
                headMesh.geometry.computeBoundingBox();
                const hb = headMesh.geometry.boundingBox;
                hx0 = (hb.min.x + hb.max.x) * 0.5;
                hy0 = (hb.min.y + hb.max.y) * 0.5;
                hz0 = (hb.min.z + hb.max.z) * 0.5;
                rx = Math.max(0.14, (hb.max.x - hb.min.x) * 0.5);
                ry = Math.max(0.14, (hb.max.y - hb.min.y) * 0.5);
                rz = Math.max(0.14, (hb.max.z - hb.min.z) * 0.5);
            }

            const eyeCenterY = (irisBox.min.y + irisBox.max.y) * 0.5;
            const halfSpanX = irisBox.max.x;
            const eyeCenterX = halfSpanX * 0.66;
            const eyeHalfW = halfSpanX * 0.34;
            const arcDip = (irisBox.max.y - irisBox.min.y) * 0.22;

            // Project each arc point cleanly onto the curved surface of the character's head sphere (+7mm proud)
            const surfacePoint = (x, y, zBoost = 0.007) => {
                const nx = (x - hx0) / rx;
                const ny = (y - hy0) / ry;
                const under = Math.max(0.12, 1 - nx * nx - ny * ny);
                const z = hz0 + rz * Math.sqrt(under) + zBoost;
                return new THREE.Vector3(x, y, z);
            };

            const parts = [];
            for (const side of [-1, 1]) {
                const cx = side * eyeCenterX;
                const curvePts = [
                    surfacePoint(cx - eyeHalfW, eyeCenterY + arcDip * 0.45),
                    surfacePoint(cx - eyeHalfW * 0.5, eyeCenterY - arcDip * 0.65),
                    surfacePoint(cx, eyeCenterY - arcDip),
                    surfacePoint(cx + eyeHalfW * 0.5, eyeCenterY - arcDip * 0.65),
                    surfacePoint(cx + eyeHalfW, eyeCenterY + arcDip * 0.45),
                ];
                const arcCurve = new THREE.CatmullRomCurve3(curvePts);
                const arcGeo = new THREE.TubeGeometry(arcCurve, 12, 0.0085, 6, false);
                parts.push(arcGeo.index ? arcGeo.toNonIndexed() : arcGeo);

                // Subtle outer eyelash curl tick for clear cartoon sleeping expression
                const outerX = cx + side * eyeHalfW;
                const tickCurve = new THREE.LineCurve3(
                    surfacePoint(outerX - side * 0.004, eyeCenterY + arcDip * 0.35),
                    surfacePoint(outerX + side * 0.011, eyeCenterY + arcDip * 0.95)
                );
                const tickGeo = new THREE.TubeGeometry(tickCurve, 4, 0.0055, 5, false);
                parts.push(tickGeo.index ? tickGeo.toNonIndexed() : tickGeo);
            }

            const merged = mergeGeometries(parts, false);
            parts.forEach((p) => p.dispose());

            // Convert from mesh/model bind space into bones.head local space so eyes move 100% with head bone
            const meshToWorld = irisMesh.matrixWorld.clone();
            const worldToHead = bones.head.matrixWorld.clone().invert();
            const toHeadLocal = new THREE.Matrix4().multiplyMatrices(worldToHead, meshToWorld);
            merged.applyMatrix4(toHeadLocal);

            const closedMat = new THREE.MeshStandardMaterial({
                color: '#1C110B',
                roughness: 0.72,
            });
            closedEyesMesh = new THREE.Mesh(merged, closedMat);
            closedEyesMesh.name = 'JQ_ClosedSleepEyes';
            closedEyesMesh.visible = false;
            closedEyesMesh.frustumCulled = false;
            bones.head.add(closedEyesMesh);
        }

        const restHipsPos = bones.hips ? bones.hips.position.clone() : new THREE.Vector3(0, 0, 0.36);
        return { bones, restQ, restHipsPos, openEyeMeshes, closedEyesMesh };
    }, [model]);

    useEffect(() => {
        const closed = rig.closedEyesMesh;
        return () => {
            if (closed) {
                closed.parent?.remove(closed);
                closed.geometry?.dispose();
                closed.material?.dispose();
            }
        };
    }, [rig]);

    useEffect(() => {
        const sleeping = Boolean(isResting && !isWalking);
        for (const m of rig.openEyeMeshes) {
            m.visible = !sleeping;
        }
        if (rig.closedEyesMesh) {
            rig.closedEyesMesh.visible = sleeping;
        }
    }, [rig, isResting, isWalking]);

    const animRef = useRef({
        phase: 0,
        idleT: 0,
        walkBlend: 0,
        restBlend: 0,
        qTmp: new THREE.Quaternion(),
        eulerTmp: new THREE.Euler(0, 0, 0, 'XYZ'),
    });

    // Lifelike real-time skeletal Walk, Idle, and Relaxed Hammock Siesta pose!
    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        const st = animRef.current;
        const { bones, restQ, restHipsPos } = rig;
        if (!bones.hips) return;

        // Smooth blend between Idle (0), Walk (1), and Hammock Rest (1)
        const targetWalk = isWalking ? 1 : 0;
        const targetRest = isResting && !isWalking ? 1 : 0;
        st.walkBlend += (targetWalk - st.walkBlend) * Math.min(1, dt * 12);
        st.restBlend += (targetRest - st.restBlend) * Math.min(1, dt * 10);
        const w = st.walkBlend;
        const r = st.restBlend;
        const idleW = Math.max(0, 1 - w - r);

        st.idleT += dt;
        if (w > 0.005) {
            st.phase += dt * 10.2;
        }

        const p = st.phase;
        const sinL = Math.sin(p);
        const cosL = Math.cos(p);
        const sinR = -sinL;
        const cosR = -cosL;

        const applyBone = (key, rx, ry = 0, rz = 0) => {
            const bone = bones[key];
            const base = restQ[key];
            if (!bone || !base) return;
            st.eulerTmp.set(rx, ry, rz);
            st.qTmp.setFromEuler(st.eulerTmp);
            bone.quaternion.copy(base).multiply(st.qTmp);
        };

        // Verified local bone axes for RigJuan & RigPedro:
        // Thighs & UpperArms: negative X swings FORWARD (+Z), positive X swings BACKWARD (-Z)
        // Shins (Knees): positive X bends BACKWARD (-Z) — lifting the foot clearly UP off the ground!
        // Forearms (Elbows): negative X bends FORWARD (+Z)
        // Feet: negative X lifts toes UP (heel strike), positive X points toes DOWN (push-off)

        const liftL = Math.max(0, Math.cos(p + 0.35));
        const liftR = Math.max(0, Math.cos(p + Math.PI + 0.35));
        const napBreath = Math.sin(st.idleT * 1.45);
        const lazyFootBob = Math.sin(st.idleT * 1.85) * 0.12;

        // Left Leg: walk stride OR relaxed knee kept cleanly ABOVE the rising hammock sling (zero foot clipping!)
        const thighL = (-sinL * 0.78 - 0.06) * w + -0.58 * r;
        const shinL = (Math.pow(liftL, 1.15) * 1.15 + 0.06) * w + 0.44 * r;
        const footL = (-sinL * 0.30 - liftL * 0.14) * w + -0.06 * r;

        // Right Leg: opposite walk stride OR propped cozy siesta knee resting cleanly ON TOP of the hammock cloth
        const thighR = (-sinR * 0.78 - 0.06) * w + -0.88 * r;
        const shinR = (Math.pow(liftR, 1.15) * 1.15 + 0.06) * w + 0.76 * r;
        const footR = (-sinR * 0.30 - liftR * 0.14) * w + (-0.08 + lazyFootBob * 0.65) * r;

        applyBone('thighl', thighL);
        applyBone('shinl', shinL);
        applyBone('footl', footL);
        applyBone('thighr', thighR);
        applyBone('shinr', shinR);
        applyBone('footr', footR);

        // Opposite-phase Arm Swing (walk), gentle Idle breathing, OR arms dropped naturally flat at sides by gravity in hammock!
        const idleBreath = Math.sin(st.idleT * 2.2) * idleW;
        const armL = sinL * 0.68 * w + idleBreath * 0.04 + (0.08 + napBreath * 0.02) * r;
        const armR = sinR * 0.68 * w - idleBreath * 0.04 + (0.08 + napBreath * 0.02) * r;
        const elbowL = (-0.24 - Math.max(0, -sinL) * 0.56) * w - 0.10 * idleW + -0.14 * r;
        const elbowR = (-0.24 - Math.max(0, -sinR) * 0.56) * w - 0.10 * idleW + -0.14 * r;

        applyBone('upperarml', armL, -0.18 * r, idleBreath * 0.03 + 0.08 * r);
        applyBone('forearml', elbowL);
        applyBone('upperarmr', armR, 0.18 * r, -idleBreath * 0.03 - 0.08 * r);
        applyBone('forearmr', elbowR);

        // Real-life Double-Bounce Hip Lift during walk; steady gentle rise in hammock
        const stepBounce = (Math.abs(cosL) - 0.32) * 0.042 * w + idleBreath * 0.006;
        bones.hips.position.set(restHipsPos.x, restHipsPos.y, restHipsPos.z + stepBounce);
        applyBone('hips', 0, sinL * 0.14 * w, sinL * 0.055 * w);

        // Spine & Chest: walk lean OR slight cozy hammock cradle curve with slow nap breathing
        applyBone(
            'spine',
            -0.10 * w + idleBreath * 0.025 + (-0.12 + napBreath * 0.028) * r,
            -sinL * 0.11 * w,
            -sinL * 0.03 * w
        );
        applyBone('chest', -0.04 * w + (-0.09 + napBreath * 0.024) * r, -sinL * 0.06 * w, 0);

        // Head: steady forward gaze during walk, curious look-around in idle, cozy pillow rest in hammock
        const idleLookY = Math.sin(st.idleT * 0.85) * 0.24 * idleW;
        const idleTiltX = Math.sin(st.idleT * 1.4) * 0.04 * idleW;
        applyBone(
            'head',
            0.09 * w + idleTiltX + (-0.34 + napBreath * 0.035) * r,
            idleLookY + -0.14 * r,
            0
        );
    });

    return <primitive object={model} scale={CHAR_SCALE} dispose={null} />;
}

/** Shown only while the GLB loads (or if it cannot load). */
function SimpleFallback({ charMeta }) {
    const shirt = charMeta?.shirtColor || '#E6D8B8';
    const pants = charMeta?.pantsColor || '#8A5A36';
    return (
        <group scale={CHAR_SCALE}>
            <mesh position={[0, 0.2, 0]}>
                <capsuleGeometry args={[0.1, 0.2, 4, 10]} />
                <meshStandardMaterial color={pants} />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
                <capsuleGeometry args={[0.15, 0.15, 4, 12]} />
                <meshStandardMaterial color={shirt} />
            </mesh>
            <mesh position={[0, 0.84, 0]}>
                <sphereGeometry args={[0.19, 16, 12]} />
                <meshStandardMaterial color="#C68A5E" />
            </mesh>
        </group>
    );
}

useGLTF.preload('/models/juan.glb', '/draco/');
