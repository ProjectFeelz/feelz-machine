import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Mail } from 'lucide-react';

export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('options');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleGoogle = async () => {
    try { await signInWithGoogle(); } catch (err) { setError(err.message); }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      if (mode === 'email-login') { await signInWithEmail(email, password); navigate('/'); }
      else { await signUpWithEmail(email, password); setMessage('Check your email for a confirmation link!'); }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <button onClick={() => mode === 'options' ? navigate('/') : setMode('options')} className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Feelz Machine</h1>
          <p className="text-sm text-white/40">Sign in to start listening</p>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        {message && <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">{message}</div>}
        {mode === 'options' && (
          <div className="space-y-3">
            <button onClick={handleGoogle} className="w-full py-3 bg-white hover:bg-white/90 text-black font-semibold rounded-lg transition flex items-center justify-center space-x-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span>Continue with Google</span>
            </button>
            <button onClick={() => setMode('email-login')} className="w-full py-3 bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium rounded-lg transition flex items-center justify-center space-x-3">
              <Mail className="w-5 h-5" /><span>Sign in with Email</span>
            </button>
            <div className="text-center pt-2">
              <button onClick={() => setMode('email-signup')} className="text-sm text-white/40 hover:text-white/60 transition">Don't have an account? <span className="text-white font-medium">Sign up</span></button>
            </div>
          </div>
        )}
        {(mode === 'email-login' || mode === 'email-signup') && (
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required className="w-full px-4 py-3 bg-white/[0.06] rounded-lg text-white placeholder-white/30 outline-none focus:bg-white/[0.1] transition text-sm" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6} className="w-full px-4 py-3 bg-white/[0.06] rounded-lg text-white placeholder-white/30 outline-none focus:bg-white/[0.1] transition text-sm" />
            <button type="submit" disabled={loading} className="w-full py-3 bg-white text-black font-semibold rounded-lg transition hover:bg-white/90 disabled:opacity-50">{loading ? 'Please wait...' : mode === 'email-login' ? 'Sign In' : 'Create Account'}</button>
            <div className="text-center pt-1">
              <button type="button" onClick={() => setMode(mode === 'email-login' ? 'email-signup' : 'email-login')} className="text-sm text-white/40 hover:text-white/60 transition">{mode === 'email-login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</button>
            </div>
          </form>
        )}
        <div className="mt-8 text-center">
          <p className="text-[11px] text-white/20">By continuing, you agree to our <a href="/terms-of-use" className="text-white/30 hover:text-white/50 underline">Terms</a> and <a href="/privacy-policy" className="text-white/30 hover:text-white/50 underline">Privacy Policy</a></p>
        </div>
      </div>
    </div>
  );
}
