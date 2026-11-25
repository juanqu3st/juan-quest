import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { cameraOffset, CHAR_SCALE, getWalkHeight, MAP_NODE_STOPS, WALK_SPEED } from './worldConfig';
import { getCharacterMeta } from '../../utils/characters';

const FEET_LIFT = 0.14; // stands on top of the sandy road / plaza

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
    tourActive,
    controlsRef,
    playerPosRef,
    onArrived,
}) {
    const groupRef = useRef();
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

    const place = (t) => {
        curve.getPointAt(t, tmp.pos);
        tmp.pos.y = getWalkHeight(tmp.pos.x, tmp.pos.z) + FEET_LIFT;
        groupRef.current.position.copy(tmp.pos);
        if (playerPosRef?.current) {
            playerPosRef.current.copy(tmp.pos);
        }
    };

    useEffect(() => {
        if (!initializedRef.current && groupRef.current) {
            progressTRef.current = MAP_NODE_STOPS[startMapNumber]?.t ?? 0;
            place(progressTRef.current);
            initializedRef.current = true;
        }
    }, [curve, startMapNumber]);

    useEffect(() => {
        if (isWalking) arrivedRef.current = false;
    }, [isWalking, targetMapNumber]);

    useFrame((_, delta) => {
        const g = groupRef.current;
        if (!g || tourActive) return;
        const dt = Math.min(delta, 0.05);

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
    });

    const charMeta = getCharacterMeta(characterKey);
    const modelUrl = charMeta.modelUrl;
    const fallback = <SimpleFallback charMeta={charMeta} />;

    return (
        <group ref={groupRef}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <circleGeometry args={[0.7, 24]} />
                <meshBasicMaterial color="#0F172A" transparent opacity={0.25} depthWrite={false} />
            </mesh>
            <ModelErrorBoundary key={modelUrl} fallback={fallback}>
                <Suspense fallback={fallback}>
                    <GlbCharacter url={modelUrl} isWalking={isWalking} />
                </Suspense>
            </ModelErrorBoundary>
        </group>
    );
}

function GlbCharacter({ url, isWalking }) {
    const { scene } = useGLTF(url, '/draco/');
    const model = useMemo(() => cloneSkinned(scene), [scene]);

    // Cache skeleton bones & exact rest poses using dot/underscore-insensitive lookup!
    // (Three.js GLTFLoader sanitizes Blender's "thigh.L" -> "thighL", "shin.L" -> "shinL", etc.)
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

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;
            }
            const key = canonical(child.name);
            if ((child.isBone || child.type === 'Bone') && wanted.has(key) && !bones[key]) {
                bones[key] = child;
                restQ[key] = child.quaternion.clone();
            }
        });

        const restHipsPos = bones.hips ? bones.hips.position.clone() : new THREE.Vector3(0, 0, 0.36);
        return { bones, restQ, restHipsPos };
    }, [model]);

    const animRef = useRef({
        phase: 0,
        idleT: 0,
        walkBlend: 0,
        qTmp: new THREE.Quaternion(),
        eulerTmp: new THREE.Euler(0, 0, 0, 'XYZ'),
    });

    // Lifelike real-time skeletal Walk (high knee lift + heel-to-toe stride + double-bounce + arm swing) & Idle!
    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        const st = animRef.current;
        const { bones, restQ, restHipsPos } = rig;
        if (!bones.hips) return;

        // Smooth blend between Idle (0) and Walk (1)
        const targetBlend = isWalking ? 1 : 0;
        st.walkBlend += (targetBlend - st.walkBlend) * Math.min(1, dt * 12);
        const w = st.walkBlend;

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

        // Left Leg: forward/back stride + clear knee lift during swing phase + ankle roll
        const thighL = (-sinL * 0.78 - 0.06) * w;
        const shinL = (Math.pow(liftL, 1.15) * 1.15 + 0.06) * w;
        const footL = (-sinL * 0.30 - liftL * 0.14) * w;

        // Right Leg (180° opposite phase!)
        const thighR = (-sinR * 0.78 - 0.06) * w;
        const shinR = (Math.pow(liftR, 1.15) * 1.15 + 0.06) * w;
        const footR = (-sinR * 0.30 - liftR * 0.14) * w;

        applyBone('thighl', thighL);
        applyBone('shinl', shinL);
        applyBone('footl', footL);
        applyBone('thighr', thighR);
        applyBone('shinr', shinR);
        applyBone('footr', footR);

        // Opposite-phase Arm Swing + Natural Forward Elbow Pump (plus gentle Idle breathing)
        const idleBreath = Math.sin(st.idleT * 2.2) * (1 - w);
        const armL = sinL * 0.68 * w + idleBreath * 0.04;
        const armR = sinR * 0.68 * w - idleBreath * 0.04;
        const elbowL = (-0.24 - Math.max(0, -sinL) * 0.56) * w - 0.10 * (1 - w);
        const elbowR = (-0.24 - Math.max(0, -sinR) * 0.56) * w - 0.10 * (1 - w);

        applyBone('upperarml', armL, 0, idleBreath * 0.03);
        applyBone('forearml', elbowL);
        applyBone('upperarmr', armR, 0, -idleBreath * 0.03);
        applyBone('forearmr', elbowR);

        // Real-life Double-Bounce Hip Lift (highest at passing/mid-stance, lowest at contact!) + pelvic twist & sway
        const stepBounce = (Math.abs(cosL) - 0.32) * 0.042 * w + idleBreath * 0.006;
        bones.hips.position.set(restHipsPos.x, restHipsPos.y, restHipsPos.z + stepBounce);
        applyBone('hips', 0, sinL * 0.14 * w, sinL * 0.055 * w);

        // Spine & Chest: natural forward walk lean + counter-twist opposite to hips
        applyBone('spine', -0.10 * w + idleBreath * 0.025, -sinL * 0.11 * w, -sinL * 0.03 * w);
        applyBone('chest', -0.04 * w, -sinL * 0.06 * w, 0);

        // Head: steady forward gaze during walk, cheerful curious look-around during Idle
        const idleLookY = Math.sin(st.idleT * 0.85) * 0.24 * (1 - w);
        const idleTiltX = Math.sin(st.idleT * 1.4) * 0.04 * (1 - w);
        applyBone('head', 0.09 * w + idleTiltX, idleLookY, 0);
    });

    return <primitive object={model} scale={CHAR_SCALE} />;
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
