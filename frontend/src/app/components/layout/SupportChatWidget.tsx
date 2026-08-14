import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  FileQuestion,
  Headset,
  HelpCircle,
  Home,
  LifeBuoy,
  MessageSquare,
  MessageSquareText,
  Paperclip,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

interface ChatMessage {
  id: string;
  sender: "bot" | "agent" | "user";
  senderName: string;
  text: string;
  timestamp: string;
}

const KNOWLEDGE_ARTICLES = [
  {
    id: "art-1",
    title: "Device Lock & Remote Unlocking",
    category: "Hardware",
    summary: "How to trigger remote Knox / MDM unlock for settled customers.",
    icon: Smartphone,
  },
  {
    id: "art-2",
    title: "Reconciling Mobile Money Callbacks",
    category: "Finance",
    summary: "Resolving pending MTN & Orange Money transaction mismatches.",
    icon: Wallet,
  },
  {
    id: "art-3",
    title: "Credit Risk Scoring & Underwriting",
    category: "Operations",
    summary: "Automated underwriting decision trees and override permissions.",
    icon: ShieldCheck,
  },
  {
    id: "art-4",
    title: "Exporting Audited Investor Reports",
    category: "Reporting",
    summary: "Generating GAAP/IFRS compliant loan-book extracts.",
    icon: FileQuestion,
  },
];

export function SupportChatWidget() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "messages">("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<typeof KNOWLEDGE_ARTICLES[0] | null>(null);

  // Chat message thread state
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      sender: "agent",
      senderName: "Sarah (Eon Support)",
      text: "Hello! How can our operations & portfolio team assist you today?",
      timestamp: "Just now",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userDisplayName =
    auth.session?.user?.user_metadata?.full_name ||
    auth.session?.user?.email?.split("@")[0] ||
    "Team Member";
  const firstName = userDisplayName.split(" ")[0];

  const filteredArticles = KNOWLEDGE_ARTICLES.filter(
    (art) =>
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    if (activeTab === "messages") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab, isTyping]);

  function handleSendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const text = inputMessage.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      senderName: userDisplayName,
      text,
      timestamp: "Just now",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsTyping(true);

    // Automated smart assistant reply
    setTimeout(() => {
      let replyText = "Thank you for reaching out! A support specialist has received your request and will follow up shortly.";
      const lower = text.toLowerCase();
      if (lower.includes("device") || lower.includes("lock") || lower.includes("unlock")) {
        replyText = "For immediate device control, go to Device Management, select the IMEI, and click 'Instant Unlock'. Knox callbacks settle in real-time.";
      } else if (lower.includes("payment") || lower.includes("reconcil") || lower.includes("momo")) {
        replyText = "Mobile money callbacks are verified idempotently. Check Finance > Reconciliation for live provider settlement webhooks.";
      } else if (lower.includes("kyc") || lower.includes("review") || lower.includes("tenant")) {
        replyText = "Financing applications under KYC review are processed through Didit biometrics and queued in the Applications queue.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          senderName: "Eon Assistant",
          text: replyText,
          timestamp: "Just now",
        },
      ]);
      setIsTyping(false);
    }, 900);
  }

  function startChatWithTopic(topic?: string) {
    setActiveTab("messages");
    if (topic) {
      const promptMsg: ChatMessage = {
        id: `usr-${Date.now()}`,
        sender: "user",
        senderName: userDisplayName,
        text: `Inquiry regarding: ${topic}`,
        timestamp: "Just now",
      };
      setMessages((prev) => [...prev, promptMsg]);
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: "bot",
            senderName: "Eon Assistant",
            text: `I've opened a support ticket for "${topic}". An operations agent is ready to assist.`,
            timestamp: "Just now",
          },
        ]);
        setIsTyping(false);
      }, 700);
    }
  }

  return (
    <>
      {/* Floating Trigger Button (Bottom-Right) - High Contrast & Balanced */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Toggle EonPay support assistant"
        title="EonPay Support Assistant"
        className={cn(
          "fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex size-12 items-center justify-center rounded-full transition-all duration-200 shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/25",
          isOpen
            ? "bg-emerald-600 text-white hover:bg-emerald-500 rotate-0 scale-100 shadow-emerald-600/30"
            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/35 hover:scale-105 active:scale-95",
        )}
      >
        {isOpen ? (
          <X className="size-5.5 stroke-[2.2]" />
        ) : (
          <div className="relative flex items-center justify-center">
            <Headset className="size-5.5 stroke-[2]" />
            <span className="absolute -top-1 -right-1 flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00DF81] opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#00DF81] ring-2 ring-emerald-700" />
            </span>
          </div>
        )}
      </button>

      {/* Floating Support Modal Window */}
      {isOpen && (
        <div className="fixed bottom-18 right-3 sm:bottom-20 sm:right-5 z-50 flex h-[560px] max-h-[calc(100vh-5.5rem)] w-[calc(100vw-1.5rem)] sm:w-[380px] flex-col overflow-hidden rounded-[26px] border border-border/90 bg-card text-card-foreground shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header Section with Agent Photos and Soft Ambient Glow */}
          <div className="relative overflow-hidden bg-gradient-to-b from-[#0e2a1a] via-[#091f13] to-[#0c130f] p-4.5 text-white border-b border-border/60">
            {/* Soft Ambient Aurora */}
            <div className="pointer-events-none absolute -top-10 -left-10 size-44 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-6 -right-6 size-36 rounded-full bg-teal-500/15 blur-3xl" />

            {/* Top Row: Brand, Support Agent Photo Stack, and Close Button */}
            <div className="relative z-10 flex items-center justify-between">
              {/* Brand Title */}
              <div className="flex items-center gap-2">
                <div className="grid size-7.5 place-items-center rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-[#00DF81]">
                  <Headset className="size-4 stroke-[2.2]" />
                </div>
                <div>
                  <span className="font-bold text-sm tracking-tight text-white block leading-tight">
                    EonPay <span className="text-xs text-[#00DF81] font-semibold">Support</span>
                  </span>
                  <span className="text-[10px] text-slate-300 font-medium flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-[#00DF81]" /> Official Support
                  </span>
                </div>
              </div>

              {/* 3 Support Agent Photos with Online Indicator & Close Icon */}
              <div className="flex items-center gap-2.5">
                {/* 3 Overlapping Support Team Photos */}
                <div className="flex -space-x-2">
                  <div className="relative size-7.5 overflow-hidden rounded-full border-2 border-[#091f13] bg-slate-700 shadow-xs">
                    <img
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80"
                      alt="Support Agent"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="relative size-7.5 overflow-hidden rounded-full border-2 border-[#091f13] bg-slate-700 shadow-xs">
                    <img
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80"
                      alt="Support Agent"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="relative size-7.5 overflow-hidden rounded-full border-2 border-[#091f13] bg-slate-700 shadow-xs">
                    <img
                      src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80"
                      alt="Support Agent"
                      className="size-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 size-2 rounded-full bg-[#00DF81] ring-2 ring-[#091f13]" />
                  </div>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close support dialog"
                  className="grid size-7 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Greeting Header */}
            <div className="relative z-10 mt-4">
              <div className="flex items-center gap-1 text-xs text-slate-300">
                <span>Hello, {firstName}</span>
                <Sparkles className="size-3 text-[#00DF81]" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-white mt-0.5">
                How can we help you?
              </h3>
            </div>
          </div>

          {/* Main Body Content */}
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar bg-card/95">
            {activeTab === "home" ? (
              <div className="space-y-3.5">
                {/* 1. Start a conversation Card */}
                <button
                  type="button"
                  onClick={() => startChatWithTopic()}
                  className="group flex w-full items-center justify-between rounded-2xl border border-border bg-muted/30 p-3.5 text-left transition-all hover:border-emerald-500/50 hover:bg-accent/40 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#00DF81] border border-emerald-500/20 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                      <MessageSquare className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-[#00DF81] transition-colors">
                        Send us a message
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Typical response within a few minutes
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
                </button>

                {/* 2. Knowledge Hub Search Card */}
                <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">Find an answer yourself</span>
                    <span className="text-[10px] text-muted-foreground font-mono">Self-service</span>
                  </div>

                  {/* Search Bar */}
                  <div className="relative flex items-center">
                    <Search className="absolute left-2.5 size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search support articles..."
                      className="h-8.5 w-full rounded-xl border border-border bg-muted/40 pl-8 pr-3 text-xs outline-none text-foreground placeholder:text-muted-foreground focus:border-emerald-500/60"
                    />
                  </div>

                  {/* Article List Preview */}
                  <div className="space-y-1 pt-1">
                    {filteredArticles.slice(0, 3).map((art) => (
                      <button
                        key={art.id}
                        type="button"
                        onClick={() => setSelectedArticle(art)}
                        className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                      >
                        <span className="truncate font-medium text-[11px]">{art.title}</span>
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Quick Assistance Operations */}
                <div className="rounded-2xl border border-border bg-card p-3 shadow-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    Quick Operations
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => startChatWithTopic("Device Knox Lock")}
                      className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-2 text-left text-xs font-medium hover:border-emerald-500/40 hover:bg-accent/40 transition-all"
                    >
                      <Smartphone className="size-3.5 text-emerald-600 dark:text-[#00DF81] shrink-0" />
                      <span className="truncate text-[11px]">Device Unlock</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startChatWithTopic("Payment Settlement")}
                      className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-2 text-left text-xs font-medium hover:border-emerald-500/40 hover:bg-accent/40 transition-all"
                    >
                      <Wallet className="size-3.5 text-emerald-600 dark:text-[#00DF81] shrink-0" />
                      <span className="truncate text-[11px]">MoMo Ledger</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Messages / Conversation Thread */
              <div className="flex h-full flex-col justify-between">
                <div className="space-y-3 pb-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col text-xs",
                        msg.sender === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <div className="mb-0.5 text-[10px] text-muted-foreground font-medium px-1">
                        {msg.senderName} · {msg.timestamp}
                      </div>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-2xs leading-relaxed text-xs font-medium",
                          msg.sender === "user"
                            ? "bg-emerald-600 text-white rounded-br-xs"
                            : "bg-muted/70 text-foreground border border-border/60 rounded-bl-xs",
                        )}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1">
                      <Bot className="size-3.5 text-emerald-600 dark:text-[#00DF81] animate-spin" />
                      <span className="text-[11px]">Eon Assistant is typing...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input Bar */}
                <form
                  onSubmit={handleSendMessage}
                  className="sticky bottom-0 mt-2 flex items-center gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm"
                >
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Write a message..."
                    className="w-full bg-transparent px-2.5 text-xs outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className="grid size-7.5 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30 transition-all shadow-2xs"
                  >
                    <CornerDownLeft className="size-3.5 stroke-[2.2]" />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Article Reading Modal Overlay */}
          {selectedArticle && (
            <div className="absolute inset-0 z-30 flex flex-col bg-card p-5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-[#00DF81]">
                  {selectedArticle.category}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedArticle(null)}
                  className="grid size-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 flex-1 overflow-y-auto no-scrollbar space-y-2.5">
                <h4 className="text-sm font-bold text-foreground">
                  {selectedArticle.title}
                </h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {selectedArticle.summary}
                </p>
                <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
                  This procedure is automatically audited under ISO/IEC 27001 standard protocols. All actions are ledger-verified.
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  const topic = selectedArticle.title;
                  setSelectedArticle(null);
                  startChatWithTopic(topic);
                }}
                className="mt-3 w-full rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 text-xs h-9"
              >
                Inquire about this article
              </Button>
            </div>
          )}

          {/* Bottom Tab Navigation Bar */}
          <div className="flex border-t border-border bg-card/95 px-6 py-2">
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors",
                activeTab === "home"
                  ? "text-emerald-600 dark:text-[#00DF81]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Home className="size-4" />
              <span>Home</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("messages")}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors relative",
                activeTab === "messages"
                  ? "text-emerald-600 dark:text-[#00DF81]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="relative">
                <MessageSquare className="size-4" />
                {messages.length > 1 && (
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500" />
                )}
              </div>
              <span>Messages</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
