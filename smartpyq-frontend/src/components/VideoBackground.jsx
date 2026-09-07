import React, { useRef, useEffect, useState } from "react";

const VideoBackground = () => {
  const videoRef = useRef(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (videoRef.current && prefersReducedMotion) {
      videoRef.current.pause();
    } else if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [prefersReducedMotion]);

  const handlePlaying = () => setIsPlaying(true);

  return (
    <div className="video-bg" aria-hidden="true">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="video-bg__video"
        style={{ opacity: isPlaying ? 1 : 0, visibility: isPlaying ? "visible" : "hidden", transition: "opacity 0.5s ease, visibility 0s 0.5s" }}
        onPlaying={handlePlaying}
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div className="video-bg__overlay" />
      <div className="video-bg__vignette" />
    </div>
  );
};

export default VideoBackground;
