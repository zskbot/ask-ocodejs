import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { X, Github, Mail, ShieldCheck, AlertCircle, Chrome, LogOut } from "lucide-react";
import { UserProfile } from "../types/shell";
import { auth } from "../lib/firebase-client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
}

type AuthProviderName = "github" | "google";

function profileFromUser(user: typeof auth.currentUser, provider: AuthProviderName | "email"): Partial<UserProfile> {
  if (!user) return {};
  return {
    username: user.displayName || user.email?.split("@")[0] || "User",
    role: "Authenticated user",
    avatarUrl: user.photoURL || undefined,
    authProvider: provider,
    email: user.email || undefined,
  };
}

function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  if (code.includes("popup-closed-by-user")) return "Đã đóng cửa sổ đăng nhập.";
  if (code.includes("account-exists-with-different-credential")) return "Email này đã liên kết với một phương thức đăng nhập khác.";
  if (code.includes("operation-not-allowed") || code.includes("provider-not-enabled")) return "Phương thức này chưa được bật trong Firebase Authentication.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email hoặc mật khẩu không đúng.";
  if (code.includes("email-already-in-use")) return "Email đã có tài khoản. Hãy chuyển sang đăng nhập.";
  if (code.includes("weak-password")) return "Mật khẩu phải có ít nhất 6 ký tự.";
  if (code.includes("invalid-email")) return "Email không hợp lệ.";
  if (code.includes("too-many-requests")) return "Có quá nhiều lần thử. Hãy đợi rồi thử lại.";
  return "Không thể xác thực. Kiểm tra cấu hình Firebase Authentication và thử lại.";
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const completeSignIn = (firebaseUser: NonNullable<typeof auth.currentUser>, provider: AuthProviderName | "email") => {
    onUpdateUser(profileFromUser(firebaseUser, provider));
    setNotice("Đăng nhập thành công. Phiên Firebase sẽ được xác minh ở backend khi gọi v0 Builder.");
  };

  const signInOAuth = async (providerName: AuthProviderName) => {
    setBusy(true);
    setNotice("");
    try {
      const provider = providerName === "github" ? new GithubAuthProvider() : new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      completeSignIn(result.user, providerName);
    } catch (error) {
      setNotice(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const result = mode === "signup"
        ? await createUserWithEmailAndPassword(auth, email.trim(), password)
        : await signInWithEmailAndPassword(auth, email.trim(), password);
      if (mode === "signup") {
        await updateProfile(result.user, { displayName: email.trim().split("@")[0] });
      }
      completeSignIn(result.user, "email");
    } catch (error) {
      setNotice(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut(auth);
      onUpdateUser({ username: "Guest", role: "Guest profile", authProvider: "guest", avatarUrl: undefined, email: undefined });
      setNotice("Đã đăng xuất.");
    } catch {
      setNotice("Không thể đăng xuất. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0c] text-white shadow-2xl shadow-black/60">
        <button type="button" onClick={onClose} aria-label="Close sign in dialog" className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"><X size={18}/></button>
        <div className="px-6 pb-6 pt-8 sm:px-8">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]"><ShieldCheck size={22}/></div>
          <h2 id="auth-modal-title" className="text-center text-xl font-semibold tracking-tight">Ask OCode.js Authentication</h2>
          <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-5 text-zinc-400">Đăng nhập để sử dụng v0 Builder. API key v0 không được gửi xuống trình duyệt.</p>
          {user.authProvider !== "guest" ? (
            <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
              <p className="text-sm font-medium text-white">{user.username}</p>
              <p className="mt-1 text-xs text-zinc-400">{user.email || "Đã xác thực"}</p>
              <button type="button" disabled={busy} onClick={() => void handleSignOut()} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50"><LogOut size={15}/> Sign out</button>
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-2.5">
                <button type="button" disabled={busy} onClick={() => void signInOAuth("github")} className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium transition hover:bg-white/[0.08] disabled:opacity-50"><Github size={18}/> Continue with GitHub</button>
                <button type="button" disabled={busy} onClick={() => void signInOAuth("google")} className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium transition hover:bg-white/[0.08] disabled:opacity-50"><Chrome size={17}/> Continue with Google</button>
              </div>
              <div className="my-5 flex items-center gap-3 text-[11px] text-zinc-500"><span className="h-px flex-1 bg-white/10"/><span>or continue with email</span><span className="h-px flex-1 bg-white/10"/></div>
              <form onSubmit={submitEmail} className="space-y-2.5">
                <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300">Email address</label>
                <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30"/>
                <label htmlFor="auth-password" className="block pt-1 text-xs font-medium text-zinc-300">Password</label>
                <input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 6 characters" className="h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30"/>
                <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"><Mail size={16} className="mr-2 inline-block"/>{busy ? "Processing..." : mode === "signup" ? "Create account" : "Sign in"}</button>
              </form>
              <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }} className="mt-3 w-full text-center text-xs text-zinc-400 hover:text-white">{mode === "signin" ? "New here? Create an account" : "Already registered? Sign in"}</button>
            </>
          )}
          {notice && <div role="status" className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100"><AlertCircle size={16} className="mt-0.5 shrink-0"/><span>{notice}</span></div>}
          <p className="mt-5 text-center text-[10px] leading-4 text-zinc-600">Provider methods must also be enabled in Firebase Console → Authentication → Sign-in method.</p>
        </div>
      </section>
    </div>
  );
};
