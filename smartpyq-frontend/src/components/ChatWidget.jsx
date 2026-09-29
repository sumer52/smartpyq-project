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
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid } from '@heroicons/react/24/solid';
import { BACKEND_URL } from '../lib/backendUrl';

// Markdown rendering (headings, lists, tables, code blocks with copy) is
// lazy-loaded: it is only needed once an answer exists, never on page load.
const ChatMarkdown = lazy(() => import('./chat/ChatMarkdown'));

const WELCOME = {
  id: 1,
  type: 'bot',
  content: "Hi! I'm your AI assistant. Ask me **anything** — math, physics, code, concepts, career doubts, or anything else you're curious about.",
  timestamp: new Date()
};

const GENERIC_ERROR = 'Something went wrong while generating the answer. Please try again.';

const ChatWidget = ({ className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // PYQ mode: paste an exam question, get a structured step-by-step
  // explanation. Uses the SAME stateless /chat/ask endpoint — it only
  // scaffolds the pasted text into a clear request before sending.
  const [pyqMode, setPyqMode] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatAbortRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
    if (isOpen) setUnreadCount(0);
  }, [isOpen, isMinimized]);

  // Abort any in-flight stream when the widget unmounts.
  useEffect(() => () => chatAbortRef.current?.abort(), []);

  // ---------------- Streaming (stateless) ----------------
  // Each question is independent: POST /api/v1/chat/ask returns an SSE
  // stream. Nothing is persisted server-side and nothing is saved here.
  const streamAnswer = (question) => {
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const botMessageId = Date.now() + Math.floor(Math.random() * 1000);
    let accumulated = '';
    setIsTyping(true);
    setIsLoading(true);

    const upsertBotMessage = (content, streaming) => {
      setMessages(prev => {
        const existing = prev.find(m => m.id === botMessageId);
        if (existing) {
          return prev.map(m => (m.id === botMessageId ? { ...m, content, streaming } : m));
        }
        return [...prev, { id: botMessageId, type: 'bot', content, timestamp: new Date(), streaming }];
      });
    };

    const finish = () => {
      setIsTyping(false);
      setIsLoading(false);
      if (!isOpen) setUnreadCount(prev => prev + 1);
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
                  upsertBotMessage(accumulated, true);
                } else if (data.type === 'error') {
                  accumulated = accumulated || `⚠️ ${data.message || GENERIC_ERROR}`;
                  upsertBotMessage(accumulated, false);
                  sawDone = true;
                  finish();
                  reader.cancel().catch(() => {});
                  return;
                } else if (data.type === 'done') {
                  sawDone = true;
                  upsertBotMessage(accumulated || '…', false);
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
          upsertBotMessage(accumulated || `⚠️ ${GENERIC_ERROR}`, false);
          finish();
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          // User pressed Stop — keep whatever streamed in.
          upsertBotMessage(accumulated || '_Stopped._', false);
          setIsTyping(false);
          setIsLoading(false);
          return;
        }
        upsertBotMessage(`⚠️ ${GENERIC_ERROR}`, false);
        setIsTyping(false);
        setIsLoading(false);
        if (!isOpen) setUnreadCount(prev => prev + 1);
      });
  };

  const handleSendMessage = () => {
    const raw = inputValue.trim();
    if (!raw || isLoading) return;
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
    if (isLoading) return;
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
    chatAbortRef.current?.abort();
    setMessages([{ ...WELCOME, id: Date.now(), content: "Chat cleared. Ask me anything!", timestamp: new Date() }]);
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
      if (messages[i].type === 'bot' && !messages[i].streaming && i !== 0) return i;
    }
    return -1;
  })();

  const TypingIndicator = () => (
    <motion.div
      className="flex items-center space-x-1 px-4 py-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex space-x-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-white/30 rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <span className="text-sm text-gray-500 ml-2">Thinking…</span>
    </motion.div>
  );

  return (
    <div className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 ${className}`} style={{ maxWidth: 'calc(100vw - 32px)' }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="mb-4 bg-white/5 rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{ width: 'min(384px, calc(100vw - 48px))', maxHeight: 'min(600px, calc(100vh - 100px))' }}
          >
            {/* Header */}
            <div className="bg-linear-to-r from-brand-600 to-brand-700 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center mr-3">
                  <SparklesIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">AI Assistant</h3>
                  <p className="text-xs text-white/80">Ask anything — doubts, code, concepts</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <motion.button
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={clearChat}
                  aria-label="Clear chat"
                  title="Clear chat"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                </motion.button>
                <motion.button
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={toggleMinimize}
                  aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
                >
                  <MinusIcon className="h-4 w-4" />
                </motion.button>
                <motion.button
                  className="btn btn-icon btn-sm btn-ghost"
                  onClick={toggleChat}
                  aria-label="Close chat"
                >
                  <XMarkIcon className="h-4 w-4" />
                </motion.button>
              </div>
            </div>
            <AnimatePresence>
              {!isMinimized && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Messages */}
                  <div className="h-96 overflow-y-auto p-4 space-y-4 bg-white/5" style={{ scrollbarWidth: 'thin' }}>
                    {messages.map((message, index) => (
                      <motion.div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className={`max-w-[85%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl ${message.type === 'user'
                              ? 'bg-brand-600 text-white rounded-br-md'
                              : 'bg-white/5 text-white rounded-bl-md shadow-xs border border-white/10'
                            }`}
                          >
                            {message.type === 'user' ? (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            ) : (
                              <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{message.content}</p>}>
                                <ChatMarkdown content={message.content} />
                              </Suspense>
                            )}
                            {message.streaming && (
                              <motion.div
                                className="inline-block w-2 h-4 bg-current ml-1 align-middle"
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                              />
                            )}
                          </div>
                          {/* Answer actions */}
                          {message.type === 'bot' && !message.streaming && message.content && (
                            <div className={`flex items-center gap-3 mt-1 text-[11px] text-gray-500 ${index === lastBotIndex ? '' : 'opacity-70'}`}>
                              <button
                                onClick={() => copyAnswer(message.content)}
                                className="inline-flex items-center gap-1 hover:text-white transition-colors focus:outline-hidden"
                                aria-label="Copy answer"
                              >
                                <ClipboardDocumentIcon className="h-3 w-3" /> Copy
                              </button>
                              {index === lastBotIndex && (
                                <button
                                  onClick={handleRegenerate}
                                  disabled={isLoading}
                                  className="inline-flex items-center gap-1 hover:text-white transition-colors disabled:opacity-40 focus:outline-hidden"
                                  aria-label="Regenerate response"
                                >
                                  <ArrowPathIcon className="h-3 w-3" /> Regenerate
                                </button>
                              )}
                              <span className="ml-auto">{formatTime(new Date(message.timestamp))}</span>
                            </div>
                          )}
                          {message.type === 'user' && (
                            <p className="text-xs text-gray-500 mt-1 text-right">{formatTime(new Date(message.timestamp))}</p>
                          )}
                        </div>
                        {message.type === 'bot' && (
                          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center mr-2 mt-1 order-0">
                            <SparklesIcon className="h-4 w-4 text-indigo-300" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {/* Thinking indicator (before the first token arrives) */}
                    <AnimatePresence>
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center mr-2">
                            <SparklesIcon className="h-4 w-4 text-indigo-300" />
                          </div>
                          <div className="bg-white/5 rounded-2xl rounded-bl-md shadow-xs border border-white/10">
                            <TypingIndicator />
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>
                  {/* Input */}
                  <div className="p-4 bg-white/5 border-t border-white/10">
                    <div className="flex items-end space-x-2">
                      <div className="flex-1">
                        <textarea
                          ref={inputRef}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={pyqMode
                            ? 'Paste a PYQ / exam question here…'
                            : 'Ask anything — e.g. explain recursion, solve 2x+5=15…'}
                          className="w-full px-3 py-2 border border-white/15 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none transition-colors"
                          rows={pyqMode ? 3 : 1}
                          style={{ minHeight: pyqMode ? '72px' : '40px', maxHeight: '160px' }}
                          disabled={isLoading}
                        />
                      </div>
                      {isLoading ? (
                        <motion.button
                          className="btn btn-icon btn-danger"
                          onClick={handleStop}
                          aria-label="Stop generating"
                          title="Stop generating"
                        >
                          <StopIcon className="h-5 w-5" />
                        </motion.button>
                      ) : (
                        <motion.button
                          className={`btn btn-icon ${inputValue.trim() ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={handleSendMessage}
                          disabled={!inputValue.trim()}
                          aria-label="Send message"
                        >
                          <PaperAirplaneIcon className="h-5 w-5" />
                        </motion.button>
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
                        <DocumentTextIcon className="h-3.5 w-3.5" /> PYQ mode {pyqMode ? 'ON' : ''}
                      </button>
                      {pyqMode && (
                        <span className="text-[10px] text-gray-400">
                          Paste a question — you'll get topic, concept, full solution & exam tips
                        </span>
                      )}
                      {messages.length <= 1 && !pyqMode && (
                        <>
                          {[
                            'What is artificial intelligence?',
                            'Solve 2x + 5 = 15',
                            'Write a Python binary search program',
                            'Explain gravity in simple words'
                          ].map((suggestion) => (
                            <button
                              key={suggestion}
                              className="btn btn-sm btn-ghost btn-pill"
                              onClick={() => setInputValue(suggestion)}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-gray-500 text-center">
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
      <motion.button
        className={`btn btn-icon btn-lg w-14 h-14 ${isOpen ? 'btn-secondary' : 'btn-primary'}`}
        onClick={toggleChat}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <XMarkIcon className="h-6 w-6 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <ChatBubbleLeftRightIconSolid className="h-6 w-6 text-white" />
              {unreadCount > 0 && (
                <motion.div
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
};

export default ChatWidget;
