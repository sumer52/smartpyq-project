import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';
import { apiClient } from '../lib/api';
import GlowEffect from '../components/ui/GlowEffect';
import MagneticButton from '../components/ui/MagneticButton';
import CursorGlow from '../components/ui/CursorGlow';
import BorderBeam from '../components/ui/BorderBeam';
import TextScramble from '../components/ui/TextScramble';
const AIPage = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'ai',
      content: 'Hi! I\'m your AI study assistant. I can help you with questions about previous year papers, study tips, and academic guidance. How can I help you today?',
      timestamp: new Date().toISOString(),
      suggestions: [
        "Explain recursion with examples",
        "What are the best study techniques?",
        "Help me with a Python program",
        "How to prepare for semester exams?"
      ]
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  // Monotonic id per send: a slow reply that lands after a newer one is dropped
  // instead of overwriting the newer conversation state.
  const lastRequestRef = useRef(0);
  
  // Scroll the message list itself, never the page: scrollIntoView on the end
  // marker also scrolled the document, which pushed the composer under the
  // fixed header on first load at some viewport sizes.
  const scrollToBottom = () => {
    const list = messagesRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  useEffect(() => {
    // Focus input on mount, without scrolling the page to it.
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const handleSendMessage = async (message = inputMessage) => {
    const text = message.trim();
    if (!text || isLoading) return;
    const requestId = lastRequestRef.current + 1;
    lastRequestRef.current = requestId;
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setIsTyping(true);
    try {
      // apiClient (not a bare fetch) so the request has a deadline: the old
      // fetch had none, so a stalled backend left the spinner running forever.
      const data = await apiClient.simpleChat(text, sessionId);
      if (requestId !== lastRequestRef.current) return; // a newer send superseded this one
      const answer = typeof data?.response === 'string' ? data.response.trim() : '';
      if (!answer) {
        throw new Error('The AI assistant returned an empty answer.');
      }
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'ai',
        content: answer,
        timestamp: new Date().toISOString(),
        suggestions: generateSuggestions(text)
      }]);
    } catch (error) {
      if (requestId !== lastRequestRef.current) return;
      if (import.meta.env.DEV) console.error('Chat API error:', error);
      const reason = error?.code === 'TIMEOUT'
        ? 'The AI assistant did not respond in time.'
        : error?.name === 'BackendConfigurationError'
          ? 'The AI service is not configured for this deployment.'
          : error?.status
            ? `The AI assistant returned an error (HTTP ${error.status}).`
            : 'The AI assistant could not be reached.';
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'ai',
        content: `${reason} Please try again.`,
        timestamp: new Date().toISOString(),
        isError: true,
        retryPrompt: text
      }]);
    } finally {
      if (requestId === lastRequestRef.current) {
        setIsLoading(false);
        setIsTyping(false);
      }
    }
  };
  // This function is no longer needed since we use real AI responses
  // Keeping generateSuggestions for follow-up questions
  const generateSuggestions = (message) => {
    const suggestions = [
      "Explain this in more detail",
      "Can you give an example?",
      "How does this work in practice?",
      "What are the key points to remember?",
      "Show me a code example",
      "How does this relate to exams?"
    ];
    const shuffled = suggestions.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  };
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  const handleSuggestionClick = (suggestion) => {
    handleSendMessage(suggestion);
  };
  const clearChat = () => {
    setMessages([
      {
        id: 1,
        type: 'ai',
        content: 'Hi! I\'m your AI study assistant. I can help you with questions about previous year papers, study tips, and academic guidance. How can I help you today?',
        timestamp: new Date().toISOString(),
        suggestions: [
          "What is Python?",
          "Explain exam preparation tips",
          "What are the trending subjects?",
          "Help with study schedule"
        ]
      }
    ]);
  };
  return (
    <div className="min-h-screen bg-white/5">
      {/* Header */}
      <div className="bg-white/5 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-brand-400" /> <TextScramble text="SmartPYQ" delay={100} /> <span className="text-brand-gradient">AI</span>
                </h1>
                <p className="text-lg text-gray-400">
                  Ask anything — academics, programming, concepts, study tips, or any question you have.
                </p>
              </div>
              <motion.button
                onClick={clearChat}
                className="btn btn-sm btn-ghost"
              >
                Clear Chat
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Chat Interface */}
          <div className="lg:col-span-3">
            <BorderBeam className="rounded-xl" colorFrom="rgba(246,152,92,0.2)" colorTo="rgba(246,80,59,0.15)">
            <CursorGlow
              className="bg-white/5 rounded-xl shadow-xs border border-white/10 h-[600px]"
              contentClassName="flex h-full min-h-0 flex-col"
              glowColor="rgba(246,152,92,0.06)"
            >
              {/* Chat Messages */}
              <div
                ref={messagesRef}
                className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4"
                role="log"
                aria-live="polite"
                aria-label="AI assistant conversation"
              >
                <AnimatePresence>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className={`max-w-[80%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                        {message.type === 'ai' && (
                          <div className="flex items-center mb-2">
                            <div className="w-8 h-8 bg-linear-to-r from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-sm font-medium mr-2">
                              AI
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            message.type === 'user'
                              ? 'bg-linear-to-r from-brand-600 to-accent-600 text-white'
                              : message.isError
                              ? 'bg-red-50 text-red-800 border border-red-200'
                              : 'bg-white/10 text-white'
                          }`}
                          role={message.isError ? 'alert' : undefined}
                        >
                          <div className="whitespace-pre-wrap">{message.content}</div>
                          {message.isError && message.retryPrompt && (
                            <button
                              type="button"
                              onClick={() => handleSendMessage(message.retryPrompt)}
                              disabled={isLoading}
                              aria-label="Retry the last message"
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white/70 px-3 py-2 text-sm font-medium text-red-800 hover:bg-white disabled:opacity-60"
                            >
                              Try again
                            </button>
                          )}
                        </div>
                        {message.type === 'user' && (
                          <div className="flex items-center justify-end mt-2">
                            <span className="text-xs text-gray-500 mr-2">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-white text-xs">
                              U
                            </div>
                          </div>
                        )}
                        {/* AI Suggestions */}
                        {message.type === 'ai' && message.suggestions && (
                          <motion.div 
                            className="mt-3 flex flex-wrap gap-2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.2 }}
                          >
                            {message.suggestions.map((suggestion, index) => (
                              <motion.button
                                key={index}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="btn btn-sm btn-ghost btn-pill"
                              >
                                {suggestion}
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {/* Typing Indicator */}
                <AnimatePresence>
                  {isTyping && (
                    <motion.div
                      className="flex justify-start"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="max-w-[80%]">
                        <div className="flex items-center mb-2">
                          <div className="w-8 h-8 bg-linear-to-r from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-sm font-medium mr-2">
                            AI
                          </div>
                          <span className="text-xs text-gray-300">typing…</span>
                        </div>
                        <div className="bg-white/10 rounded-2xl px-4 py-3">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-white/30 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-white/30 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-white/30 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
              {/* Input Area */}
              <div className="border-t border-white/10 p-4">
                <div className="flex items-end space-x-3">
                  <div className="flex-1">
                    <textarea
                      ref={inputRef}
                      id="ai-page-message"
                      aria-label="Ask the AI assistant"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask me anything..."
                      className="w-full px-4 py-3 border border-white/15 rounded-xl focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 resize-none transition-colors bg-white/5 text-white placeholder-gray-500"
                      rows={1}
                      style={{ minHeight: '48px', maxHeight: '120px' }}
                      disabled={isLoading}
                    />
                  </div>
                  <MagneticButton
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim() || isLoading}
                    aria-label="Send message"
                    title="Send message"
                    className="btn btn-primary btn-lg"
                  >
                    {isLoading ? (
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </MagneticButton>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </CursorGlow>
            </BorderBeam>
          </div>
          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Quick Actions */}
            <motion.div 
              className="bg-white/5 rounded-xl shadow-xs border border-white/10 p-6"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                <span role="img" aria-label="quick">⚡</span> Quick Actions
              </h3>
              <div className="space-y-3">
                {[
                  { text: "Explain recursion with a code example", icon: "💻" },
                  { text: "What are the best study techniques for exams?", icon: "📅" },
                  { text: "Help me write a Python program", icon: "🐍" },
                  { text: "Summarize data structures and algorithms", icon: "📊" }
                ].map((action, index) => (
                  <motion.button
                    key={index}
                    onClick={() => handleSuggestionClick(action.text)}
                    className="btn btn-ghost w-full text-left justify-start text-sm"
                  >
                    <span role="img" aria-label="action" className="mr-2">{action.icon}</span>
                    {action.text}
                  </motion.button>
                ))}
              </div>
            </motion.div>
            {/* Tips */}
            <motion.div 
              className="bg-linear-to-r from-brand-600 to-accent-600 rounded-xl p-6 text-white"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <h3 className="text-lg font-semibold mb-3">
                <span role="img" aria-label="tips">💡</span> Pro Tips
              </h3>
              <ul className="space-y-2 text-sm">
                <li>• Ask anything — academics, programming, concepts, or general topics</li>
                <li>• Follow up on answers to explore topics in depth</li>
                <li>• Ask for code examples, explanations, or step-by-step solutions</li>
                <li>• Use it for study planning, exam prep, or casual questions</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default AIPage;