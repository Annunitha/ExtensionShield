import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import authService from "../services/authService";
import { supabase } from "../services/supabaseClient";
import realScanService from "../services/realScanService";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [authError, setAuthError] = useState(null);

  const toUiUser = useCallback((sbUser) => {
    if (!sbUser) return null;
    const meta = sbUser.user_metadata || {};
    const appMeta = sbUser.app_metadata || {};
    const provider = appMeta.provider || meta.provider || "email";
    const name = meta.full_name || meta.name || sbUser.email || "User";
    const avatar = meta.avatar_url || meta.picture || null;
    return {
      id: sbUser.id,
      email: sbUser.email,
      name,
      avatar,
      provider,
    };
  }, []);

  // Load session on mount + subscribe to auth changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;
    let fallbackTimeout = null;
    let oauthCallbackResolved = false;

    const load = async () => {
      try {
        // Check if Supabase is configured
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
          console.warn("Supabase not configured - running in anonymous mode");
          if (isMounted) setIsLoading(false);
          return;
        }
        
        // Handle OAuth callback - check for hash fragments
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const error = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');
        
        if (error) {
          console.error("OAuth error:", error, errorDescription);
          setAuthError(errorDescription || error || "Authentication failed");
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          if (isMounted) setIsLoading(false);
          return;
        }
        
        // If we have OAuth tokens in the hash, explicitly set the session
        if (accessToken && refreshToken) {
          console.log("Processing OAuth callback...");
          oauthCallbackResolved = true;
          
          try {
            // Extract all tokens from hash
            const tokenType = hashParams.get('token_type') || 'bearer';
            const expiresIn = hashParams.get('expires_in');
            const expiresAt = hashParams.get('expires_at');
            
            // Construct session object for setSession
            // expires_at should be a Unix timestamp in seconds
            const sessionObj = {
              access_token: accessToken,
              refresh_token: refreshToken,
              token_type: tokenType,
            };
            
            // Add expires_at if available (as number, not string)
            if (expiresAt) {
              sessionObj.expires_at = parseInt(expiresAt, 10);
            } else if (expiresIn) {
              // Calculate expires_at from expires_in if not provided
              sessionObj.expires_at = Math.floor(Date.now() / 1000) + parseInt(expiresIn, 10);
            }
            
            // Set the session explicitly with the tokens from the hash
            // This will trigger onAuthStateChange with SIGNED_IN event
            const { data: sessionData, error: setSessionError } = await supabase.auth.setSession(sessionObj);
            
            if (setSessionError) {
              console.error("Failed to set session from OAuth callback:", setSessionError);
              setAuthError(setSessionError.message || "Failed to complete sign in");
              if (isMounted) setIsLoading(false);
            } else if (sessionData?.session) {
              console.log("OAuth session set successfully, user:", sessionData.session.user?.email);
              // The onAuthStateChange handler will update the state, but we set it here too for immediate feedback
              setSession(sessionData.session);
              setUser(toUiUser(sessionData.session.user));
              setIsSignInModalOpen(false);
              setAuthError(null);
              // Clean up URL hash after successful session set
              window.history.replaceState({}, document.title, window.location.pathname);
              if (isMounted) setIsLoading(false);
            } else {
              console.warn("OAuth callback: setSession succeeded but no session returned");
              // Wait a bit and check session again
              setTimeout(async () => {
                const { data: checkData } = await supabase.auth.getSession();
                if (checkData?.session && isMounted) {
                  setSession(checkData.session);
                  setUser(toUiUser(checkData.session.user));
                  setIsSignInModalOpen(false);
                  setAuthError(null);
                  window.history.replaceState({}, document.title, window.location.pathname);
                }
                if (isMounted) setIsLoading(false);
              }, 500);
            }
          } catch (setSessionErr) {
            console.error("Error setting OAuth session:", setSessionErr);
            setAuthError("Failed to complete sign in. Please try again.");
            if (isMounted) setIsLoading(false);
          }
          
          return;
        }
        
        // If no OAuth callback, get current session normally
        // Get current session with timeout to prevent hanging
        const sessionPromise = supabase.auth.getSession();
        let timeoutFired = false;
        
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timeoutFired = true;
            reject(new Error("Session check timeout - taking too long"));
          }, 5000);
        });
        
        let sessionResult;
        try {
          sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
        } catch (error) {
          // If timeout fired, we'll handle it gracefully
          if (timeoutFired) {
            console.warn("Session check timed out, continuing without session");
            sessionResult = { data: { session: null }, error: null };
          } else {
            throw error;
          }
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
        
        const { data, error: sessionError } = sessionResult;
        
        if (sessionError) throw sessionError;
        if (!isMounted) return;
        
        setSession(data.session || null);
        setUser(toUiUser(data.session?.user));
      } catch (error) {
        console.error("Auth session load failed:", error);
        // Don't crash - just continue without auth
        // Ensure we clear any stuck state
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (isMounted && !oauthCallbackResolved) setIsLoading(false);
      }
    };

    load();

    // Fallback timeout - ensure isLoading is always set to false after max 10 seconds
    fallbackTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn("Auth initialization taking too long, forcing completion");
        setIsLoading(false);
      }
    }, 10000);

    let authStateSubscription;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (!isMounted) return;
          
          console.log("Auth state changed:", event, nextSession ? "has session" : "no session");
          
          setSession(nextSession || null);
          setUser(toUiUser(nextSession?.user));
          
          // Close modal on successful sign in
          if (event === 'SIGNED_IN' && nextSession) {
            console.log("User signed in successfully");
            setIsSignInModalOpen(false);
            setAuthError(null);
            // Clean up URL hash if it still exists
            if (window.location.hash.includes('access_token')) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
          
          // Clear error on sign out
          if (event === 'SIGNED_OUT') {
            setAuthError(null);
          }
          
          // If we were waiting for OAuth callback and now have a session, mark as resolved
          if (oauthCallbackResolved && nextSession) {
            setIsLoading(false);
          }
        });
        authStateSubscription = data;
      }
    } catch (error) {
      console.error("Auth state change subscription failed:", error);
    }

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      clearTimeout(fallbackTimeout);
      authStateSubscription?.subscription?.unsubscribe();
    };
  }, [toUiUser]);

  // Keep API requests in sync with current auth session
  useEffect(() => {
    realScanService.setAccessToken(session?.access_token || null);
  }, [session]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      await authService.signInWithGoogle();
      // OAuth redirects; session will be set by the auth listener on return.
      setIsSignInModalOpen(false);
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGitHub = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      await authService.signInWithGitHub();
      setIsSignInModalOpen(false);
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const sbUser = await authService.signInWithEmail(email, password);
      // Refresh session to ensure it's up to date
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        setSession(sessionData.session);
        setUser(toUiUser(sessionData.session.user));
      } else {
        setUser(toUiUser(sbUser));
      }
      setIsSignInModalOpen(false);
      return sbUser;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toUiUser]);

  const signUpWithEmail = useCallback(async (email, password, name) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const sbUser = await authService.signUpWithEmail(email, password, name);
      // If session exists (email confirmation disabled), set it
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        setSession(sessionData.session);
        setUser(toUiUser(sessionData.session.user));
        setIsSignInModalOpen(false);
      } else {
        // Email confirmation required - user needs to check email
        setUser(toUiUser(sbUser));
        // Don't close modal, show success message instead
      }
      return sbUser;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toUiUser]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.signOut();
      setSession(null);
      setUser(null);
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openSignInModal = useCallback(() => {
    setAuthError(null);
    setIsSignInModalOpen(true);
  }, []);

  const closeSignInModal = useCallback(() => {
    setAuthError(null);
    setIsSignInModalOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Manual refresh function to reset auth state if stuck
  const refreshAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Auth refresh failed:", error);
        setSession(null);
        setUser(null);
      } else {
        setSession(data.session || null);
        setUser(toUiUser(data.session?.user));
      }
    } catch (error) {
      console.error("Auth refresh error:", error);
      setSession(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [toUiUser]);

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!session?.user,
    accessToken: session?.access_token || null,
    getAccessToken: () => session?.access_token || null,
    authError,
    isSignInModalOpen,
    signInWithGoogle,
    signInWithGitHub,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    openSignInModal,
    closeSignInModal,
    clearError,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;





