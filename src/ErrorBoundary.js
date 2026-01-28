import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-8">
          <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-red-300 mb-4">Something went wrong</h1>
            <p className="text-red-200 mb-4">The app encountered an error:</p>
            <pre className="bg-black/50 p-4 rounded text-xs text-red-300 overflow-auto">
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;