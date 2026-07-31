import React, { useState } from "react";
import { useAuth } from "../components/AuthContext";

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
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo" aria-hidden="true">EL</div>
        <p className="auth-eyebrow">Restricted access</p>
        <h1>Sign in to EdgeLab</h1>
        <p>
          Use the Google account authorized by the EdgeLab administrator.
        </p>
        <div className="auth-actions">
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="auth-login-button"
          >
            {isLoggingIn ? "Connecting…" : "Sign in with Google"}
          </button>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <p className="auth-note">
          Authentication confirms identity. The backend separately checks the
          account against its private user allowlist.
        </p>
      </section>
    </main>
  );
};

export default Login;
