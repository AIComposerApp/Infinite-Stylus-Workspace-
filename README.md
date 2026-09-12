# Infinite Stylus Workspace

> An infinite stylus brainstorming canvas designed for seamless ink flow, organic handwriting AI assistance, gesture-driven sentence extraction, and liquid-smooth navigation.

---

## Overview

**Infinite Stylus Workspace** is a high-performance web canvas tailored for tablets, Apple Pencil, styluses, and mouse/touch input. It pairs the raw tactile friction and beauty of pen-on-paper with multi-model AI thought continuation directly on the canvas.

---

## Features That Are Fully Functional

### 1. High-Performance Infinite Canvas
- **Sub-pixel Smooth Inking**: Bézier curve interpolation with dynamic velocity and pressure-sensitive stroke width taper.
- **Infinite Pan & Zoom**: Pan using two-finger drag or spacebar/hand tool with infinite coordinate space and custom subtle dot grid.
- **Ergonomic Undo / Redo**: History stack preserving vector strokes with clean stroke batching.
- **Precision Clear**: Quick canvas clear with confirmation state.

### 2. Stylus Gestures & Sentence Copy Extraction
- **Surround-to-Select Gesture**: Draw a quick line or stroke directly through or around handwritten strokes or thought bubbles to highlight them.
- **One-Tap Floating Action**: Automatically detects the selected ink cluster and displays a floating pill offering **Copy as Text** or **Ask AI**.
- **Clipboard Integration**: Smooth clipboard copying with momentary tactile checkmark indicator.

### 3. Organic AI Assistant & Handwriting Thought Bubbles
- **Multi-Model Fallback Engine**: Server-side proxy through `/api/gemini/assist` backed by `gemini-3.8-flash`, auto-failing over to `gemini-3.1-flash-lite` and `gemini-flash-latest` during capacity spikes.
- **Canvas-Native Thought Bubbles**: AI inner thoughts render organically in simulated handwriting ink onto the canvas.
- **Loading Animation**: Independent bouncing dots with zero stroke artifacts while waiting for stream generation.
- **Off-Screen Radar / Indicator**: When thoughts appear outside the user's current viewport, an off-screen radar bubble gently pulses with distance and direction indicators. Clicking it smoothly pans the viewport directly to the thought.

### 4. Liquid Bottom Dock
- **Momentum Physics Dock**: Smooth horizontal scrolling with velocity decay, elastic boundary snapback, and bounce damping.
- **Tool Palette**: Pen, eraser, pan/hand tool, color switcher (Carbon Black, Oxford Blue, Crimson, Moss Green), line weight adjustments.
- **PDF & Image Export**: High-resolution multi-page PDF generation via `jspdf` and high-fidelity PNG rasterization.
- **Dynamic Icons**: Hand-crafted contrast icons with preload optimization for instant rendering.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **Animation**: Motion (`motion/react`)
- **Icons**: Lucide React + Custom High-DPI Vector/Raster Glyphs
- **Exporting**: jsPDF & HTML Canvas 2D Context API
- **AI SDK**: `@google/genai` (Google Gen AI SDK)

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm, pnpm, or yarn
- Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/infinite-stylus-workspace.git
   cd infinite-stylus-workspace
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Add your Gemini API Key:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Build & Deployment

To compile for production:
```bash
npm run build
npm run start
```
