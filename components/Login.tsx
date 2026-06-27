"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { api, getGateToken } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "./Icons";

type Step = "master" | "google";

function GoogleProfile({
  name,
  email,
  image,
  loading,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  loading?: boolean;
}) {
  const initial = (name?.trim()?.[0] || email?.trim()?.[0] || "?").toUpperCase();

  return (
    <div className="mb-4 flex flex-col items-center gap-3 text-center">
      <div className="relative">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name ? `${name}'s profile` : "Profile"}
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full border border-[var(--border)] object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-lg font-semibold">
            {initial}
          </div>
        )}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
            <span className="spinner h-5 w-5" />
          </span>
        )}
      </div>
      <div>
        {name && <p className="text-base font-semibold text-[var(--foreground)]">{name}</p>}
        {email && <p className="text-sm text-muted-foreground">{email}</p>}
      </div>
      {loading && <p className="text-sm text-muted-foreground">Opening your cloud…</p>}
    </div>
  );
}

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>("master");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isGoogleAuthed = status === "authenticated" && Boolean(session?.user);

  const finishLogin = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await api.completeSession();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start your cloud session.");
      setLoading(false);
    }
  }, [onSuccess]);

  useEffect(() => {
    if (isGoogleAuthed && getGateToken()) {
      setStep("google");
      finishLogin();
    }
  }, [isGoogleAuthed, session, finishLogin]);

  useEffect(() => {
    if (step === "google" && isGoogleAuthed) {
      finishLogin();
    }
  }, [step, isGoogleAuthed, finishLogin]);

  const submitMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.login(password);
      if (isGoogleAuthed) {
        await finishLogin();
      } else {
        setStep("google");
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  const signInWithGoogle = () => {
    setError("");
    setLoading(true);
    signIn("google");
  };

  return (
    <div className="glow-page flex min-h-dvh items-center justify-center p-4 text-[var(--foreground)]">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)]">
            <Icon.Cloud size={28} />
          </div>
          <h1 className="text-2xl font-bold uppercase tracking-[0.08em]">GigaChad Cloud</h1>
          <p className="label-caps mt-2 text-[10px]">
            Your private vault for photos, video &amp; audio.
          </p>
        </div>

        {step === "master" ? (
          <form onSubmit={submitMaster} className="glow-card p-5">
            <Label className="label-caps mb-1.5 block text-[10px] text-muted-foreground">
              Step 1 — Master password
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
                <Icon.Lock size={18} />
              </span>
              <Input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter master password"
                className="pl-10"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-[var(--radius)] border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 animate-fade-in">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="glow-btn-primary mt-4 w-full px-4 py-2.5 disabled:opacity-50"
            >
              {loading ? <span className="spinner mx-auto h-4 w-4" /> : "Continue"}
            </button>
          </form>
        ) : (
          <div className="glow-card p-5">
            <p className="label-caps mb-1 text-[10px] text-muted-foreground">Step 2 — Your account</p>

            {isGoogleAuthed && session?.user ? (
              <>
                <GoogleProfile
                  name={session.user.name}
                  email={session.user.email}
                  image={session.user.image}
                  loading={loading}
                />
                {error && (
                  <p className="mb-3 rounded-[var(--radius)] border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 animate-fade-in">
                    {error}
                  </p>
                )}
                {!loading && error && (
                  <button
                    type="button"
                    onClick={finishLogin}
                    className="glow-btn-primary mb-3 w-full px-4 py-2.5"
                  >
                    Try again
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="mb-4 text-sm text-[var(--foreground)]">
                  Sign in with Google to open your personal cloud. Each account gets its own storage.
                </p>

                {error && (
                  <p className="mb-3 rounded-[var(--radius)] border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 animate-fade-in">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={loading}
                  className="glow-btn-primary flex w-full items-center justify-center gap-2 px-4 py-2.5 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="spinner h-4 w-4" />
                  ) : (
                    <>
                      <Icon.User size={18} />
                      Sign in with Google
                    </>
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setStep("master");
                setError("");
                setLoading(false);
              }}
              disabled={loading}
              className="btn-ghost mt-3 w-full text-sm text-muted-foreground disabled:opacity-50"
            >
              Back
            </button>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Master password gates access. Google sign-in gives you your own private cloud.
        </p>
      </div>
    </div>
  );
}
