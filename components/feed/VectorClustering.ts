// Algorithmic Vector & Spatial Clustering Engine for Thoughtspace Live Feed
// Transforms thought documents into high-dimensional semantic vectors and projects them
// into:
// 1. Globe coordinates (Spherical R=15 with cluster cohesion)
// 2. Flat coordinates (2D star-chart plane)
// 3. Reel coordinates (Linear column sequence)

export interface SpatialThoughtNode {
  id: string;
  title: string;
  summary: string;
  category: string;
  authorAnonymousId: string;
  expiresAt: number;
  createdAt: number;
  reactionCount: number;
  reactions: {
    resonate?: number;
    inspire?: number;
    reflect?: number;
    empathy?: number;
  };
  strokesCount: number;
  canvasPayload: string;

  // Spatial Coordinates
  globePos: { x: number; y: number; z: number };
  flatPos: { x: number; y: number; z: number };
  reelPos: { x: number; y: number; z: number };

  // Clustering metadata
  clusterId: number;
  clusterColor: string;
  nearestNeighborIds: string[];
}

export interface ClusterInfo {
  id: number;
  name: string;
  color: string;
  centroid: { x: number; y: number; z: number };
  nodeCount: number;
}

// Aesthetic Cosmic Color Palette for Thought Clusters
const CLUSTER_PALETTE = [
  '#38BDF8', // Cyan / Sky (Tech, Systems)
  '#F472B6', // Pink / Rose (Introspection, Emotion)
  '#FBBF24', // Amber / Gold (Creativity, Vision)
  '#34D399', // Emerald / Mint (Nature, Growth)
  '#A78BFA', // Violet / Lavender (Philosophy, Deep Thought)
  '#FB923C', // Orange (Ventures, Action)
];

// Hash function to extract a pseudo-semantic 32-dim term frequency vector from text
function computeTermVector(text: string): number[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const vec = new Array(32).fill(0);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) % 32;
    }
    vec[Math.abs(hash)] += 1;
  }
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

// Cosine distance between vectors
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
  }
  return 1 - dot;
}

/**
 * Computes Spatial Coordinates (Globe, Flat, Reel) and clusters thoughts by semantic similarity
 */
export function buildSpatialClusters(thoughts: any[]): {
  nodes: SpatialThoughtNode[];
  clusters: ClusterInfo[];
  filaments: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; color: string }[];
} {
  if (!thoughts || thoughts.length === 0) {
    return { nodes: [], clusters: [], filaments: [] };
  }

  // 1. Compute vectors for all thoughts
  const thoughtVectors = thoughts.map((t) => ({
    thought: t,
    vector: computeTermVector(`${t.title || ''} ${t.summary || ''} ${t.category || ''}`),
  }));

  // 2. Derive 4 to 6 Cluster Centroids
  const k = Math.min(6, Math.max(2, Math.floor(thoughts.length / 3) || 1));
  const clusterCenters: number[][] = [];
  for (let i = 0; i < k; i++) {
    const seedIndex = Math.floor((i * thoughtVectors.length) / k);
    clusterCenters.push([...thoughtVectors[seedIndex].vector]);
  }

  // Quick 3-iteration K-means
  const assignments: number[] = new Array(thoughts.length).fill(0);
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < thoughtVectors.length; i++) {
      let bestDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = cosineDistance(thoughtVectors[i].vector, clusterCenters[c]);
        if (d < bestDist) {
          bestDist = d;
          bestCluster = c;
        }
      }
      assignments[i] = bestCluster;
    }
  }

  // Sphere parameters
  const GLOBE_RADIUS = 15;
  const FLAT_SCALE = 18;

  // 3. Cluster Anchor Angles on the Globe
  const clusterSphericalAnchors = clusterCenters.map((_, idx) => {
    const phi = Math.acos(-1 + (2 * idx) / k);
    const theta = Math.sqrt(k * Math.PI) * idx;
    return { phi, theta };
  });

  const nodes: SpatialThoughtNode[] = [];
  const filaments: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; color: string }[] = [];

  thoughtVectors.forEach((item, index) => {
    const cId = assignments[index];
    const color = CLUSTER_PALETTE[cId % CLUSTER_PALETTE.length];
    const anchor = clusterSphericalAnchors[cId];

    // Jitter around cluster anchor on 3D Globe
    const phi = anchor.phi + (Math.random() - 0.5) * 0.7;
    const theta = anchor.theta + (Math.random() - 0.5) * 0.9;
    const r = GLOBE_RADIUS + (Math.random() - 0.5) * 1.5;

    const gx = r * Math.sin(phi) * Math.cos(theta);
    const gy = r * Math.cos(phi);
    const gz = r * Math.sin(phi) * Math.sin(theta);

    // 2D Flat Plane coordinates
    const clusterAngle = (cId / k) * Math.PI * 2;
    const clusterCenterX = Math.cos(clusterAngle) * (FLAT_SCALE * 0.7);
    const clusterCenterY = Math.sin(clusterAngle) * (FLAT_SCALE * 0.6);
    const fx = clusterCenterX + (Math.random() - 0.5) * 8;
    const fy = clusterCenterY + (Math.random() - 0.5) * 8;
    const fz = 0;

    // Linear Reel coordinates: arranged in a smooth linear column
    const rx = 0;
    const ry = (index - thoughts.length / 2) * 2.8;
    const rz = 0;

    nodes.push({
      id: item.thought.id,
      title: item.thought.title || 'Untitled Thought',
      summary: item.thought.summary || '',
      category: item.thought.category || 'Stream',
      authorAnonymousId: item.thought.authorAnonymousId || '',
      expiresAt: item.thought.expiresAt || Date.now() + 86400000,
      createdAt: item.thought.createdAt || Date.now(),
      reactionCount: item.thought.reactionCount || 0,
      reactions: item.thought.reactions || {},
      strokesCount: item.thought.strokesCount || 0,
      canvasPayload: item.thought.canvasPayload || '',
      globePos: { x: gx, y: gy, z: gz },
      flatPos: { x: fx, y: fy, z: fz },
      reelPos: { x: rx, y: ry, z: rz },
      clusterId: cId,
      clusterColor: color,
      nearestNeighborIds: [],
    });
  });

  // Find nearest neighbors to draw cosmic constellation filaments
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].clusterId === nodes[j].clusterId) {
        const dx = nodes[i].globePos.x - nodes[j].globePos.x;
        const dy = nodes[i].globePos.y - nodes[j].globePos.y;
        const dz = nodes[i].globePos.z - nodes[j].globePos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 8) {
          nodes[i].nearestNeighborIds.push(nodes[j].id);
          filaments.push({
            from: nodes[i].globePos,
            to: nodes[j].globePos,
            color: nodes[i].clusterColor,
          });
        }
      }
    }
  }

  // Summary of clusters
  const clusters: ClusterInfo[] = [];
  for (let i = 0; i < k; i++) {
    const clusterNodes = nodes.filter((n) => n.clusterId === i);
    if (clusterNodes.length > 0) {
      const dominantCategory = clusterNodes[0].category || `Cluster ${i + 1}`;
      clusters.push({
        id: i,
        name: dominantCategory,
        color: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
        centroid: {
          x: clusterNodes.reduce((acc, n) => acc + n.globePos.x, 0) / clusterNodes.length,
          y: clusterNodes.reduce((acc, n) => acc + n.globePos.y, 0) / clusterNodes.length,
          z: clusterNodes.reduce((acc, n) => acc + n.globePos.z, 0) / clusterNodes.length,
        },
        nodeCount: clusterNodes.length,
      });
    }
  }

  return { nodes, clusters, filaments };
}
