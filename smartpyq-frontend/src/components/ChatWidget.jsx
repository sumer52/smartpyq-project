import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  ArrowPathIcon,
  MinusIcon,
  StopIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid } from '@heroicons/react/24/solid';
import { BACKEND_URL } from '../lib/backendUrl';
import { useReducedMotionSafe } from '../lib/motion';

// Markdown rendering (headings, lists, tables, code blocks with copy) is
// lazy-loaded: it is only needed once an answer exists, never on page load.
const ChatMarkdown = lazy(() => import('./chat/ChatMarkdown'));

const GENERIC_ERROR = 'Something went wrong while generating the answer. Please try again.';
const SUGGESTIONS = [
  'What is artificial intelligence?',
  'Solve 2x + 5 = 15',
  'Write a Python binary search program',
  'Explain gravity in simple words',
];
// No answer may take longer than this before the widget reports an error.
const STREAM_TIMEOUT_MS = 90000;

const ChatWidget = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState({ count: 0 });
  // PYQ mode: paste an exam question, get a structured step-by-step
  // explanation. Uses the SAME stateless /chat/ask endpoint — it only
  // scaffolds the pasted text into a clear request before sending.
  const [pyqMode, setPyqMode] = useState(false);
  const reduceMotion = useReducedMotionSafe();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatAbortRef = useRef(null);
  // Guards against double submits: state updates are async, so Enter held down
  // (or a double click) could otherwise fire two requests for one question.
  const sendingRef = useRef(false);
  const stopRequestedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
    if (isOpen) setUnreadCount({ count: 0 });
  }, [isOpen, isMinimized]);

  // Abort any in-flight stream when the widget unmounts.
  useEffect(() => () => chatAbortRef.current?.abort(), []);

  // ---------------- Streaming (stateless) ----------------
  // Each question is independent: POST /api/v1/chat/ask returns an SSE
  // stream. Nothing is persisted server-side and nothing is saved here.
  const streamAnswer = (question) => {
    const controller = new AbortController();
    chatAbortRef.current = controller;
    stopRequestedRef.current = false;
    const botMessageId = Date.now() + Math.floor(Math.random() * 1000);
    let accumulated = '';
    let settled = false;
    setIsTyping(true);
    setIsLoading(true);
    sendingRef.current = true;

    // A stalled stream must surface an error instead of spinning forever.
    const watchdog = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    const upsertBotMessage = (content, extra = {}) => {
      setMessages(prev => {
        const existing = prev.find(m => m.id === botMessageId);
        if (existing) {
          return prev.map(m => (m.id === botMessageId ? { ...m, content, ...extra } : m));
        }
        return [...prev, { id: botMessageId, type: 'bot', content, timestamp: new Date(), ...extra }];
      });
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      sendingRef.current = false;
      setIsTyping(false);
      setIsLoading(false);
      if (!isOpen) setUnreadCount(prev => ({ count: prev.count + 1 }));
    };

    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${BACKEND_URL}/api/v1/chat/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: question }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`chat unavailable (HTTP ${response.status})`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawDone = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are CRLF-separated (sse-starlette); normalize first.
          const frames = buffer.replace(/\r\n/g, '\n').split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue;
              try {
                const data = JSON.parse(line.slice(5).trim());
                if (data.type === 'content' && data.content) {
                  accumulated += data.content;
                  setIsTyping(false);
                  upsertBotMessage(accumulated, { streaming: true });
                } else if (data.type === 'error') {
                  accumulated = accumulated || (data.message || GENERIC_ERROR);
                  upsertBotMessage(accumulated, { streaming: false, isError: !accumulated || accumulated === GENERIC_ERROR });
                  sawDone = true;
                  finish();
                  reader.cancel().catch(() => {});
                  return;
                } else if (data.type === 'done') {
                  sawDone = true;
                  upsertBotMessage(accumulated || '…', { streaming: false });
                  finish();
                  reader.cancel().catch(() => {});
                  return;
                }
              } catch {
                // Ignore malformed frames; never kill the stream for one bad line.
              }
            }
          }
        }
        if (!sawDone) {
          upsertBotMessage(accumulated || GENERIC_ERROR, {
            streaming: false,
            isError: !accumulated,
          });
          finish();
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          clearTimeout(watchdog);
          if (stopRequestedRef.current) {
            // The visitor pressed Stop — keep whatever streamed in.
            upsertBotMessage(accumulated || '_Stopped._', { streaming: false });
          } else {
            // Watchdog hit: the assistant never answered.
            upsertBotMessage(
              accumulated || 'The assistant took too long to respond. Please try again.',
              { streaming: false, isError: !accumulated }
            );
          }
          finish();
          return;
        }
        upsertBotMessage(GENERIC_ERROR, { streaming: false, isError: true });
        finish();
      });
  };

  const handleSendMessage = () => {
    const raw = inputValue.trim();
    if (!raw || isLoading || sendingRef.current) return;
    // PYQ mode wraps the pasted question in an explanation scaffold (the
    // backend stays stateless and topic-agnostic; this is purely a
    // client-side prompt template). 4000-char backend cap: trim the paste
    // so message + scaffold always fit.
    const message = pyqMode
      ? `This is a previous-year exam question. Explain it step by step: restate what is being asked, identify the topic and the concept tested, show the full solution or answer with reasoning, and add one exam tip or common mistake to avoid. Keep it at a college-exam level.

Question: ${raw.slice(0, 3400)}`
      : raw;
    setInputValue('');
    setPyqMode(false);
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', content: message, timestamp: new Date() }]);
    streamAnswer(message);
  };

  const handleRegenerate = () => {
    if (isLoading || sendingRef.current) return;
    const lastUser = [...messages].reverse().find(m => m.type === 'user');
    if (!lastUser) return;
    // Drop the trailing bot answer(s) and re-ask the same question.
    setMessages(prev => {
      const copy = [...prev];
      while (copy.length && copy[copy.length - 1].type === 'bot') copy.pop();
      return copy;
    });
    streamAnswer(lastUser.content);
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    chatAbortRef.current?.abort();
  };

  // Enter sends; Shift+Enter inserts a newline (textarea default).
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setIsMinimized(false);
  };
  const toggleMinimize = () => setIsMinimized(!isMinimized);

  const clearChat = () => {
    stopRequestedRef.current = true;
    chatAbortRef.current?.abort();
    sendingRef.current = false;
    setIsLoading(false);
    setIsTyping(false);
    setMessages([]);
    setInputValue('');
  };

  const copyAnswer = async (content) => {
    try { await navigator.clipboard.writeText(content); } catch { /* clipboard unavailable */ }
  };

  const formatTime = (date) => new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(date);

  // Index of the last completed bot answer — that one gets the Regenerate action.
  const lastBotIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].type === 'bot' && !messages[i].streaming) return i;
    }
    return -1;
  })();

  const showEmptyState = messages.length === 0 && !isTyping;

  const TypingIndicator = () => (
    <motion.div
      className="flex items-center space-x-1 px-4 py-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex space-x-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-white/40 rounded-full"
            animate={reduceMotion ? {} : { scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <span className="text-sm text-gray-200 ml-2">Thinking…</span>
    </motion.div>
  );

  return (
    <div className={`floating-chat ${className}`} style={{ maxWidth: 'calc(100vw - 32px)' }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="mb-4 bg-[#1a1611] rounded-2xl shadow-2xl border border-white/15 overflow-hidden flex flex-col"
            role="dialog"
            aria-label="AI assistant"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
            style={{
              width: 'min(384px, calc(100vw - 32px))',
              // Fixed height (not max-height) so the composer can never be
              // pushed below the viewport edge by a long conversation.
              height: 'min(560px, calc(100dvh - 120px))',
            }}
          >
            {/* Header */}
            <div className="bg-linear-to-r from-brand-600 to-brand-700 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center mr-3">
                  <SparklesIcon className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">AI Assistant</h2>
                  <p className="text-xs text-white/85">Ask anything — doubts, code, concepts</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={clearChat}
                  aria-label="Clear chat"
                  title="Clear chat"
                >
                  <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={toggleMinimize}
                  aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
                  aria-expanded={!isMinimized}
                  title={isMinimized ? 'Expand chat' : 'Minimize chat'}
                >
                  <MinusIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={toggleChat}
                  aria-label="Close chat"
                  title="Close chat"
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {!isMinimized && (
                <motion.div
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                >
                  {/* Messages — scrolls; the composer below stays visible */}
                  <div
                    className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4 bg-white/5"
                    style={{ scrollbarWidth: 'thin' }}
                    aria-live="polite"
                    aria-label="Conversation"
                  >
                    {showEmptyState && (
                      <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15">
                          <SparklesIcon className="h-6 w-6 text-brand-300" aria-hidden="true" />
                        </div>
                        <p className="text-sm font-semibold text-white">Ask your first question</p>
                        <p className="mt-1 max-w-[16rem] text-xs text-gray-300">
                          Doubts, definitions, code, exam questions — paste anything and get a step-by-step answer.
                        </p>
                      </div>
                    )}

                    {messages.map((message, index) => (
                      <motion.div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                      >
                        <div className={`max-w-[85%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl ${message.type === 'user'
                              ? 'bg-brand-600 text-white rounded-br-md'
                              : message.isError
                                ? 'bg-red-500/15 text-red-100 border border-red-400/40 rounded-bl-md'
                                : 'bg-white/10 text-white rounded-bl-md shadow-xs border border-white/10'
                            }`}
                          >
                            {message.type === 'user' ? (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            ) : message.isError ? (
                              <p className="flex items-start gap-2 text-sm">
                                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                                <span>{message.content}</span>
                              </p>
                            ) : (
                              <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{message.content}</p>}>
                                <ChatMarkdown content={message.content} />
                              </Suspense>
                            )}
                            {message.streaming && (
                              <motion.div
                                className="inline-block w-2 h-4 bg-current ml-1 align-middle"
                                animate={reduceMotion ? {} : { opacity: [1, 0] }}
                                transition={reduceMotion ? { duration: 0 } : { duration: 0.8, repeat: Infinity }}
                              />
                            )}
                          </div>
                          {/* Answer actions */}
                          {message.type === 'bot' && !message.streaming && message.content && (
                            <div className={`flex items-center gap-3 mt-1 text-[11px] text-gray-300 ${index === lastBotIndex ? '' : 'opacity-80'}`}>
                              {message.isError ? (
                                <button
                                  type="button"
                                  onClick={handleRegenerate}
                                  disabled={isLoading}
                                  className="inline-flex items-center gap-1 font-medium text-red-200 hover:text-white transition-colors disabled:opacity-50"
                                  aria-label="Retry the request"
                                >
                                  <ArrowPathIcon className="h-3 w-3" aria-hidden="true" /> Try again
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => copyAnswer(message.content)}
                                  className="inline-flex items-center gap-1 hover:text-white transition-colors"
                                  aria-label="Copy answer"
                                >
                                  <ClipboardDocumentIcon className="h-3 w-3" aria-hidden="true" /> Copy
                                </button>
                              )}
                              {index === lastBotIndex && !message.isError && (
                                <button
                                  type="button"
                                  onClick={handleRegenerate}
                                  disabled={isLoading}
                                  className="inline-flex items-center gap-1 hover:text-white transition-colors disabled:opacity-50"
                                  aria-label="Regenerate response"
                                >
                                  <ArrowPathIcon className="h-3 w-3" aria-hidden="true" /> Regenerate
                                </button>
                              )}
                              <span className="ml-auto">{formatTime(new Date(message.timestamp))}</span>
                            </div>
                          )}
                          {message.type === 'user' && (
                            <p className="text-xs text-gray-400 mt-1 text-right">{formatTime(new Date(message.timestamp))}</p>
                          )}
                        </div>
                        {message.type === 'bot' && (
                          <div className="w-8 h-8 bg-brand-500/20 border border-brand-500/30 rounded-full flex items-center justify-center mr-2 mt-1 order-0 shrink-0">
                            <SparklesIcon className="h-4 w-4 text-brand-300" aria-hidden="true" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {/* Thinking indicator (before the first token arrives) */}
                    <AnimatePresence>
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="w-8 h-8 bg-brand-500/20 border border-brand-500/30 rounded-full flex items-center justify-center mr-2 shrink-0">
                            <SparklesIcon className="h-4 w-4 text-brand-300" aria-hidden="true" />
                          </div>
                          <div className="bg-white/10 rounded-2xl rounded-bl-md shadow-xs border border-white/10">
                            <TypingIndicator />
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Composer */}
                  <div className="shrink-0 p-3 bg-[#1a1611] border-t border-white/10">
                    <div className="flex items-end space-x-2">
                      <div className="flex-1">
                        <label htmlFor="chat-message" className="sr-only">Message the AI assistant</label>
                        <textarea
                          id="chat-message"
                          ref={inputRef}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={pyqMode
                            ? 'Paste a PYQ / exam question here…'
                            : 'Ask anything — e.g. explain recursion…'}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none transition-colors"
                          rows={pyqMode ? 3 : 1}
                          style={{ minHeight: pyqMode ? '72px' : '44px', maxHeight: '160px' }}
                        />
                      </div>
                      {isLoading ? (
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          onClick={handleStop}
                          aria-label="Stop generating"
                          title="Stop generating"
                        >
                          <StopIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`btn btn-icon ${inputValue.trim() ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={handleSendMessage}
                          aria-label="Send message"
                          title="Send message"
                        >
                          <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {/* Composer actions */}
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setPyqMode(v => !v);
                          inputRef.current?.focus();
                        }}
                        aria-pressed={pyqMode}
                        className={`btn btn-sm btn-pill inline-flex items-center gap-1.5 ${pyqMode ? 'btn-primary' : 'btn-ghost'}`}
                        title="Paste an exam question and get a step-by-step explanation"
                      >
                        <DocumentTextIcon className="h-3.5 w-3.5" aria-hidden="true" /> PYQ mode {pyqMode ? 'ON' : ''}
                      </button>
                      {pyqMode && (
                        <span className="text-[11px] text-gray-300">
                          Paste a question — you&apos;ll get topic, concept, full solution &amp; exam tips
                        </span>
                      )}
                      {showEmptyState && !pyqMode && (
                        <>
                          {SUGGESTIONS.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              className="btn btn-sm btn-ghost btn-pill"
                              onClick={() => setInputValue(suggestion)}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400 text-center">
                      Answers are AI-generated — verify important information. Enter to send, Shift+Enter for a new line.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Chat toggle button */}
      <button
        type="button"
        className={`btn btn-icon btn-lg w-14 h-14 ${isOpen ? 'btn-secondary' : 'btn-primary'}`}
        onClick={toggleChat}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        title={isOpen ? 'Close chat' : 'Open chat'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.span
              key="close"
              initial={reduceMotion ? false : { rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="inline-flex"
            >
              <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="chat"
              initial={reduceMotion ? false : { rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { rotate: -90, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="relative inline-flex"
            >
              <ChatBubbleLeftRightIconSolid className="h-6 w-6 text-white" aria-hidden="true" />
              {unreadCount.count > 0 && (
                <motion.span
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold"
                  initial={reduceMotion ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 15 }}
                >
                  {unreadCount.count > 9 ? '9+' : unreadCount.count}
                </motion.span>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
};

export default ChatWidget;
