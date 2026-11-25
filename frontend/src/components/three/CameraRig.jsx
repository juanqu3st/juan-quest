import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
    cameraOffset,
    getTerrainHeight,
    getWalkHeight,
    MAP_NODE_STOPS,
    PAHINGAHAN_STOP,
    WORLD_SCALE,
} from './worldConfig';

const S = WORLD_SCALE;

// Visual centers (offset from MAP_NODE_STOPS) + base scenic desktop camera offsets for each tour stop
const TOUR_MAP_STOPS = [
    { mapIndex: 1, centerOffset: [-1.2, 2.2, -3.2], camOffset: [-6.5, 11.5, 19.5] },
    { mapIndex: 2, centerOffset: [-2.2, 2.4, -3.0], camOffset: [-6.5, 12.0, 21.0] },
    { mapIndex: 3, centerOffset: [-1.0, 2.0, -3.0], camOffset: [-3.0, 11.5, 20.5] },
    { mapIndex: 4, centerOffset: [1.8, 2.2, -3.2], camOffset: [-4.0, 11.5, 20.0] },
    { mapIndex: 5, centerOffset: [0.3, 2.4, -3.4], camOffset: [3.5, 12.0, 21.0] },
];

function buildFlythroughWaypoints(aspect) {
    // On narrow portrait phones (aspect ~0.46), horizontal FOV shrinks to ~21 deg — zoom out ~2.1x so every building + guard fits cleanly!
    const isPortrait = aspect < 1;
    const stopZoom = isPortrait ? Math.min(2.2, Math.max(1.28, 0.96 / Math.max(0.42, aspect))) : 1.05;
    const overviewZoom = isPortrait ? Math.min(1.55, Math.max(1.15, 0.72 / Math.max(0.42, aspect))) : 1.0;

    const overviewLook = new THREE.Vector3(0, 2.0, 4 * S);
    const overviewPos = new THREE.Vector3(0, 32 * overviewZoom, 62 * overviewZoom);

    const stopWaypoints = TOUR_MAP_STOPS.map(({ mapIndex, centerOffset, camOffset }) => {
        const stop = MAP_NODE_STOPS[mapIndex] || MAP_NODE_STOPS[1];
        const groundY = getTerrainHeight(stop.x, stop.z);
        const look = new THREE.Vector3(
            stop.x + centerOffset[0],
            groundY + centerOffset[1],
            stop.z + centerOffset[2]
        );
        const pos = look
            .clone()
            .add(new THREE.Vector3(camOffset[0] * stopZoom, camOffset[1] * stopZoom, camOffset[2] * stopZoom));
        return { pos, look, mapIndex };
    });

    return [{ pos: overviewPos, look: overviewLook, mapIndex: 0 }, ...stopWaypoints];
}

function standPoint(mapNumber, aspect = 1.5) {
    const stop = MAP_NODE_STOPS[mapNumber] || MAP_NODE_STOPS[1];
    if (mapNumber === PAHINGAHAN_STOP) {
        // Center directly on Juan resting in the Duyan + his Kubo & Dream Cloud for both desktop & narrow portrait phones!
        const isPortrait = aspect < 1;
        return new THREE.Vector3(
            stop.x + (isPortrait ? -0.15 : 0.15),
            getWalkHeight(stop.x, stop.z) + (isPortrait ? 2.05 : 2.1),
            stop.z - (isPortrait ? 1.05 : 1.25)
        );
    }
    return new THREE.Vector3(stop.x, getWalkHeight(stop.x, stop.z) + 1.4, stop.z);
}

function cameraOffsetForStop(mapNumber, aspect) {
    if (mapNumber === PAHINGAHAN_STOP) {
        if (aspect < 1) {
            // Straight-on symmetric portrait framing so Juan, Duyan, Dream Cloud, and Bahay Kubo sit dead-center!
            const k = Math.min(1.55, Math.max(1.05, 0.62 / Math.max(0.38, aspect)));
            return new THREE.Vector3(-0.9, 8.2, 19.2).multiplyScalar(k);
        }
        return new THREE.Vector3(-2.4, 7.6, 15.6);
    }
    return cameraOffset(aspect);
}

export default function CameraRig({
    controlsRef,
    tourActive,
    guideStep = null,
    isWalking,
    startMapNumber,
    onTourCardChange,
    onTourFinish,
}) {
    const { camera, size } = useThree();
    const aspect = size.width / Math.max(1, size.height);
    const elapsedRef = useRef(0);
    const guideTimeRef = useRef(0);
    const lastStageRef = useRef(-1);
    const snappedInitialRef = useRef(false);
    const guideTmpPos = useRef(new THREE.Vector3());
    const guideTmpLook = useRef(new THREE.Vector3());
    const tourTmpLook = useRef(new THREE.Vector3());
    const totalDuration = 14.5;

    const tourWaypoints = useMemo(() => {
        const endLook = standPoint(startMapNumber, aspect);
        const endPos = endLook.clone().add(cameraOffset(aspect));
        return [...buildFlythroughWaypoints(aspect), { pos: endPos, look: endLook, mapIndex: 0 }];
    }, [aspect, startMapNumber]);

    const lastSnappedMapRef = useRef(null);
    const settleGoalRef = useRef(null);

    useEffect(() => {
        if (!tourActive && guideStep === null && !isWalking && controlsRef?.current) {
            if (!snappedInitialRef.current) {
                const p = standPoint(startMapNumber, aspect);
                camera.position.copy(p).add(cameraOffsetForStop(startMapNumber, aspect));
                controlsRef.current.target.copy(p);
                controlsRef.current.update();
                snappedInitialRef.current = true;
                lastSnappedMapRef.current = startMapNumber;
            } else if (lastSnappedMapRef.current !== startMapNumber) {
                const p = standPoint(startMapNumber, aspect);
                const pos = p.clone().add(cameraOffsetForStop(startMapNumber, aspect));
                if (startMapNumber === PAHINGAHAN_STOP) {
                    // Smooth scenic glide into the Pahingahan Kubo + Duyan view upon arrival
                    settleGoalRef.current = { pos, look: p, remaining: 1.5 };
                } else {
                    settleGoalRef.current = null;
                    camera.position.copy(pos);
                    controlsRef.current.target.copy(p);
                    controlsRef.current.update();
                }
                lastSnappedMapRef.current = startMapNumber;
            }
        }
    }, [tourActive, guideStep, isWalking, startMapNumber, camera, controlsRef, aspect]);

    useEffect(() => {
        if (tourActive) {
            elapsedRef.current = 0;
            lastStageRef.current = 0;
            onTourCardChange?.(0);
        }
    }, [tourActive, onTourCardChange]);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);

        // Live cinematic camera transitions synced to Juan Osong's 5-step onboarding tutorial!
        if (!tourActive && guideStep !== null) {
            guideTimeRef.current += dt;
            const gt = guideTimeRef.current;
            const dstPos = guideTmpPos.current;
            const dstLook = guideTmpLook.current;

            const isPortrait = aspect < 1;

            if (guideStep === 0) {
                // Step 1: Warm welcoming shot framing Mapa 1 & Pulis cleanly in the center window
                const p = standPoint(1);
                dstPos.copy(p).add(cameraOffset(aspect));
                dstPos.x += Math.sin(gt * 0.45) * 1.4;
                dstLook.copy(p);
                if (isPortrait) dstLook.y -= 0.4;
            } else if (guideStep === 1) {
                // Step 2: Panoramic sunlit overview framing the barrio & patintero kids cleanly below the 5-map card
                const pan = Math.sin(gt * 0.55) * (isPortrait ? 10 : 14);
                const zoomK = isPortrait ? 1.38 : 1.0;
                dstPos.set(pan, 34 * zoomK, 68 * zoomK);
                dstLook.set(pan * 0.22, isPortrait ? 1.4 : 2.2, isPortrait ? 9 : 8);
            } else if (guideStep === 2) {
                // Step 3: Smooth close-in on Mapa 1: Ang Curfew (Bahay na Bato + Pulis) — pulled back slightly on portrait mobile
                const m1 = standPoint(1);
                if (isPortrait) {
                    dstPos.set(m1.x - 4.8, m1.y + 9.4, m1.z + 18.6);
                    dstLook.set(m1.x - 1.4, m1.y + 0.9, m1.z - 2.0);
                } else {
                    dstPos.set(m1.x - 4.5, m1.y + 7.5, m1.z + 13.5);
                    dstLook.set(m1.x - 1.8, m1.y + 1.5, m1.z - 2.2);
                }
            } else if (guideStep === 3) {
                // Step 4: Gentle barrio showcase framing Mapa 2 (Kuwartel + Flag + Guwardiya) centered between cards
                const m2 = standPoint(2);
                if (isPortrait) {
                    dstPos.set(m2.x - 4.2 + Math.sin(gt * 0.5) * 2.0, m2.y + 11.4, m2.z + 21.8);
                    dstLook.set(m2.x - 0.6, m2.y + 0.9, m2.z - 1.5);
                } else {
                    dstPos.set(m2.x - 4 + Math.sin(gt * 0.5) * 2.5, m2.y + 10.5, m2.z + 18);
                    dstLook.set(m2.x, m2.y + 1.2, m2.z - 1.5);
                }
            } else {
                // Step 5: Smoothly frame Mapa 1 (matches "Unang Hamon: Mapa 1" narration & card!)
                const p = standPoint(1);
                dstPos.copy(p).add(cameraOffset(aspect));
                dstLook.copy(p);
                if (isPortrait) dstLook.y -= 0.35;
            }

            const ease = Math.min(1, dt * 3.2);
            camera.position.lerp(dstPos, ease);
            if (controlsRef?.current) {
                controlsRef.current.target.lerp(dstLook, ease);
                controlsRef.current.update();
            } else {
                camera.lookAt(dstLook);
            }
            return;
        }

        if (!tourActive) {
            const goal = settleGoalRef.current;
            if (goal && !isWalking && guideStep === null) {
                goal.remaining -= dt;
                const ease = Math.min(1, dt * 3.4);
                camera.position.lerp(goal.pos, ease);
                if (controlsRef?.current) {
                    controlsRef.current.target.lerp(goal.look, ease);
                    controlsRef.current.update();
                }
                if (goal.remaining <= 0 || camera.position.distanceTo(goal.pos) < 0.08) {
                    settleGoalRef.current = null;
                }
            }
            return;
        }

        elapsedRef.current += delta;
        const progress = Math.min(1, elapsedRef.current / totalDuration);

        const all = tourWaypoints;
        const scaled = progress * (all.length - 1);
        const idx = Math.min(all.length - 2, Math.floor(scaled));
        const localT = scaled - idx;
        const smoothT = localT * localT * (3 - 2 * localT);
        const from = all[idx];
        const to = all[idx + 1];

        camera.position.lerpVectors(from.pos, to.pos, smoothT);
        const look = tourTmpLook.current.lerpVectors(from.look, to.look, smoothT);
        if (controlsRef?.current) {
            controlsRef.current.target.copy(look);
            controlsRef.current.update();
        } else {
            camera.lookAt(look);
        }

        const card = localT > 0.38 ? to.mapIndex : from.mapIndex;
        if (card !== lastStageRef.current) {
            lastStageRef.current = card;
            onTourCardChange?.(card);
        }
        if (progress >= 1) {
            snappedInitialRef.current = true;
            onTourFinish?.();
        }
    });

    return (
        <OrbitControls
            ref={controlsRef}
            enabled={!tourActive && guideStep === null && !isWalking}
            onStart={() => {
                settleGoalRef.current = null;
            }}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.25}
            minPolarAngle={0.3}
            minDistance={8}
            maxDistance={aspect < 1 ? 95 : 70}
        />
    );
}
