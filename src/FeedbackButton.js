import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Loader } from 'lucide-react';

function FeedbackButton({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feature');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      alert('Please sign in to submit feedback');
      return;
    }

    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('user_feedback')
        .insert([{
          user_id: user.id,
          feedback_type: feedbackType,
          message: message.trim(),
          status: 'new'
        }]);

      if (error) throw error;

      setSubmitted(true);
      setMessage('');
      
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
      }, 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Feedback Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-4 bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-full shadow-2xl shadow-blue-500/50 transition-all hover:scale-110"
        title="Send Feedback"
      >
        <MessageSquare className="w-6 h-6 text-white" />
      </button>

      {/* Feedback Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-gray-900 to-blue-900 rounded-2xl p-6 border border-cyan-400/30 shadow-2xl max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Send Feedback</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-green-400 font-semibold text-lg">Thank you!</p>
                  <p className="text-cyan-300 text-sm mt-2">Your feedback has been received.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-cyan-300 text-sm mb-2">Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['feature', 'bug', 'other'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFeedbackType(type)}
                          className={`py-2 px-3 rounded-lg text-sm font-semibold transition ${
                            feedbackType === type
                              ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                              : 'bg-white/10 text-cyan-300 hover:bg-white/20'
                          }`}
                        >
                          {type === 'feature' ? '✨ Feature' : type === 'bug' ? '🐛 Bug' : '💬 Other'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-cyan-300 text-sm mb-2">Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what you think..."
                      rows={5}
                      className="w-full px-4 py-3 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white resize-none"
                      required
                    />
                    <p className="text-xs text-cyan-500 mt-1">{message.length}/500 characters</p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
                  >
                    {submitting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Feedback</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default FeedbackButton;