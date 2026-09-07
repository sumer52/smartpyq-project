import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  MinusIcon
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid } from '@heroicons/react/24/solid';
const ChatWidget = ({ className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: 'Hi! I\'m your AI study assistant. I can help you with questions about previous year papers, study tips, and academic guidance. How can I help you today?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const chatContainerRef = useRef(null);
  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);
  // Handle unread count
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);
  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
  // Load chat history from localStorage
  useEffect(() => {
    const savedMessages = localStorage.getItem(`chat_${sessionId}`);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        setMessages(parsed);
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    }
  }, [sessionId]);
  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 1) { // Don't save just the welcome message
      localStorage.setItem(`chat_${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);
  // Mock typing animation
  const showTypingAnimation = () => {
    setIsTyping(true);
    // Simulate variable typing delay
    const typingDelay = Math.random() * 2000 + 1000; // 1-3 seconds
    setTimeout(() => {
      setIsTyping(false);
    }, typingDelay);
  };

  // Handle SSE connection for streaming responses
  const handleSSEResponse = (userMessage) => {
    // TODO: Replace with actual SSE endpoint
    const sseUrl = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/v1/chat/stream?session_id=${sessionId}`;
    try {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;
      let botMessageId = Date.now();
      let accumulatedContent = '';
      eventSource.onopen = () => {
        console.log('SSE connection opened');
        setError(null);
      };
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'content') {
            accumulatedContent += data.content;
            setMessages(prev => {
              const existing = prev.find(msg => msg.id === botMessageId);
              if (existing) {
                return prev.map(msg => 
                  msg.id === botMessageId 
                    ? { ...msg, content: accumulatedContent }
                    : msg
                );
              } else {
                return [...prev, {
                  id: botMessageId,
                  type: 'bot',
                  content: accumulatedContent,
                  timestamp: new Date(),
                  streaming: true
                }];
              }
            });
          } else if (data.type === 'done') {
            setMessages(prev => 
              prev.map(msg => 
                msg.id === botMessageId 
                  ? { ...msg, streaming: false }
                  : msg
              )
            );
            setIsLoading(false);
            eventSource.close();
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        // Fallback to regular fetch
        handleFallbackResponse(userMessage);
      };
    } catch (error) {
      console.error('Failed to establish SSE connection:', error);
      handleFallbackResponse(userMessage);
    }
  };
  // Smart local response generator
  const getLocalResponse = (msg) => {
    const lower = msg.toLowerCase();
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey'))
      return 'Hello! Welcome to SmartPYQ. I can help you with previous year papers, exam preparation tips, and study guidance. What would you like to know?';
    if (lower.includes('pyq') || lower.includes('previous year') || lower.includes('question paper'))
      return 'SmartPYQ has previous year question papers for Osmania University across B.Sc, B.Com, BCA, and BBA courses. Go to the PYQ Hub to browse papers by stream, semester, and subject!';
    if (lower.includes('repeated') || lower.includes('important'))
      return 'One of SmartPYQ best features is detecting repeated questions across multiple exam years. Go to the Analysis section to upload a paper and discover which topics appear most frequently.';
    if (lower.includes('upload'))
      return 'You can upload question papers to SmartPYQ! Go to the Upload page and select your PDF or image file. Our AI will automatically extract questions and categorize them by topic.';
    if (lower.includes('practice'))
      return 'The Practice mode lets you test yourself on questions extracted from previous year papers. Go to the Practice section to start a practice session organized by subject and difficulty.';
    if (lower.includes('analyze') || lower.includes('analysis'))
      return 'SmartPYQ AI Analysis processes question papers to identify patterns: repeated questions, topic frequency, important areas, and exam trends. Upload a paper in the Analyze section!';
    if (lower.includes('search'))
      return 'Use the Smart Search feature to find papers instantly! You can search by subject name, course, year, or keywords.';
    if (lower.includes('course') || lower.includes('stream') || lower.includes('b.sc') || lower.includes('b.com') || lower.includes('bca') || lower.includes('bba'))
      return 'SmartPYQ covers 4 courses: B.Sc, B.Com, BCA, and BBA at Osmania University. Each has multiple specializations and semesters. Go to PYQ Hub to explore!';
    if (lower.includes('study tip') || lower.includes('exam') || lower.includes('preparation'))
      return 'Smart study tips: 1) Focus on repeated questions first. 2) Understand exam patterns. 3) Practice with past papers under timed conditions. 4) Use SmartPYQ analysis to identify weak areas. 5) Revise regularly!';
    if (lower.includes('thank'))
      return 'You are welcome! If you have any more questions about SmartPYQ or exam preparation, feel free to ask. Good luck with your studies!';
    if (lower.includes('help'))
      return 'I can help you with: Finding previous year papers, Analyzing exam patterns, Discovering repeated questions, Practice preparation tips, Uploading papers, and Course/subject information. Just ask me anything!';
    return 'Thanks for your question! I am SmartPYQ AI assistant. I can help you with previous year papers, exam patterns, repeated questions, study tips, and more. Try asking me about PYQ papers, analysis, practice, or study strategies!';
  };

  // Send message to chat API
  const handleFallbackResponse = async (userMessage) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      showTypingAnimation();
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      let response;
      if (token) {
        try {
          response = await fetch(`${BACKEND_URL}/api/v1/chat/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ prompt: userMessage, session_id: sessionId, stream: false }),
            signal: controller.signal
          });
        } catch(e) {}
      }
      if (!token || !response || !response.ok) {
        try {
          response = await fetch(`${BACKEND_URL}/api/v1/chat/simple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: userMessage, session_id: sessionId }),
            signal: controller.signal
          });
        } catch(e) {}
      }
      if (response && response.ok) {
        const data = await response.json();
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), type: 'bot', content: data.response || 'I had trouble processing that. Please try again.', timestamp: new Date() }]);
          setIsLoading(false);
          if (!isOpen) setUnreadCount(prev => prev + 1);
        }, Math.max(0, 800 - (Date.now() % 800)));
      } else { throw new Error('Backend unavailable'); }
    } catch (error) {
      const localReply = getLocalResponse(userMessage);
      const delay = Math.min(600 + localReply.length * 5, 1500);
      setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), type: 'bot', content: localReply, timestamp: new Date() }]);
        setIsLoading(false);
        setIsTyping(false);
        if (!isOpen) setUnreadCount(prev => prev + 1);
      }, delay);
    } finally { clearTimeout(timeoutId); }
  };
  // Send the user's message: append it, then try SSE streaming, falling back to the
  // regular chat API and finally to the local response generator.
  const handleSendMessage = () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;
    setInputValue('');
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', content: message, timestamp: new Date() }]);
    setIsLoading(true);
    setError(null);
    handleSSEResponse(message);
  };
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setIsMinimized(false);
    }
  };
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };
  const clearChat = () => {
    setMessages([
      {
        id: 1,
        type: 'bot',
        content: "Chat cleared! Ask me anything — I'm here to help.",
        timestamp: new Date()
      }
    ]);
    localStorage.removeItem(`chat_${sessionId}`);
  };
  const formatTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };
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
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={
              {
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2
              }
            }
          />
        ))}
      </div>
      <span className="text-sm text-gray-500 ml-2">AI is typing...</span>
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
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center mr-3">
                  <SparklesIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">AI Study Assistant</h3>
                  <p className="text-xs text-white/80">Always here to help</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
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
                  <div 
                    ref={chatContainerRef}
                    className="h-96 overflow-y-auto p-4 space-y-4 bg-white/5"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className={`max-w-[80%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                          <div
                            className={`px-4 py-2 rounded-2xl ${message.type === 'user'
                              ? 'bg-brand-600 text-white rounded-br-md'
                              : 'bg-white/5 text-white rounded-bl-md shadow-sm border border-white/10'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            {message.streaming && (
                              <motion.div
                                className="inline-block w-2 h-4 bg-current ml-1"
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                              />
                            )}
                          </div>
                          <p className={`text-xs text-gray-500 mt-1 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
                            {formatTime(new Date(message.timestamp))}
                          </p>
                        </div>
                        {message.type === 'bot' && (
                          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center mr-2 mt-1 order-0">
                            <SparklesIcon className="h-4 w-4 text-indigo-300" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {/* Typing indicator */}
                    <AnimatePresence>
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center mr-2">
                            <SparklesIcon className="h-4 w-4 text-indigo-300" />
                          </div>
                          <div className="bg-white/5 rounded-2xl rounded-bl-md shadow-sm border border-white/10">
                            <TypingIndicator />
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>
                  {/* Error message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        className="px-4 py-2 bg-red-50 border-t border-red-100"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <div className="flex items-center text-red-600 text-sm">
                          <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                          {error}
                          <button
                            onClick={() => setError(null)}
                            className="ml-auto text-red-500 hover:text-red-700 focus:outline-none"
                            aria-label="Dismiss error"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Input */}
                  <div className="p-4 bg-white/5 border-t border-white/10">
                    <div className="flex items-end space-x-2">
                      <div className="flex-1">
                        <textarea
                          ref={inputRef}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder="Ask me anything about studies..."
                          className="w-full px-3 py-2 border border-white/15 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none transition-colors"
                          rows={1}
                          style={{ minHeight: '40px', maxHeight: '120px' }}
                          disabled={isLoading}
                        />
                      </div>
                      <motion.button
                        className={`btn btn-icon ${
                          inputValue.trim() && !isLoading
                            ? 'btn-primary'
                            : 'btn-ghost'
                        }`}
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isLoading}
                        aria-label="Send message"
                      >
                        {isLoading ? (
                          <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        ) : (
                          <PaperAirplaneIcon className="h-5 w-5" />
                        )}
                      </motion.button>
                    </div>
                    {/* Quick actions */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {messages.length <= 1 && (
                        <>
                          <button
                            className="btn btn-sm btn-ghost btn-pill text-xs"
                            onClick={() => setInputValue('Help me find previous year papers for computer science')}
                          >
                            Find Papers
                          </button>
                          <button
                            className="btn btn-sm btn-ghost btn-pill text-xs"
                            onClick={() => setInputValue('What are some good study tips for exams?')}
                          >
                            Study Tips
                          </button>
                          <button
                            className="btn btn-sm btn-ghost btn-pill text-xs"
                            onClick={() => setInputValue('Explain this topic to me')}
                          >
                            Explain Topic
                          </button>
                        </>
                      )}
                      {messages.length > 2 && (
                        <button
                          className="btn btn-xs btn-danger btn-pill"
                          onClick={clearChat}
                        >
                          Clear Chat
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Chat toggle button */}
      <motion.button
        className={`btn btn-icon btn-lg w-14 h-14 ${
          isOpen ? 'btn-secondary' : 'btn-primary'
        }`}
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