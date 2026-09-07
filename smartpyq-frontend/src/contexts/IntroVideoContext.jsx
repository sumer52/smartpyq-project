import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const IntroVideoContext = createContext();
export const useIntroVideo = () => {
  const context = useContext(IntroVideoContext);
  if (!context) throw new Error("useIntroVideo must be used within IntroVideoProvider");
  return context;
};
export const IntroVideoProvider = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const videoRef = useRef(null);
  // Synchronous guard against rapid duplicate triggers (e.g. multiple Home clicks)
  const activeRef = useRef(false);
  const onCompleteRef = useRef(null);

  const triggerIntro = useCallback((onComplete) => {
    if (activeRef.current || isActive) return;
    activeRef.current = true;
    onCompleteRef.current = onComplete || null;
    setIsActive(true);
  }, []);

  const skipIntro = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setIsActive(false);
    if (onCompleteRef.current) {
      const cb = onCompleteRef.current;
      onCompleteRef.current = null;
      setTimeout(() => cb(), 50);
    }
  }, []);

  const completeIntro = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setIsActive(false);
    if (onCompleteRef.current) {
      const cb = onCompleteRef.current;
      onCompleteRef.current = null;
      setTimeout(() => cb(), 50);
    }
  }, []);

  const replayIntro = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const value = {
    isActive,
    videoRef,
    triggerIntro,
    skipIntro,
    completeIntro,
    replayIntro,
  };

  return (
    <IntroVideoContext.Provider value={value}>
      {children}
    </IntroVideoContext.Provider>
  );
};
export default IntroVideoContext;
