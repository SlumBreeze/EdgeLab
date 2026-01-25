import React, { useState } from "react";
import { useAuth } from "../components/AuthContext";
import { RefreshCw } from "lucide-react";

const Login: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.message || "Failed to sign in");
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-base flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-ink-panel border border-ink-gray/30 rounded-2xl shadow-2xl p-8 text-center space-y-8">
        {/* Logo / Header */}
        <div className="space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-ink-accent to-blue-600 rounded-xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-3xl">🧊</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-ink-text tracking-tight">
              EdgeLab
            </h1>
            <p className="text-ink-text/50 mt-2">
              Professional Sports Betting Intelligence
            </p>
          </div>
        </div>

        {/* Login Area */}
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full h-12 bg-white text-gray-900 rounded-lg font-semibold flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? (
              <RefreshCw className="w-5 h-5 animate-spin text-ink-base" />
            ) : (
              <img
                src="https://www.google.com/favicon.ico"
                alt="Google"
                className="w-5 h-5"
              />
            )}
            <span>{isLoggingIn ? "Connecting..." : "Sign in with Google"}</span>
          </button>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-ink-text/30">
          Restricted Access &bull; Authorized Personnel Only
        </p>
      </div>
    </div>
  );
};

export default Login;
