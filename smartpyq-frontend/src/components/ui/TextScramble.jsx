import React, { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';

/**
 * TextScramble - Text that scrambles through random characters before revealing the final text.
 * Triggered when element enters viewport.
 */
const TextScramble = ({ text, className = '', delay = 0, speed = 30, once = true }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once });
  const [display, setDisplay] = useState('');
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isInView) return;

    const timeout = setTimeout(() => {
      let iteration = 0;
      const maxIterations = text.length * 2;

      intervalRef.current = setInterval(() => {
        setDisplay(
          text
            .split('')
            .map((char, i) => {
              if (i < iteration / 2) return char;
              if (char === ' ') return ' ';
              return CHARS[Math.floor(Math.random() * CHARS.length)];
            })
            .join('')
        );

        iteration++;
        if (iteration > maxIterations) {
          clearInterval(intervalRef.current);
          setDisplay(text);
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isInView, text, delay, speed]);

  return (
    <span ref={ref} className={className}>
      {display || '\u00A0'}
    </span>
  );
};

export default TextScramble;
