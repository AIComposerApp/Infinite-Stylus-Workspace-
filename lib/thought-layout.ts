import * as THREE from 'three';
import { SharedThoughtDocument } from './thoughtspace-service';

export interface SpatialThoughtNode {
  data: SharedThoughtDocument;
  globeCoords: THREE.Vector3;
  flatCoords: THREE.Vector3;
  reelCoords: THREE.Vector3;
  color: string;
  clusterIndex: number;
}

const CLUSTER_COLORS: Record<string, string> = {
  Introspection: '#38bdf8', // Sky blue
  'Creative Vision': '#a855f7', // Purple
  'Ventures & Work': '#f59e0b', // Amber
  Engineering: '#10b981', // Emerald
  'Philosophy & Study': '#ec4899', // Rose
  General: '#818cf8', // Indigo
};

// Simple pseudo-hash from string to float [0, 1)
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

export function computeSpatialNodes(thoughts: SharedThoughtDocument[]): SpatialThoughtNode[] {
  const count = thoughts.length;
  if (count === 0) return [];

  const globeRadius = 14;
  const flatSpread = 16;
  const reelSpacing = 4.2;

  // Group thoughts by category for cluster center offsets
  const categories = Array.from(new Set(thoughts.map((t) => t.category || 'General')));

  return thoughts.map((thought, index) => {
    const category = thought.category || 'General';
    const clusterIdx = Math.max(0, categories.indexOf(category));
    const totalClusters = Math.max(1, categories.length);

    // 1. Globe Coordinates (Spherical Fibonacci with cluster bias)
    // Fibonacci sphere distribution ensures even, aesthetic distribution
    const phi = Math.acos(1 - (2 * (index + 0.5)) / Math.max(count, 1));
    const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5);

    // Cluster center angle on sphere
    const clusterAngle = (clusterIdx / totalClusters) * Math.PI * 2;
    const clusterZ = Math.sin((clusterIdx / totalClusters) * Math.PI);

    // Blend fibonacci sphere with cluster affinity
    const baseGx = globeRadius * Math.sin(phi) * Math.cos(theta);
    const baseGy = globeRadius * Math.cos(phi);
    const baseGz = globeRadius * Math.sin(phi) * Math.sin(theta);

    // Clustered sphere coords
    const gJitter = (hashString(thought.id) - 0.5) * 1.5;
    const globeCoords = new THREE.Vector3(
      baseGx + Math.cos(clusterAngle) * 1.2 + gJitter,
      baseGy + clusterZ * 1.2 + gJitter,
      baseGz + Math.sin(clusterAngle) * 1.2 + gJitter
    ).normalize().multiplyScalar(globeRadius + gJitter);

    // 2. 2D Flat Plane Coordinates (Galaxy / cluster layout on Z = 0)
    // Arrange in 2D spiral/cluster layout
    const clusterCenterX = Math.cos(clusterAngle) * (flatSpread * 0.55);
    const clusterCenterY = Math.sin(clusterAngle) * (flatSpread * 0.45);
    const localAngle = (hashString(thought.id + '_a') * Math.PI * 2);
    const localDist = hashString(thought.id + '_d') * (flatSpread * 0.35);

    const flatCoords = new THREE.Vector3(
      clusterCenterX + Math.cos(localAngle) * localDist,
      clusterCenterY + Math.sin(localAngle) * localDist,
      0 // Flat layout lies on Z=0
    );

    // 3. Linear Reel Coordinates (Vertical stack in front of camera at Z = 4)
    const reelCoords = new THREE.Vector3(
      0,
      -index * reelSpacing,
      4
    );

    // Determine color
    const color = CLUSTER_COLORS[category] || '#38bdf8';

    return {
      data: thought,
      globeCoords,
      flatCoords,
      reelCoords,
      color,
      clusterIndex: clusterIdx,
    };
  });
}
