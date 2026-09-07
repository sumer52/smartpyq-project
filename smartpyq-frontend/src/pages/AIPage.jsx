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
  const inputRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);
  const handleSendMessage = async (message = inputMessage) => {
    if (!message.trim() || isLoading) return;
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setIsTyping(true);
    try {
      // Use the chat API (simple endpoint works for guests and logged-in users)
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/v1/chat/simple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: message.trim(),
          session_id: sessionId
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const aiResponse = {
        id: Date.now() + 1,
        type: 'ai',
        content: data.response || 'I apologize, but I\'m having trouble processing your request right now. Please try again.',
        timestamp: new Date().toISOString(),
        suggestions: generateSuggestions(message.trim())
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('Chat API error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: "Failed to send message. Please try again.",
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
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
                  <Sparkles className="h-6 w-6 text-purple-400" /> <TextScramble text="SmartPYQ AI" delay={100} />
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
            <BorderBeam className="rounded-xl" colorFrom="rgba(139,92,246,0.2)" colorTo="rgba(59,130,246,0.15)">
            <CursorGlow className="bg-white/5 rounded-xl shadow-sm border border-white/10 h-[600px] flex flex-col" glowColor="rgba(139,92,246,0.06)">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                            <div className="w-8 h-8 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-sm font-medium mr-2">
                              AI
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                        <div className={`rounded-2xl px-4 py-3 ${
                          message.type === 'user'
                            ? 'bg-gradient-to-r from-brand-600 to-accent-600 text-white'
                            : message.isError
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-white/10 text-white'
                        }`}>
                          <div className="whitespace-pre-wrap">{message.content}</div>
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
                          <div className="w-8 h-8 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-sm font-medium mr-2">
                            AI
                          </div>
                          <span className="text-xs text-gray-500">typing...</span>
                        </div>
                        <div className="bg-white/10 rounded-2xl px-4 py-3">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-white/30 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
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
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask me anything..."
                      className="w-full px-4 py-3 border border-white/15 rounded-xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 resize-none transition-colors bg-white/5 text-white placeholder-gray-500"
                      rows={1}
                      style={{ minHeight: '48px', maxHeight: '120px' }}
                      disabled={isLoading}
                    />
                  </div>
                  <MagneticButton
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim() || isLoading}
                    className="btn btn-primary px-6 py-3"
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
              className="bg-white/5 rounded-xl shadow-sm border border-white/10 p-6"
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
              className="bg-gradient-to-r from-brand-600 to-accent-600 rounded-xl p-6 text-white"
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