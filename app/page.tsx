'use client';

import dynamic from 'next/dynamic';

const InfiniteStylusCanvas = dynamic(
  () => import('@/components/InfiniteStylusCanvas').then((mod) => mod.InfiniteStylusCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-screen h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-black/20 border-t-black/80 rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function HomePage() {
  return (
    <main id="app-root" className="w-screen h-screen overflow-hidden m-0 p-0 bg-[#FAF9F6] touch-none">
      <InfiniteStylusCanvas />
    </main>
  );
}

