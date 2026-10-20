"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <form action={action} className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-card shadow-sm">
        <div className="bg-brand pb-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ft-logo.jpg" alt="FT Interior Design & Architecture" className="mx-auto w-52" />
        </div>
        <div className="space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted">Use your Odoo account.</p>
        </div>
        <label className="block text-sm font-medium" htmlFor="login">Login</label>
        <input id="login" name="login" autoComplete="username" required className="h-11 w-full rounded-md border border-line px-3 focus:border-primary" />
        <label className="block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 w-full rounded-md border border-line px-3 focus:border-primary" />
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        <button disabled={pending} className="h-11 w-full rounded-md bg-primary font-medium text-white transition hover:bg-primary-dark disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
        </div>
      </form>
    </main>
  );
}
