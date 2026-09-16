'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SharedThoughtDocument } from '@/lib/thoughtspace-service';
import { ArrowLeft } from 'lucide-react';

interface DistantGlobeCosmosProps {
  thoughts: SharedThoughtDocument[];
  onBackTo2D: () => void;
  onSelectThought: (thought: SharedThoughtDocument) => void;
}

export const DistantGlobeCosmos: React.FC<DistantGlobeCosmosProps> = ({
  thoughts,
  onBackTo2D,
  onSelectThought,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene setup in warm light aesthetic (#FAF9F6)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfaf9f6);
    scene.fog = new THREE.FogExp2(0xfaf9f6, 0.012);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 6, 36);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.6;
    controls.minDistance = 10;
    controls.maxDistance = 60;

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x3b82f6, 1.4);
    dirLight.position.set(20, 30, 20);
    scene.add(dirLight);

    // 6. Minimal celestial wireframe sphere
    const sphereRadius = 14;
    const wireGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(sphereRadius, 3));
    const wireMat = new THREE.LineBasicMaterial({
      color: 0xcfd8dc,
      transparent: true,
      opacity: 0.45,
    });
    const wireGlobe = new THREE.LineSegments(wireGeo, wireMat);
    scene.add(wireGlobe);

    // Latitudinal rings
    for (let r = -2; r <= 2; r++) {
      const ringGeo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      const latY = (r / 3) * (sphereRadius * 0.85);
      const ringRadius = Math.sqrt(Math.max(1, sphereRadius * sphereRadius - latY * latY));
      for (let theta = 0; theta <= Math.PI * 2 + 0.1; theta += 0.1) {
        pts.push(new THREE.Vector3(Math.cos(theta) * ringRadius, latY, Math.sin(theta) * ringRadius));
      }
      ringGeo.setFromPoints(pts);
      const ringMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.6 });
      scene.add(new THREE.Line(ringGeo, ringMat));
    }

    // 7. Thought nodes on sphere
    const nodeMeshes: THREE.Mesh[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    thoughts.forEach((thought, i) => {
      const y = 1 - (i / Math.max(1, thoughts.length - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const px = Math.cos(theta) * radiusAtY * sphereRadius;
      const py = y * sphereRadius;
      const pz = Math.sin(theta) * radiusAtY * sphereRadius;

      const color =
        thought.category === 'Engineering'
          ? 0x2563eb
          : thought.category === 'Creative Vision'
          ? 0xd97706
          : thought.category === 'Introspection'
          ? 0x059669
          : 0x7c3aed;

      const nodeGeo = new THREE.SphereGeometry(0.6, 16, 16);
      const nodeMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.1,
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.set(px, py, pz);
      nodeMesh.userData = { thoughtId: thought.id };
      scene.add(nodeMesh);
      nodeMeshes.push(nodeMesh);

      const haloGeo = new THREE.RingGeometry(0.75, 0.95, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.position.set(px, py, pz);
      haloMesh.lookAt(0, 0, 0);
      scene.add(haloMesh);
    });

    // Raycast click
    const handlePointerDown = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const hits = raycaster.intersectObjects(nodeMeshes, false);

      if (hits.length > 0) {
        const clicked = hits[0].object as THREE.Mesh;
        const id = clicked.userData?.thoughtId;
        const found = thoughts.find((t) => t.id === id);
        if (found) {
          onSelectThought(found);
        }
      }
    };

    renderer.domElement.addEventListener('click', handlePointerDown);

    // Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      wireGlobe.rotation.y += 0.0012;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handlePointerDown);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [thoughts, onSelectThought]);

  return (
    <div className="relative w-screen h-screen bg-[#FAF9F6] overflow-hidden select-none">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Floating Header */}
      <header className="absolute top-4 inset-x-0 z-20 flex items-center justify-between px-4 sm:px-8 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onBackTo2D}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/95 hover:bg-white text-neutral-800 border border-neutral-200/90 shadow-md backdrop-blur-md transition-all text-xs font-semibold cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to 2D Map</span>
          </button>
        </div>

        <div className="pointer-events-auto px-4 py-1.5 rounded-2xl bg-white/90 border border-neutral-200/80 shadow-md backdrop-blur-md text-xs font-medium text-neutral-600">
          Cosmos Globe • Drag to rotate, click node to preview
        </div>
      </header>
    </div>
  );
};
