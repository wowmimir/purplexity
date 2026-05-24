import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

const supabase = createClient();

const providers = [
  {
    key: "google" as const,
    label: "Continue with Google",
    renderIcon: () => <span className="text-base font-semibold text-[#f4efe6]">G</span>,
  },
  {
    key: "github" as const,
    label: "Continue with GitHub",
    renderIcon: () => <span className="text-sm font-semibold text-[#f4efe6]">GH</span>,
  },
];

const Auth = () => {
  const [loading, setLoading] = useState<"google" | "github" | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session?.user) {
        navigate("/", { replace: true });
      }
    }

    void checkSession();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function login(provider: "github" | "google") {
    setLoading(provider);
    await supabase.auth.signInWithOAuth({
      provider,
    });
    setLoading(null);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#111111] text-[#f4efe6]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(226,219,205,0.09),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_22%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1320px] flex-col px-6 py-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-[#1d1d1d]">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="text-sm uppercase tracking-[0.26em] text-[#7e7a72]">Purplexity</div>
              <div className="text-sm text-[#aca79f]">Answer engine</div>
            </div>
          </div>
          <div className="hidden rounded-full border border-white/8 bg-white/4 px-4 py-2 text-sm text-[#b0aba4] sm:block">
            Web search + streaming answers
          </div>
        </div>

        <div className="grid flex-1 items-center gap-16 py-12 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="max-w-[680px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/8 bg-[#1b1b1b] px-4 py-2 text-sm text-[#c7c2ba]">
              <Sparkles className="size-4" />
              Ask, read, and continue in one thread
            </div>
            <h1 className="max-w-[12ch] text-[52px] font-medium leading-[0.98] tracking-[-0.05em] text-[#f4efe6] md:text-[72px]">
              Search-first answers in a Perplexity-style shell.
            </h1>
            <p className="mt-6 max-w-[560px] text-lg leading-8 text-[#8e8980]">
              Your backend is already wired. This frontend turns it into a focused research surface with streaming chat,
              persistent history, and a dark product-first interface.
            </p>
            <div className="mt-10 grid gap-4 text-sm text-[#b6b1a9] md:grid-cols-3">
              <div className="rounded-[24px] border border-white/8 bg-[#171717] p-5">
                <div className="text-[#f0ebe1]">Streaming output</div>
                <div className="mt-2 text-[#817c74]">Live answer rendering from the existing SSE backend.</div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-[#171717] p-5">
                <div className="text-[#f0ebe1]">Conversation memory</div>
                <div className="mt-2 text-[#817c74]">Jump between saved threads from the sidebar history.</div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-[#171717] p-5">
                <div className="text-[#f0ebe1]">Research tabs</div>
                <div className="mt-2 text-[#817c74]">Answer, links, and image placeholders in one workspace.</div>
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-[440px] rounded-[32px] border border-white/10 bg-[#171717]/92 p-8 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="mb-8">
              <div className="text-sm uppercase tracking-[0.24em] text-[#807b73]">Sign In</div>
              <h2 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-[#f5f0e6]">Continue to Purplexity</h2>
              <p className="mt-3 text-sm leading-7 text-[#8a857c]">
                Use your existing Supabase OAuth providers. Once authenticated, the app opens directly into the new
                search workspace.
              </p>
            </div>

            <div className="space-y-3">
              {providers.map(provider => {
                const isLoading = loading === provider.key;

                return (
                  <Button
                    key={provider.key}
                    onClick={() => void login(provider.key)}
                    disabled={!!loading}
                    className="h-14 w-full justify-start rounded-2xl border border-white/8 bg-[#202020] px-4 text-[15px] text-[#f4efe6] hover:bg-[#262626]"
                  >
                    {isLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-full bg-[#2a2a2a]">
                        {provider.renderIcon()}
                      </span>
                    )}
                    {provider.label}
                  </Button>
                );
              })}
            </div>

            <div className="mt-8 rounded-[24px] border border-white/8 bg-[#131313] px-4 py-4 text-sm leading-7 text-[#807b73]">
              Current pass keeps the existing auth implementation and focuses on matching the application experience
              after login.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Auth;
