'use client';

import dynamic from 'next/dynamic';

const InfiniteStylusCanvas = dynamic(
  () => import('@/components/InfiniteStylusCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#FAF9F6] text-[#141414]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-stone-300 border-t-stone-800 animate-spin" />
          <span className="text-xs font-mono tracking-wider text-stone-500 uppercase">Loading Thoughtspace...</span>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  return (
    <main id="app-root" className="w-screen h-screen overflow-hidden m-0 p-0 bg-[#FAF9F6]">
      <InfiniteStylusCanvas />
    </main>
  );
}



