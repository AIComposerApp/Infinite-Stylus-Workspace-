'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SharedThoughtDocument } from '@/lib/thoughtspace-service';
import { ArrowLeft } from 'lucide-react';
import { GlobalViewBar, GlobalViewMode } from '@/components/navigation/GlobalViewBar';

interface DistantGlobeCosmosProps {
  thoughts: SharedThoughtDocument[];
  onBackTo2D: () => void;
  onSelectThought: (thought: SharedThoughtDocument) => void;
  onSwitchView?: (view: GlobalViewMode) => void;
}

// Category palette mapped directly to 2D Map categories
const CATEGORY_COLORS: Record<string, { hex: number; css: string }> = {
  'Engineering': { hex: 0x2563eb, css: '#2563eb' },
  'Creative Vision': { hex: 0xd97706, css: '#d97706' },
  'Introspection': { hex: 0x059669, css: '#059669' },
  'Philosophy & Study': { hex: 0x7c3aed, css: '#7c3aed' },
  'Ventures & Work': { hex: 0xdc2626, css: '#dc2626' },
};
const DEFAULT_COLOR = { hex: 0x4f46e5, css: '#4f46e5' };

export const DistantGlobeCosmos: React.FC<DistantGlobeCosmosProps> = ({
  thoughts,
  onBackTo2D,
  onSelectThought,
  onSwitchView,
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

    // Helper: Dynamic Billboard Text Sprite
    const createBillboardSprite = (title: string, category: string, accentHex: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 140;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 140);
        // Rounded card background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.roundRect(12, 16, 488, 108, 28);
        ctx.fill();

        // Accent border
        ctx.strokeStyle = accentHex;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Category Tag
        ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = accentHex;
        ctx.textAlign = 'left';
        ctx.fillText(category.toUpperCase(), 36, 52);

        // Thought Title
        ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#171717';
        const truncated = title.length > 25 ? title.slice(0, 23) + '…' : title;
        ctx.fillText(truncated, 36, 92);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(4.8, 1.3, 1);
      return sprite;
    };

    // 7. Thought nodes on sphere with dynamic billboard text labels
    const nodeMeshes: THREE.Mesh[] = [];
    const labelSprites: {
      sprite: THREE.Sprite;
      nodeMesh: THREE.Mesh;
      baseScale: { x: number; y: number };
    }[] = [];

    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    thoughts.forEach((thought, i) => {
      const y = 1 - (i / Math.max(1, thoughts.length - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const px = Math.cos(theta) * radiusAtY * sphereRadius;
      const py = y * sphereRadius;
      const pz = Math.sin(theta) * radiusAtY * sphereRadius;

      const catConfig = CATEGORY_COLORS[thought.category] || DEFAULT_COLOR;
      const color = catConfig.hex;

      const nodeGeo = new THREE.SphereGeometry(0.65, 16, 16);
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

      const haloGeo = new THREE.RingGeometry(0.8, 1.05, 24);
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

      // Add dynamic billboard text sprite grounded next to the node
      const sprite = createBillboardSprite(thought.title, thought.category, catConfig.css);
      const offsetPos = new THREE.Vector3(px, py, pz).normalize().multiplyScalar(sphereRadius + 1.6);
      sprite.position.copy(offsetPos);
      scene.add(sprite);

      labelSprites.push({
        sprite,
        nodeMesh,
        baseScale: { x: 4.8, y: 1.3 },
      });
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

      // Dynamic scaling & fading of billboard labels relative to camera viewpoint
      const camPosNorm = camera.position.clone().normalize();
      for (const item of labelSprites) {
        const nodeDir = item.nodeMesh.position.clone().normalize();
        const dot = nodeDir.dot(camPosNorm);

        // Fade out smoothly as globe rotates node into the background
        if (dot > 0.12) {
          const targetOpacity = Math.min(0.92, (dot - 0.12) * 1.8);
          item.sprite.material.opacity = targetOpacity;
          item.sprite.visible = true;

          // Scale smoothly with distance from camera
          const dist = camera.position.distanceTo(item.nodeMesh.position);
          const scaleMod = Math.max(0.7, Math.min(1.3, dist / 28));
          item.sprite.scale.set(item.baseScale.x * scaleMod, item.baseScale.y * scaleMod, 1);
        } else {
          item.sprite.material.opacity = 0;
          item.sprite.visible = false;
        }
      }

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

  const handleSwitchGlobalView = (mode: GlobalViewMode) => {
    if (mode === 'cosmos') return;
    if (onSwitchView) {
      onSwitchView(mode);
    } else if (mode === 'canvas') {
      window.location.href = '/';
    } else {
      onBackTo2D();
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#FAF9F6] overflow-hidden select-none">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Unified Global View Switcher: Top Centered Anchor */}
      <GlobalViewBar
        activeView="cosmos"
        onSwitchView={handleSwitchGlobalView}
      />

      {/* Minimal Top Left: Back Navigation Pill */}
      <div className="fixed top-3 left-4 z-40 pointer-events-auto">
        <button
          type="button"
          onClick={onBackTo2D}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-neutral-800 border border-neutral-200/90 shadow-xs backdrop-blur-md text-xs font-semibold hover:bg-neutral-50 transition-colors cursor-pointer active:scale-95"
          title="Back to 2D Map"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">2D Map</span>
        </button>
      </div>
    </div>
  );
};
