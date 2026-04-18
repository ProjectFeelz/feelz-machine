import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const { signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError]               = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const redirectTo = searchParams.get('redirect') || null;

  // If user is already logged in (e.g. returned from OAuth), honour the redirect
  useEffect(() => {
    if (user) {
      navigate(redirectTo || '/', { replace: true });
    }
  }, [user]);

  const handleGoogle = async () => {
    if (!ageConfirmed) {
      setError('Please confirm you are 13 or older to continue.');
      return;
    }
    try {
      // Store redirect destination so AuthContext can read it after OAuth callback
      if (redirectTo) sessionStorage.setItem('post_login_redirect', redirectTo);
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition"
      >
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Feelz Machine</h1>
          <p className="text-sm text-white/40">Sign in to start listening</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Age confirmation */}
        <label className="flex items-start space-x-3 mb-5 cursor-pointer group">
          <div className="relative flex-shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={e => { setAgeConfirmed(e.target.checked); setError(''); }}
              className="sr-only"
            />
            <div className={`w-5 h-5 rounded flex items-center justify-center border transition ${
              ageConfirmed
                ? 'bg-white border-white'
                : 'bg-transparent border-white/20 group-hover:border-white/40'
            }`}>
              {ageConfirmed && (
                <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-xs text-white/40 leading-relaxed group-hover:text-white/60 transition">
            I confirm that I am 13 years of age or older
          </span>
        </label>

        <div className="space-y-3">
          <button
            onClick={handleGoogle}
            className={`w-full py-3 font-semibold rounded-lg transition flex items-center justify-center space-x-3 ${
              ageConfirmed
                ? 'bg-white hover:bg-white/90 text-black'
                : 'bg-white/20 text-white/40 cursor-not-allowed'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill={ageConfirmed ? '#4285F4' : 'currentColor'} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill={ageConfirmed ? '#34A853' : 'currentColor'} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill={ageConfirmed ? '#FBBC05' : 'currentColor'} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill={ageConfirmed ? '#EA4335' : 'currentColor'} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[11px] text-white/20">
            By continuing, you agree to our{' '}
            <a href="/terms-of-use" className="text-white/30 hover:text-white/50 underline">Terms</a>
            {' '}and{' '}
            <a href="/privacy-policy" className="text-white/30 hover:text-white/50 underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}