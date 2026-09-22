'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const InfiniteStylusCanvas = dynamic(
  () => import('@/components/InfiniteStylusCanvas'),
  {
    ssr: false,
  }
);

export default function HomePage() {
  return (
    <main id="app-root" className="w-screen h-screen overflow-hidden m-0 p-0 bg-[#FAF9F6] touch-none">
      <Suspense
        fallback={
          <div className="w-screen h-screen flex items-center justify-center bg-[#FAF9F6]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-neutral-300 border-t-neutral-800 animate-spin" />
              <span className="text-xs text-neutral-400 font-medium tracking-wide">Loading Canvas...</span>
            </div>
          </div>
        }
      >
        <InfiniteStylusCanvas />
      </Suspense>
    </main>
  );
}


