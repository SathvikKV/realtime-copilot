"use client";

import React from "react";
import Card from "@/components/ui/Card"; // ✅ lowercase import (matches file path on most systems)

interface VideoPaneProps {
  // ✅ allow nullable HTMLVideoElement ref
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isConnected: boolean;
}

// ✅ no change to behavior — just typing fix
const VideoPane = React.forwardRef<HTMLDivElement, VideoPaneProps>(
  ({ videoRef, isConnected }, ref) => {
    return (
      <Card
        ref={ref}
        className="relative overflow-hidden bg-black/60 border-white/10"
        style={{ boxShadow: "0 0 20px rgba(59, 130, 246, 0.1)" }}
      >
        <div className="relative w-full aspect-video bg-black/80 flex items-center justify-center">
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>} // safe cast
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {!isConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-sky-500 animate-spin mx-auto mb-3" />
                <p className="text-white/60 text-sm">Waiting for connection...</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  }
);

VideoPane.displayName = "VideoPane";
export default VideoPane;
