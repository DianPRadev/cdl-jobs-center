import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type Provider = "google" | "facebook";

const CALLBACK_URL = `${window.location.origin}/auth/callback`;

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="white" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

export function SocialLoginButtons() {
  const [loading, setLoading] = useState<Provider | null>(null);

  const handleSocial = async (provider: Provider) => {
    setLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: CALLBACK_URL },
      });
      if (error) throw error;
      // Browser redirects on success — no further action
    } catch (err) {
      const label = provider === "google" ? "Google" : "Facebook";
      toast.error(err instanceof Error ? err.message : `Failed to sign in with ${label}`);
      setLoading(null);
    }
  };

  const disabled = loading !== null;

  return (
    <div className="space-y-2.5">
      {/* Google */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleSocial("google")}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-white dark:text-gray-700 dark:hover:bg-gray-100 dark:border-gray-300"
      >
        {loading === "google" ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </button>

      {/* Facebook */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleSocial("facebook")}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-[#1877F2] bg-[#1877F2] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#166FE5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading === "facebook" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FacebookIcon />
        )}
        Continue with Facebook
      </button>
    </div>
  );
}

/** Horizontal divider with "or" text */
export function OrDivider({ text = "or sign in with email" }: { text?: string }) {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-3 text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
