import React, { useState, useEffect, useRef } from 'react';

/**
 * RotatingPlaceholder - Animates through multiple placeholder strings.
 * Cycles through suggestions with a typewriter-style effect.
 */
const RotatingPlaceholder = ({
  words = [],
  typingSpeed = 60,
  deletingSpeed = 30,
  pauseTime = 2000,
  className = '',
}) => {
  const [text, setText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (words.length === 0) return;

    const currentWord = words[wordIndex];

    const tick = () => {
      if (!isDeleting) {
        setText(currentWord.substring(0, text.length + 1));
        if (text.length === currentWord.length) {
          timeoutRef.current = setTimeout(() => setIsDeleting(true), pauseTime);
          return;
        }
      } else {
        setText(currentWord.substring(0, text.length - 1));
        if (text.length === 0) {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % words.length);
          return;
        }
      }
      timeoutRef.current = setTimeout(tick, isDeleting ? deletingSpeed : typingSpeed);
    };

    timeoutRef.current = setTimeout(tick, isDeleting ? deletingSpeed : typingSpeed);
    return () => clearTimeout(timeoutRef.current);
  }, [text, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseTime]);

  return (
    <span className={className}>
      {text}
      <span className="animate-pulse text-purple-400">|</span>
    </span>
  );
};

export default RotatingPlaceholder;
