import React, { useState, useEffect, useCallback } from "react";
import { useIntroVideo } from "../contexts/IntroVideoContext";

const IntroVideo = () => {
  const { isActive, videoRef, skipIntro, completeIntro, replayIntro } =
    useIntroVideo();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    setIsLoaded(false);
    setHasError(false);
    setProgress(0);
  }, [isActive]);

  useEffect(() => {
    if (isActive && videoRef.current && isLoaded) {
      videoRef.current.play().catch(() => {});
    }
  }, [isActive, isLoaded, videoRef]);

  const handleLoadedData = useCallback(() => {
    if (!isActive) return;
    setIsLoaded(true);
  }, [isActive]);

  const handleError = useCallback(() => {
    if (!isActive) return;
    setHasError(true);
  }, [isActive]);

  const handleEnded = useCallback(() => completeIntro(), [completeIntro]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current?.duration != null) {
      const cur = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      setProgress(dur > 0 ? (cur / dur) * 100 : 0);
    }
  }, []);

  const handleSkip = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    skipIntro();
  }, [videoRef, skipIntro]);

  const handleReplay = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [videoRef]);

  const liveMessage =
    hasError
      ? "Intro video did not load"
      : isLoaded
        ? "Intro video playing"
        : "Intro video loading";

  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Intro video"
    >
      <div aria-live="polite" className="sr-only" id="intro-video-live">
        {liveMessage}
      </div>

      <div className="relative w-full max-w-3xl aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-contain rounded-xl shadow-2xl border border-white/10"
          muted
          playsInline
          preload="auto"
          onLoadedData={handleLoadedData}
          onError={handleError}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
        >
          <source src="/intro.mp4" type="video/mp4" />
        </video>

        {!isLoaded && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
            <div className="text-center">
              <div className="mx-auto mb-3 animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-white" />
              <p className="text-white/70 text-sm font-medium">
                Loading intro video...
              </p>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl">
            <div className="text-center max-w-sm p-6">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </div>
              <h3 className="text-white text-base font-semibold mb-1">
                Video did not load
              </h3>
              <p className="text-white/60 text-sm mb-5">
                The intro video could not be loaded, but you can still go to
                Home.
              </p>
              <button
                onClick={handleSkip}
                className="inline-flex items-center justify-center px-6 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/25 text-white text-sm font-semibold rounded-lg border border-white/10 hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-white/70"
              >
                Continue to Home
              </button>
            </div>
          </div>
        )}

        {isLoaded && !hasError && (
          <div>
            <div
              className="absolute top-0 left-0 right-0 p-4 sm:p-5"
              aria-hidden="true"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0) 100%)",
              }}
            >
              <div className="max-w-xl">
                <h2 className="text-white text-xl font-semibold tracking-tight leading-snug">
                  Welcome to SmartPYQ
                </h2>
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed max-w-lg">
                  Your home for previous-year questions, quick analysis, and
                  focused practice — built to help you revise faster.
                </p>
              </div>
            </div>

            <div
              className="absolute bottom-0 left-0 right-0 p-4 sm:p-5"
              aria-hidden="true"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0) 100%)",
              }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleReplay}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/25 text-white text-sm font-medium rounded-lg backdrop-blur-sm border border-white/10 hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-white/60"
                    aria-label="Replay intro video from start, stay on this screen"
                  >
                    Replay
                  </button>
                  <button
                    onClick={handleSkip}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 active:bg-white/80 shadow-lg transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-black/70 w-full sm:w-auto"
                    aria-label="Skip intro video and go to Home"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v12a9 9 0 0 0 1.5 5.755A9 9 0 0 0 6 21a9 9 0 0 0 3.5-5.755A9 9 0 0 0 9 15V3m4 0a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h3.5M12 9v6m-3-3h6" />
                    </svg>
                    Skip to Home
                  </button>
                </div>
              </div>

              <div className="mt-3 flex h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-accent-500 rounded-full" style={{ transformOrigin: "left", transform: `scaleX(${Math.min(1, Math.max(0, progress / 100))})` }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntroVideo;
