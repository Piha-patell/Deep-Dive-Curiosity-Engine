"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2, LogIn, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Profile } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup";

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  displayName: string;
  isConfigured: boolean;
  isLoading: boolean;
  modalMode: AuthMode;
  authNotice: string;
  openAuthModal: (mode?: AuthMode, notice?: string) => void;
  closeAuthModal: () => void;
  signIn: (input: { email: string; password: string }) => Promise<{ error?: string }>;
  signUp: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<{ error?: string; message?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(supabase));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AuthMode>("login");
  const [authNotice, setAuthNotice] = useState("");

  const loadProfile = useCallback(async (nextUser: User | null) => {
    if (!supabase || !nextUser) {
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, created_at")
      .eq("id", nextUser.id)
      .maybeSingle();

    setProfile(data ?? null);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(user);
  }, [loadProfile, user]);

  useEffect(() => {
    if (!supabase) return;
    const client: NonNullable<typeof supabase> = supabase;

    let isMounted = true;

    async function hydrate() {
      const {
        data: { user: currentUser },
      } = await client.auth.getUser();

      if (!isMounted) return;
      setUser(currentUser);
      await loadProfile(currentUser);
      if (isMounted) setIsLoading(false);
    }

    hydrate().catch(() => {
      if (isMounted) setIsLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null).catch(() => undefined);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, supabase]);

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    if (!supabase) {
      return { error: "Supabase auth is not configured yet." };
    }

    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) return { error: error.message };

    setAuthNotice("");
    setIsModalOpen(false);
    return {};
  }, [supabase]);

  const signUp = useCallback(async (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => {
    if (!supabase) {
      return { error: "Supabase auth is not configured yet." };
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
        },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm?next=/`
            : undefined,
      },
    });

    if (error) return { error: error.message };

    if (data.user && data.session) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
        },
        { onConflict: "id" },
      );

      if (profileError) return { error: profileError.message };
      await refreshProfile();
      setAuthNotice("");
      setIsModalOpen(false);
      return {};
    }

    setAuthNotice("Check your email to confirm your account, then log in.");
    setModalMode("login");
    return { message: "Check your email to confirm your account, then log in." };
  }, [refreshProfile, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  }, [supabase]);

  const value: AuthContextValue = {
    user,
    profile,
    displayName:
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      user?.user_metadata?.first_name ||
      user?.email?.split("@")[0] ||
      "Account",
    isConfigured: Boolean(supabase),
    isLoading,
    modalMode,
    authNotice,
    openAuthModal: (mode = "login", notice = "") => {
      setModalMode(mode);
      setAuthNotice(notice);
      setIsModalOpen(true);
    },
    closeAuthModal: () => {
      setAuthNotice("");
      setIsModalOpen(false);
    },
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog
        key={`${modalMode}-${authNotice}-${isModalOpen ? "open" : "closed"}`}
        isOpen={isModalOpen}
        mode={modalMode}
        onClose={value.closeAuthModal}
      />
    </AuthContext.Provider>
  );
}

function AuthDialog({
  isOpen,
  mode,
  onClose,
}: {
  isOpen: boolean;
  mode: AuthMode;
  onClose: () => void;
}) {
  const auth = useAuth();
  const [currentMode, setCurrentMode] = useState<AuthMode>(mode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState(auth.authNotice);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setIsSubmitting(true);

    if (currentMode === "signup") {
      const result = await auth.signUp({ firstName, lastName, email, password });
      if (result.error) setFeedback(result.error);
      if (result.message) setFeedback(result.message);
    } else {
      const result = await auth.signIn({ email, password });
      if (result.error) setFeedback(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0f14]/95 p-6 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-sm text-cyan-200">
              {currentMode === "signup" ? "Create your account" : "Welcome back"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              {currentMode === "signup" ? "Save your dives and keep exploring" : "Log in to DeepDive"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => {
              setCurrentMode("login");
              setFeedback("");
            }}
            className={`flex-1 rounded-xl px-3 py-2 text-sm transition ${
              currentMode === "login"
                ? "bg-cyan-300/15 text-cyan-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Login
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentMode("signup");
              setFeedback("");
            }}
            className={`flex-1 rounded-xl px-3 py-2 text-sm transition ${
              currentMode === "signup"
                ? "bg-cyan-300/15 text-cyan-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Sign up
            </span>
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {currentMode === "signup" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                value={firstName}
                onChange={setFirstName}
                placeholder="Ada"
              />
              <Field
                label="Last name"
                value={lastName}
                onChange={setLastName}
                placeholder="Lovelace"
              />
            </div>
          ) : null}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />

          {feedback ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {feedback}
            </div>
          ) : null}

          <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {currentMode === "signup" ? "Create account" : "Log in"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
      />
    </label>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
