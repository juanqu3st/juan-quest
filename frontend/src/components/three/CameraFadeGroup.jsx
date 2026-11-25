import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const _box = new THREE.Box3();

/**
 * Exact ray-segment vs padded AABB intersection (slab method) between camera (A) and player (B).
 * Returns:
 *   0 = clear (solid opaque 1.0)
 *   1 = blocking line-of-sight between camera and character (ultra-sheer fade)
 *   2 = camera inside or right up against the object's bounds (near-invisible)
 */
function aabbBlockLevel(ax, ay, az, abx, aby, abz, minX, minY, minZ, maxX, maxY, maxZ, pad, lensMargin) {
    // 1. Check if camera lens is inside or pressed right up against the object
    if (
        ax >= minX - lensMargin &&
        ax <= maxX + lensMargin &&
        ay >= minY - lensMargin &&
        ay <= maxY + lensMargin &&
        az >= minZ - lensMargin &&
        az <= maxZ + lensMargin
    ) {
        return 2;
    }

    // 2. Slab intersection test on padded AABB for segment P(t) = A + t * (B - A), t in [0.0, 0.90]
    const bMinX = minX - pad;
    const bMinY = minY - pad * 0.5;
    const bMinZ = minZ - pad;
    const bMaxX = maxX + pad;
    const bMaxY = maxY + pad * 0.6;
    const bMaxZ = maxZ + pad;

    let tmin = 0.0;
    let tmax = 0.84;

    // X slab
    if (Math.abs(abx) < 1e-6) {
        if (ax < bMinX || ax > bMaxX) return 0;
    } else {
        const inv = 1 / abx;
        let t1 = (bMinX - ax) * inv;
        let t2 = (bMaxX - ax) * inv;
        if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return 0;
    }

    // Y slab
    if (Math.abs(aby) < 1e-6) {
        if (ay < bMinY || ay > bMaxY) return 0;
    } else {
        const inv = 1 / aby;
        let t1 = (bMinY - ay) * inv;
        let t2 = (bMaxY - ay) * inv;
        if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return 0;
    }

    // Z slab
    if (Math.abs(abz) < 1e-6) {
        if (az < bMinZ || az > bMaxZ) return 0;
    } else {
        const inv = 1 / abz;
        let t1 = (bMinZ - az) * inv;
        let t2 = (bMaxZ - az) * inv;
        if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return 0;
    }

    return 1;
}

/**
 * Universal zero-allocation camera-occlusion transparency wrapper for any 3D prop,
 * tree, kubo, finish arch, fiesta banner, or map landmark (including Mapa 5!).
 *
 * - Lazily clones shared materials ONLY the first time an object actually blocks the camera,
 *   keeping memory & shader overhead at 0 for non-occluding props.
 * - Restores exact original `transparent`, `opacity`, and `depthWrite` once clear so shadows
 *   and sorting stay 100% sharp.
 */
export default function CameraFadeGroup({
    playerPosRef,
    tourActive = false,
    pad = 0.45,
    shrinkXZ = 1.0,
    lensMargin = 1.8,
    fadeOpacity = 0.1,
    nearOpacity = 0.04,
    children,
}) {
    const groupRef = useRef();
    const stateRef = useRef({
        opacity: 1,
        boundsReady: false,
        meshCount: 0,
        scanCooldown: 0,
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
        clonedMeshSet: new WeakSet(),
        meshRecords: [], // { mesh, materials: [{ mat, origTransparent, origOpacity, origDepthWrite }] }
    });

    useEffect(() => {
        return () => {
            const st = stateRef.current;
            for (const rec of st.meshRecords) {
                for (const entry of rec.materials) {
                    entry.mat?.dispose?.();
                }
            }
            st.meshRecords = [];
            st.clonedMeshSet = new WeakSet();
            st.boundsReady = false;
            st.meshCount = 0;
        };
    }, []);

    useFrame(({ camera }, delta) => {
        const g = groupRef.current;
        if (!g) return;
        const st = stateRef.current;

        // Defensive lazy init so Vite Fast Refresh / HMR never hits undefined properties on preserved refs
        if (!st.clonedMeshSet) st.clonedMeshSet = new WeakSet();
        if (!Array.isArray(st.meshRecords)) st.meshRecords = [];
        if (typeof st.meshCount !== 'number') st.meshCount = 0;
        if (typeof st.scanCooldown !== 'number') st.scanCooldown = 0;
        if (!st.bounds) st.bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

        // Periodically verify mesh count so async Suspense GLBs that mount after sibling meshes update bounds cleanly
        st.scanCooldown -= 1;
        if (st.scanCooldown <= 0) {
            st.scanCooldown = st.boundsReady ? 45 : 10;
            let count = 0;
            g.traverse((child) => {
                if (child.isMesh && child.geometry) count += 1;
            });
            if (count > 0 && count !== st.meshCount) {
                g.updateWorldMatrix(true, true);
                _box.setFromObject(g);
                if (!_box.isEmpty()) {
                    const cx = (_box.min.x + _box.max.x) * 0.5;
                    const cz = (_box.min.z + _box.max.z) * 0.5;
                    const hx = ((_box.max.x - _box.min.x) * 0.5) * shrinkXZ;
                    const hz = ((_box.max.z - _box.min.z) * 0.5) * shrinkXZ;
                    st.bounds.minX = cx - hx;
                    st.bounds.minY = _box.min.y;
                    st.bounds.minZ = cz - hz;
                    st.bounds.maxX = cx + hx;
                    st.bounds.maxY = _box.max.y;
                    st.bounds.maxZ = cz + hz;
                    st.boundsReady = true;
                    st.meshCount = count;
                }
            }
        }
        if (!st.boundsReady) return;

        const dt = Math.min(delta, 0.05);
        const lerpAlpha = Math.min(1, dt * 11.0);
        const playerPos = playerPosRef?.current;

        let blockLevel = 0;
        if (!tourActive && playerPos) {
            const ax = camera.position.x;
            const ay = camera.position.y;
            const az = camera.position.z;
            const abx = playerPos.x - ax;
            const aby = playerPos.y + 1.45 - ay;
            const abz = playerPos.z - az;
            if (abx * abx + aby * aby + abz * abz > 0.25) {
                const b = st.bounds;
                blockLevel = aabbBlockLevel(
                    ax,
                    ay,
                    az,
                    abx,
                    aby,
                    abz,
                    b.minX,
                    b.minY,
                    b.minZ,
                    b.maxX,
                    b.maxY,
                    b.maxZ,
                    pad,
                    lensMargin
                );
            }
        }

        const target = blockLevel === 2 ? nearOpacity : blockLevel === 1 ? fadeOpacity : 1.0;
        const prev = st.opacity;
        let next = prev + (target - prev) * lerpAlpha;
        if (next > 0.992 && target === 1.0) next = 1.0;
        else if (Math.abs(next - target) < 0.004) next = target;

        if (next === prev && st.meshRecords.length === st.meshCount) return;
        st.opacity = next;

        // Lazily clone any newly mounted mesh's materials only when fading starts so shared GLB caches stay untouched
        if (next < 0.992 && st.meshRecords.length < st.meshCount) {
            g.traverse((child) => {
                if (!child.isMesh || !child.material || st.clonedMeshSet.has(child)) return;
                const origArr = Array.isArray(child.material) ? child.material : [child.material];
                const clonedArr = origArr.map((m) => m.clone());
                const entries = clonedArr.map((mat, i) => ({
                    mat,
                    origTransparent: Boolean(origArr[i].transparent),
                    origOpacity: origArr[i].opacity ?? 1,
                    origDepthWrite: origArr[i].depthWrite ?? true,
                }));
                child.material = Array.isArray(child.material) ? clonedArr : clonedArr[0];
                st.clonedMeshSet.add(child);
                st.meshRecords.push({ mesh: child, materials: entries });
            });
        }

        const isFaded = next < 0.992;
        for (const rec of st.meshRecords) {
            rec.mesh.renderOrder = isFaded ? 4 : 0;
            for (const entry of rec.materials) {
                const { mat, origTransparent, origOpacity, origDepthWrite } = entry;
                mat.opacity = origOpacity * next;
                const nextTransparent = isFaded ? true : origTransparent;
                const nextDepthWrite = isFaded ? false : origDepthWrite;
                if (mat.transparent !== nextTransparent) {
                    mat.transparent = nextTransparent;
                    mat.needsUpdate = true;
                }
                mat.depthWrite = nextDepthWrite;
            }
        }
    });

    return <group ref={groupRef}>{children}</group>;
}
