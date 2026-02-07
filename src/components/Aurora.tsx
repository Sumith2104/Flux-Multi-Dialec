"use client";

import { useEffect, useRef } from "react";

interface AuroraProps {
    colorStops?: string[];
    amplitude?: number;
    blend?: number;
    speed?: number;
}

export default function Aurora({
    colorStops = ["#FF4B29", "#FF8F29", "#111111"],
    amplitude = 1.0,
    speed = 0.5,
}: AuroraProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let t = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const draw = () => {
            if (!canvas || !ctx) return;

            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);

            // Create gradient
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            colorStops.forEach((color, index) => {
                gradient.addColorStop(index / (colorStops.length - 1), color);
            });

            ctx.fillStyle = gradient;
            ctx.filter = "blur(100px)"; // Heavy blur for aurora effect
            ctx.globalAlpha = 0.4;

            // Draw waving shapes
            ctx.beginPath();
            const yOffset = height * 0.5;

            for (let x = 0; x <= width; x += 10) {
                const y = yOffset + Math.sin(x * 0.005 + t) * (height * 0.2 * amplitude)
                    + Math.sin(x * 0.01 - t * 0.5) * (height * 0.1);
                ctx.lineTo(x, y);
            }

            ctx.lineTo(width, 0);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.fill();

            t += speed * 0.01;
            animationFrameId = requestAnimationFrame(draw);
        };

        resize();
        window.addEventListener("resize", resize);
        draw();

        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [colorStops, amplitude, speed]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-0 h-full w-full pointer-events-none opacity-60"
        />
    );
}
