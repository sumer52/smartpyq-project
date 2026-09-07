import React, { useState, useEffect, useRef } from 'react';
import { useInView } from 'framer-motion';

/**
 * Typewriter - Types out text character by character with a blinking cursor.
 * Loops through an array of words/phrases.
 */
const Typewriter = ({ words = [], className = '', speed = 80, deleteSpeed = 40, pauseTime = 2000 }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false });
  const [text, setText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isInView || words.length === 0) return;

    const currentWord = words[wordIndex];

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setText(currentWord.substring(0, text.length + 1));
        if (text.length === currentWord.length) {
          setTimeout(() => setIsDeleting(true), pauseTime);
        }
      } else {
        setText(currentWord.substring(0, text.length - 1));
        if (text.length === 0) {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % words.length);
        }
      }
    }, isDeleting ? deleteSpeed : speed);

    return () => clearTimeout(timeout);
  }, [text, isDeleting, wordIndex, words, speed, deleteSpeed, pauseTime, isInView]);

  return (
    <span ref={ref} className={className}>
      {text}
      <span className="animate-pulse text-purple-400">|</span>
    </span>
  );
};

export default Typewriter;
