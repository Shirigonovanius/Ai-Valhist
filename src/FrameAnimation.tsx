import { useEffect, useRef, useState } from 'react';

const FRAME_COUNT = 90; // ezgif-frame-090.jpg is the last one
const FPS = 24;

export const FrameAnimation = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [progress, setProgress] = useState(0);
    const imagesRef = useRef<HTMLImageElement[]>([]);
    const reqRef = useRef<number>();

    useEffect(() => {
        let isMounted = true;
        const loadImages = async () => {
            const imgs: HTMLImageElement[] = [];
            let loadedCount = 0;

            for (let i = 1; i <= FRAME_COUNT; i++) {
                const img = new Image();
                // pad with zeros: 1 -> 001, 10 -> 010
                const num = String(i).padStart(3, '0');
                img.src = `/animation/ezgif-frame-${num}.jpg`;

                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve; // Continue even if error
                });

                if (!isMounted) return;

                imgs.push(img);
                loadedCount++;
                setProgress(Math.round((loadedCount / FRAME_COUNT) * 100));
            }

            imagesRef.current = imgs;
            setLoaded(true);
        };

        loadImages();

        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (!loaded || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match first frame
        if (imagesRef.current[0]) {
            canvas.width = imagesRef.current[0].width;
            canvas.height = imagesRef.current[0].height;
        }

        let frameIndex = 0;
        let lastTime = 0;
        const interval = 1000 / FPS;

        const animate = (time: number) => {
            if (time - lastTime > interval) {
                const img = imagesRef.current[frameIndex];
                if (img && img.complete) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                }

                frameIndex = (frameIndex + 1) % imagesRef.current.length;
                lastTime = time;
            }
            reqRef.current = requestAnimationFrame(animate);
        };

        reqRef.current = requestAnimationFrame(animate);

        return () => {
            if (reqRef.current) cancelAnimationFrame(reqRef.current);
        };
    }, [loaded]);

    if (!loaded) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-xl font-mono text-cyan-400">Loading Neuro-Link... {progress}%</div>
            </div>
        );
    }

    return (
        <div className="relative border-2 border-cyan-500/50 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.3)]">
            <canvas ref={canvasRef} className="w-full h-auto block" />
            <div className="absolute bottom-2 right-2 text-xs text-cyan-500/80 font-mono">
                SYSTEM: ONLINE
            </div>
        </div>
    );
};
