import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  Fingerprint,
  Globe2,
  HelpCircle,
  History,
  Info,
  Layers,
  LayoutDashboard,
  Lock,
  MapPin,
  Menu,
  Minus,
  Moon,
  Package,
  Phone,
  PhoneCall,
  Play,
  Plus,
  QrCode,
  Quote,
  Radio,
  RefreshCcw,
  Scale,
  ScrollText,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Sun,
  TrendingDown,
  TrendingUp,
  Unlock,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Button } from "../components/ui/button";

// Phone options for the Calculator
const PHONES = [
  { label: "Samsung Galaxy A15 (125,000 XAF)", price: 125000 },
  { label: "Tecno Spark 20 (95,000 XAF)", price: 95000 },
  { label: "Xiaomi Redmi Note 13 (180,000 XAF)", price: 180000 },
  { label: "Tecno Camon 30 Pro (220,000 XAF)", price: 220000 },
  { label: "Samsung Galaxy A55 5G (280,000 XAF)", price: 280000 },
  { label: "Infinix Note 40 (160,000 XAF)", price: 160000 },
];

const TENORS = [3, 6, 9, 12];

function formatXaf(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} XAF`;
}

type Stat = {
  value: number;
  suffix: string;
  prefix?: string;
  label: string;
  description: string;
};

const stats: Stat[] = [
  {
    value: 42,
    prefix: "+",
    suffix: "%",
    label: "Device sales volume",
    description: "Average increase in monthly store inventory turnover",
  },
  {
    value: 180,
    prefix: "<",
    suffix: "s",
    label: "In-store origination",
    description: "From national ID scan to device handover",
  },
  {
    value: 100,
    suffix: "%",
    label: "Automated MoMo matching",
    description: "Instant settlement against active contracts",
  },
  {
    value: -78,
    suffix: "%",
    label: "Default write-offs",
    description: "Reduction in bad debt via hardware-backed DPC",
  },
];

// 6 Real Client App Lifecycle Screens from App_images
const customerLifecycleScreens = [
  {
    id: "due",
    title: "1. Payment Due Soon",
    subtitle: "Active Servicing & Balance",
    image: "/App_images/eonpay-10-home-payment-due-soon.png",
    headline: "Transparent balance & payment schedule",
    description:
      "Customers see their exact remaining XAF balance, upcoming monthly installment date, and one-tap payment actions directly from the home screen.",
    features: [
      "Real-time XAF outstanding balance counter",
      "Automatic SMS & in-app installment reminders",
      "Upcoming maturity and breakdown of installments",
    ],
  },
  {
    id: "pay",
    title: "2. Make a Payment",
    subtitle: "MTN MoMo & Orange Money",
    image: "/App_images/eonpay-17-make-a-payment.png",
    headline: "Frictionless mobile money settlement",
    description:
      "Borrowers select their preferred payment method—MTN Mobile Money, Orange Money, or Cash at store—and choose preset amounts (Full, Monthly, Half, or Custom).",
    features: [
      "Instant USSD push prompt sent to borrower's phone",
      "Pre-calculated payment chips (27,500 XAF / 55,000 XAF)",
      "Zero transaction fee matching via webhook gateway",
    ],
  },
  {
    id: "grace",
    title: "3. Grace Period Active",
    subtitle: "Friendly Reminder Window",
    image: "/App_images/eonpay-11-home-grace-period.png",
    headline: "Fair & transparent delinquency grace",
    description:
      "If a payment is missed, the customer enters an automated grace period with clear deadline countdowns and support contact options before any restrictions trigger.",
    features: [
      "Clear grace period countdown (e.g. 4 days remaining)",
      "Direct WhatsApp and call support hotlines",
      "Pre-calculated transparent late fee schedule",
    ],
  },
  {
    id: "restricted",
    title: "4. Device Restricted",
    subtitle: "Soft Lock Kiosk Enforcer",
    image: "/App_images/eonpay-12-home-device-restricted.png",
    headline: "Automated hardware protection that works",
    description:
      "Upon grace expiry, EonPay DPC restricts non-essential device usage while maintaining payment restoration, support access, and emergency calling at all times.",
    features: [
      "One-tap 'Pay and restore access' button",
      "Emergency dialer and carrier data connection preserved",
      "Instant automatic unlock within seconds of MoMo clearing",
    ],
  },
  {
    id: "complete",
    title: "5. Contract Complete",
    subtitle: "100% Repaid Milestone",
    image: "/App_images/eonpay-39-final-payment-completed.png",
    headline: "Celebrating customer completion",
    description:
      "When the final scheduled installment clears, the customer receives immediate confirmation that 24 of 24 installments are settled with zero remaining balance.",
    features: [
      "Instant celebratory completion confirmation",
      "Itemized repayment audit summary (Total 900,000 XAF)",
      "Verified ledger settlement receipt",
    ],
  },
  {
    id: "released",
    title: "6. Device Fully Released",
    subtitle: "Permanent Ownership Transfer",
    image: "/App_images/eonpay-41-device-fully-released.png",
    headline: "Full, unrestricted device ownership",
    description:
      "EonPay management is permanently removed from the smartphone. Customers can download their official clearance certificate and final tax receipt.",
    features: [
      "Automatic cryptographic release command executed",
      "Official downloadable PDF clearance certificate",
      "Customer rating & feedback loop",
    ],
  },
];

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }
    const duration = 900;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * easeOut));
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };
    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [active, target]);

  return value;
}

function StatCard({ stat, active }: { stat: Stat; active: boolean }) {
  const current = useCountUp(stat.value, active);
  return (
    <div className="flex flex-col items-center justify-center bg-[#04342C] p-6 sm:p-8 text-center transition-colors hover:bg-[#064238]">
      <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-mono text-[#5DCAA5]">
        {stat.prefix}
        {current}
        {stat.suffix}
      </div>
      <div className="mt-2 text-sm sm:text-base font-bold text-[#E1F5EE]">
        {stat.label}
      </div>
      <div className="mt-1 text-xs sm:text-sm text-[#9FE1CB]/80 max-w-[200px] leading-relaxed">
        {stat.description}
      </div>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();

  // Navigation & Drawer States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNavDropdown, setActiveNavDropdown] = useState<string | null>(null);

  // Scroll to Top Detection & Smooth Scrolling
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 350);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function scrollToSection(e: React.MouseEvent<HTMLAnchorElement>, targetId: string) {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (!element) return;
    const headerOffset = 76;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
    setMobileMenuOpen(false);
    setActiveNavDropdown(null);
  }

  // Customer Lifecycle Screen State (Section 8)
  const [activeCustomerScreenIndex, setActiveCustomerScreenIndex] = useState(0);

  // Device Protection View Mode (Section 5: Real DPC Kiosk Lock vs Grace Period Screen)
  const [protectionViewMode, setProtectionViewMode] = useState<"lock" | "grace">("lock");

  // Stats Section Intersection Observer State
  const statsSectionRef = useRef<HTMLDivElement>(null);
  const [statsActive, setStatsActive] = useState(false);

  useEffect(() => {
    const el = statsSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Interactive Financing Calculator State
  const [phonePrice, setPhonePrice] = useState(PHONES[0].price);
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [tenorMonths, setTenorMonths] = useState(6);

  const { downPaymentAmount, financedPrincipal, monthlyInstallment } = useMemo(() => {
    const dp = phonePrice * (downPaymentPct / 100);
    const principal = phonePrice - dp;
    return {
      downPaymentAmount: dp,
      financedPrincipal: principal,
      monthlyInstallment: principal / tenorMonths,
    };
  }, [phonePrice, downPaymentPct, tenorMonths]);

  // Interactive Origination Step in Section 6
  const [activeOriginationStep, setActiveOriginationStep] = useState(0);

  // FAQ Accordion State (First item open by default)
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Demo Modal State
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoFormSubmitted, setDemoFormSubmitted] = useState(false);
  const [demoFormData, setDemoFormData] = useState({
    fullName: "",
    storeName: "",
    phone: "",
    city: "Douala",
    monthlyVolume: "50-100 phones",
  });

  function handleDemoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDemoFormSubmitted(true);
    setTimeout(() => {
      setDemoFormSubmitted(false);
      setDemoModalOpen(false);
    }, 2200);
  }

  // Feature Grid Items
  const features = [
    {
      icon: UserCheck,
      title: "Customer & KYC Verification",
      description: "Instant identity capture, national ID OCR validation, and biometric liveness verification.",
      iconBg: "bg-blue-50 text-blue-600 border-blue-100/80",
    },
    {
      icon: FileSignature,
      title: "Digital Financing Contracts",
      description: "Create legally binding installment schedules, down payments, and digital agreements in seconds.",
      iconBg: "bg-indigo-50 text-indigo-600 border-indigo-100/80",
    },
    {
      icon: ShieldCheck,
      title: "Hardware Device Protection",
      description: "Native Android DPC hardware policy controller with remote soft/hard locks and offline grace periods.",
      featured: true,
      iconBg: "bg-[#0F6E56] text-[#5DCAA5]",
    },
    {
      icon: Wallet,
      title: "Mobile Money & Collections",
      description: "Automated real-time reconciliation with MTN MoMo, Orange Money, cash, and bank transfers.",
      iconBg: "bg-amber-50 text-amber-600 border-amber-100/80",
    },
    {
      icon: Package,
      title: "Branch & IMEI Inventory",
      description: "Track individual phone serials, 15-digit IMEIs, branch stock transfers, and warranty statuses.",
      iconBg: "bg-violet-50 text-violet-600 border-violet-100/80",
    },
    {
      icon: BarChart3,
      title: "Portfolio Intelligence & Ledger",
      description: "Double-entry general ledger, collection recovery curves, PAR 30/60/90, and cashier performance.",
      iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100/80",
    },
  ];

  // 6 Steps of In-Store Financing Origination
  const originationSteps = [
    {
      number: "01",
      title: "Customer KYC & Biometrics",
      shortDesc: "National ID scan and live verification",
      detail: "Capture applicant's identity card, portrait liveness check, and guarantor references in under 60 seconds with instant fraud screening.",
      icon: Fingerprint,
    },
    {
      number: "02",
      title: "Device & IMEI Selection",
      shortDesc: "Barcode scan reserved unit",
      detail: "Scan the 15-digit IMEI barcode directly from store inventory. The device is reserved atomically to prevent double-allocation.",
      icon: Smartphone,
    },
    {
      number: "03",
      title: "Financing Terms & Down Payment",
      shortDesc: "Configure tenor and initial deposit",
      detail: "Select weekly or monthly repayment frequencies with transparent finance charges. Collect the 15-40% down payment via MTN MoMo or Orange Money.",
      icon: Wallet,
    },
    {
      number: "04",
      title: "Promissory Contract Signature",
      shortDesc: "Digital contract generation",
      detail: "Generate the localized legal installment contract with transparent amortization schedule. Customer signs electronically on-screen.",
      icon: FileSignature,
    },
    {
      number: "05",
      title: "Android DPC Device Enrollment",
      shortDesc: "QR zero-touch provisioning",
      detail: "Store clerk scans the generated EonPay DPC setup QR code during device setup. Device is cryptographically enrolled and secured.",
      icon: QrCode,
    },
    {
      number: "06",
      title: "Handover & Active Servicing",
      shortDesc: "Customer walks out with phone",
      detail: "Contract activates automatically upon successful DPC check-in. Borrower receives SMS schedule and customer portal access.",
      icon: CheckCircle2,
    },
  ];

  // FAQ Items
  const faqs = [
    {
      question: "How does Android DPC device protection work?",
      answer:
        "During unboxing and out-of-box setup, the store staff scans the generated EonPay enrollment QR code. This provisions the device into Android Device Owner mode. Policy tokens are signed with Ed25519 cryptography. If a borrower misses scheduled repayments past the grace period, the phone automatically transitions to a soft lock or hard lock kiosk, restricting usage while keeping emergency calling and payment apps accessible.",
    },
    {
      question: "Which phone brands and Android versions are supported?",
      answer:
        "EonPay Device Policy Controller supports Android 8.0 through Android 15 across all major African market brands including Samsung, Tecno, Infinix, itel, Xiaomi/Redmi, and Oppo. Compatibility and Google Play Integrity are checked automatically during enrollment.",
    },
    {
      question: "How do repayments work with MTN MoMo and Orange Money?",
      answer:
        "Borrowers receive automated USSD payment prompts or initiate mobile money payments directly to your merchant account. EonPay matches transactions to contracts in real-time via cryptographic webhook listeners. As soon as the installment clears, any lock restrictions are lifted immediately without manual staff intervention.",
    },
    {
      question: "Can I manage multiple retail branches under one account?",
      answer:
        "Yes. EonPay provides multi-tenant and multi-branch governance with granular role-based access control (RBAC). You can assign store managers and cashiers to specific branch locations, track inventory per outlet, and view aggregated executive analytics across your entire retail chain.",
    },
    {
      question: "What happens when a customer completes their final installment?",
      answer:
        "The moment the final scheduled principal and finance charge are settled in full, the backend automatically issues a signed cryptographic release command. The DPC agent uninstalls itself or unlocks permanently, granting the customer complete, unrestricted device ownership.",
    },
  ];

  // Footer Link Columns
  const footerLinkColumns = [
    {
      heading: "Product",
      links: [
        { label: "Retailer Console", href: "/login" },
        { label: "Origination Engine", href: "#workflow" },
        { label: "Device Protection", href: "#protection" },
        { label: "MoMo Reconciliation", href: "#features" },
        { label: "Double-Entry Ledger", href: "#analytics" },
      ],
    },
    {
      heading: "Solutions",
      links: [
        { label: "Single-Store Retailers", href: "#features" },
        { label: "Retail Chains & Multi-Branch", href: "#features" },
        { label: "Device Distributors & Importers", href: "#features" },
        { label: "Financing Institutions", href: "#features" },
      ],
    },
    {
      heading: "Security & Trust",
      links: [
        { label: "Ed25519 Policy Signing", href: "#security" },
        { label: "PostgreSQL Row-Level Security", href: "#security" },
        { label: "Audit Hash Chains (SHA-256)", href: "#security" },
        { label: "Android Play Integrity", href: "#security" },
      ],
    },
    {
      heading: "Platform",
      links: [
        { label: "Installment Calculator", href: "#calculator" },
        { label: "Merchant Case Studies", href: "#impact" },
        { label: "Product Roadmap", href: "#roadmap" },
        { label: "Staff & Admin Access", href: "/login" },
      ],
    },
  ];

  const currentScreen = customerLifecycleScreens[activeCustomerScreenIndex];

  return (
    <div className="min-h-screen bg-white text-[#0F172A] font-sans antialiased selection:bg-[#00D084]/20 selection:text-black">
      {/* ─────────────────────────────────────────────────────────────
          1. FLOATING NAVIGATION BAR (Modern Island Style)
      ────────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 w-full py-3 px-4 sm:px-6 lg:px-8 pointer-events-none">
        <header className="mx-auto max-w-7xl bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-2xl shadow-sm h-14 px-4 sm:px-5 flex items-center justify-between pointer-events-auto transition-all">
          {/* ── Left: Brand Logo & Wordmark ── */}
          <div
            className="flex items-center gap-2 cursor-pointer select-none group shrink-0"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#00D084] text-black shadow-xs group-hover:scale-105 transition-transform">
              <Zap className="size-3.5 fill-black text-black stroke-[2.5]" />
            </div>
            <div className="flex items-center font-extrabold text-lg tracking-tight text-zinc-950">
              <span>Eon</span>
              <span className="text-[#00D084]">Pay</span>
            </div>
          </div>

          {/* ── Center: Navigation Links ── */}
          <nav className="hidden lg:flex items-center gap-1">
            {/* Product Dropdown */}
            <div className="relative group">
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute top-full left-0 mt-1 w-80 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl shadow-zinc-900/5">
                <a
                  href="#features"
                  onClick={(e) => scrollToSection(e, "features")}
                  className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="size-9 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center shrink-0 mt-0.5">
                    <Store className="size-4.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-zinc-900">Retailer Dashboard</div>
                    <div className="text-[11px] text-zinc-500">Multi-branch installment operations & stock</div>
                  </div>
                </a>
                <a
                  href="#protection"
                  onClick={(e) => scrollToSection(e, "protection")}
                  className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="size-9 rounded-lg bg-[#04342C] text-[#5DCAA5] grid place-items-center shrink-0 mt-0.5">
                    <ShieldCheck className="size-4.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-zinc-900">Device Protection</div>
                    <div className="text-[11px] text-zinc-500">Android hardware locking & telemetry</div>
                  </div>
                </a>
                <a
                  href="#workflow"
                  onClick={(e) => scrollToSection(e, "workflow")}
                  className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="size-9 rounded-lg bg-blue-50 text-blue-700 grid place-items-center shrink-0 mt-0.5">
                    <QrCode className="size-4.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-zinc-900">Origination Engine</div>
                    <div className="text-[11px] text-zinc-500">Point-of-sale customer enrollment</div>
                  </div>
                </a>
                <a
                  href="#customer-experience"
                  onClick={(e) => scrollToSection(e, "customer-experience")}
                  className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="size-9 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center shrink-0 mt-0.5">
                    <Smartphone className="size-4.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-zinc-900">Borrower Mobile App</div>
                    <div className="text-[11px] text-zinc-500">6-stage customer repayment experience</div>
                  </div>
                </a>
              </div>
            </div>

            <a
              href="#partners"
              onClick={(e) => scrollToSection(e, "partners")}
              className="px-3.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              Partners
            </a>
            <a
              href="#protection"
              onClick={(e) => scrollToSection(e, "protection")}
              className="px-3.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              Protection
            </a>
            <a
              href="#workflow"
              onClick={(e) => scrollToSection(e, "workflow")}
              className="px-3.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              How it works
            </a>
            <a
              href="#customer-experience"
              onClick={(e) => scrollToSection(e, "customer-experience")}
              className="px-3.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              Customer app
            </a>
            <a
              href="#calculator"
              onClick={(e) => scrollToSection(e, "calculator")}
              className="px-3.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              Pricing
            </a>
            <a
              href="#security"
              onClick={(e) => scrollToSection(e, "security")}
              className="px-3.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              Security
            </a>
          </nav>

          {/* ── Right: Auth Actions ── */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/login")}
              className="hidden sm:inline-flex text-[13px] font-semibold text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer px-3 h-8 items-center"
            >
              Log in
            </button>
            <button
              onClick={() => setDemoModalOpen(true)}
              className="hidden sm:inline-flex items-center rounded-full border border-zinc-300 bg-white text-zinc-900 font-semibold text-[13px] h-8 px-4 hover:bg-zinc-50 hover:border-zinc-400 transition-all cursor-pointer shadow-xs"
            >
              Book a demo
            </button>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 cursor-pointer"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="mx-auto max-w-6xl mt-2 rounded-2xl border border-zinc-200 bg-white p-5 space-y-3 shadow-xl pointer-events-auto animate-in slide-in-from-top-2 duration-150">
            <a
              href="#features"
              onClick={(e) => scrollToSection(e, "features")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Platform Overview
            </a>
            <a
              href="#partners"
              onClick={(e) => scrollToSection(e, "partners")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Our Partners
            </a>
            <a
              href="#protection"
              onClick={(e) => scrollToSection(e, "protection")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Device Protection (Android DPC)
            </a>
            <a
              href="#workflow"
              onClick={(e) => scrollToSection(e, "workflow")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Origination Workflow
            </a>
            <a
              href="#customer-experience"
              onClick={(e) => scrollToSection(e, "customer-experience")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Customer App Showcase
            </a>
            <a
              href="#analytics"
              onClick={(e) => scrollToSection(e, "analytics")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Portfolio Analytics
            </a>
            <a
              href="#calculator"
              onClick={(e) => scrollToSection(e, "calculator")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Installment Calculator
            </a>
            <a
              href="#security"
              onClick={(e) => scrollToSection(e, "security")}
              className="block py-2 text-sm font-medium text-zinc-800"
            >
              Security
            </a>
            <div className="pt-3 border-t border-zinc-200 flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/login");
                }}
                className="w-full justify-center rounded-xl font-medium"
              >
                Log in to Console
              </Button>
              <Button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setDemoModalOpen(true);
                }}
                className="w-full justify-center rounded-xl bg-[#00D084] text-slate-950 font-bold hover:bg-[#00B974]"
              >
                Schedule Store Walkthrough
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. HERO SECTION
      ────────────────────────────────────────────────────────────── */}
      <section className="relative pt-8 pb-16 lg:pt-14 lg:pb-24 overflow-hidden bg-gradient-to-b from-emerald-50/40 via-white to-white border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left Column: Hero Copy */}
            <div className="lg:col-span-5 space-y-6 text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-[-0.03em] leading-[1.08] text-zinc-950">
                Sell more phones. <br />
                <span className="text-[#00D084]">Get paid on time.</span>
              </h1>

              <div className="space-y-2 text-zinc-600 text-base leading-relaxed">
                <p className="font-semibold text-zinc-900">
                  Run your entire installment business with EonPay.
                </p>
                <p className="text-sm sm:text-base text-zinc-600">
                  EonPay empowers phone retailers to manage customers, contracts, mobile money collections, branch inventory, and financed Android devices - all in one secure platform.
                </p>
              </div>

              {/* 4 Feature Cards */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {[
                  { label: "Flexible financing", icon: Wallet },
                  { label: "Mobile Money ready", icon: Smartphone },
                  { label: "Device protection (DPC)", icon: ShieldCheck },
                  { label: "Smart collections", icon: Activity },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:border-zinc-300 transition-colors"
                  >
                    <item.icon className="size-4 text-[#00D084] shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Button
                  size="lg"
                  onClick={() => setDemoModalOpen(true)}
                  className="h-12 px-7 rounded-xl bg-[#00D084] text-slate-950 font-bold text-sm shadow-md shadow-[#00D084]/20 hover:bg-[#00B974] transition-all justify-center cursor-pointer"
                >
                  Book a demo
                  <ArrowRight className="size-4 ml-1.5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={(e) => scrollToSection(e as unknown as React.MouseEvent<HTMLAnchorElement>, "workflow")}
                  className="h-12 px-6 rounded-xl border-zinc-300 bg-white text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition-all justify-center cursor-pointer"
                >
                  Explore the platform
                </Button>
              </div>

              {/* Trust Line */}
              <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
                <span>Secure. Compliant with CEMAC banking regulations. Built for Africa.</span>
              </div>
            </div>

            {/* Right Column: Hero Visual Composite */}
            <div className="lg:col-span-7 relative">
              <div className="relative">
                {/* 1. Desktop Dashboard Screenshot Frame */}
                <div className="relative rounded-2xl border border-zinc-200/90 bg-white shadow-2xl shadow-zinc-300/60 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/90 px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <span className="size-2.5 rounded-full bg-red-400" />
                        <span className="size-2.5 rounded-full bg-amber-400" />
                        <span className="size-2.5 rounded-full bg-emerald-400" />
                      </div>
                      <span className="ml-2 font-mono text-[10px] text-zinc-400">
                        app.eonpay.co / portfolio / overview
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      Live Merchant Console
                    </span>
                  </div>
                  <img
                    src="/images/dashboard.png"
                    alt="EonPay Retailer Portfolio Dashboard"
                    className="w-full h-auto object-cover select-none"
                  />
                </div>

                {/* 2. Customer Mobile App Phone Frame */}
                <motion.div
                  initial={{ opacity: 0, x: -20, y: 20 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="hidden sm:block absolute -bottom-6 -left-6 w-[230px] z-20"
                >
                  <div className="rounded-[36px] border-4 border-zinc-900 bg-zinc-950 p-1.5 shadow-2xl shadow-zinc-950/50">
                    <img
                      src="./images/mobile-home.png"
                      alt="EonPay Customer Mobile App - Repayment Due"
                      className="w-full h-auto rounded-[28px] object-cover select-none"
                    />
                  </div>
                </motion.div>

                {/* 3. Single Floating Trust Metric */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="hidden md:flex absolute -bottom-3 right-4 z-20 items-center gap-4 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md"
                >
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-semibold text-zinc-600">Live Portfolio</span>
                  </div>
                  <div className="h-4 w-px bg-zinc-200" />
                  <div className="text-[11px] font-bold text-zinc-900">
                    12.4M <span className="font-normal text-zinc-500">XAF collected</span>
                  </div>
                  <div className="h-4 w-px bg-zinc-200" />
                  <div className="text-[11px] font-bold text-emerald-700">
                    92.6% <span className="font-normal text-zinc-500">on-time</span>
                  </div>
                </motion.div>
              </div>

              {/* Mobile View Standalone Phone Render */}
              <div className="sm:hidden mt-6 flex justify-center">
                <div className="w-[260px] rounded-[36px] border-4 border-zinc-900 bg-zinc-950 p-1.5 shadow-2xl">
                  <img
                    src="/App_images/eonpay-10-home-payment-due-soon.png"
                    alt="EonPay Customer Mobile App"
                    className="w-full h-auto rounded-[28px] object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. OUR HIGH-LEVEL PARTNERS (Clean Reference Inspired Design)
      ────────────────────────────────────────────────────────────── */}
      <section id="partners" className="py-20 sm:py-24 bg-white border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Framed Container */}
          <div className="rounded-3xl bg-[#F8FAFC] border border-zinc-200/60 p-8 sm:p-12 lg:p-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
              {/* Left Column: Headline & Description */}
              <div className="lg:col-span-4 text-left space-y-5">
                <div className="size-12 rounded-2xl bg-white border border-zinc-200/80 shadow-sm flex items-center justify-center">
                  <Building2 className="size-5.5 text-[#00D084]" />
                </div>

                <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-zinc-950 tracking-tight leading-[1.1]">
                  Our high-level<br />partners
                </h2>

                <p className="text-[15px] text-zinc-500 leading-relaxed max-w-sm">
                  We integrate natively with Africa&apos;s leading telecom operators, device manufacturers, and cloud infrastructure to ensure 100% automated settlement.
                </p>
              </div>

              {/* Right Column: Partner Brand Grid */}
              <div className="lg:col-span-8">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {/* MTN MoMo */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-[#FFCC00] rounded-xl px-3 py-2 shadow-sm">
                        <span className="font-black text-sm text-[#003366] tracking-tight leading-none">MTN</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-lg text-zinc-900 tracking-tight leading-tight">MoMo</span>
                        <span className="text-xs text-zinc-400 font-medium">Mobile Money</span>
                      </div>
                    </div>
                  </div>

                  {/* Orange Money */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <div className="size-9 bg-[#FF7900] rounded-lg relative flex items-center justify-center shadow-sm">
                        <div className="w-4 h-1.5 bg-white absolute bottom-1.5 left-1.5 rounded-sm" />
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-base text-zinc-900">orange</span>
                        <span className="font-bold text-base text-[#FF7900]">money</span>
                      </div>
                    </div>
                  </div>

                  {/* Android Enterprise */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <svg className="size-8 text-[#3DDC84]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993s-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m11.4045-6.02l1.996-3.4572c.157-.272.064-.619-.208-.776-.271-.157-.618-.064-.775.207l-2.025 3.507c-1.428-.65-3.023-1.02-4.72-1.02s-3.292.37-4.72 1.02L5.4035 5.3052c-.157-.271-.504-.364-.775-.207-.272.157-.365.504-.208.776l1.996 3.4572C2.793 11.233.371 15.011 0 19.5h24c-.371-4.489-2.793-8.267-6.1185-10.1786" />
                      </svg>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-base text-zinc-900 tracking-tight">Android</span>
                        <span className="text-xs text-zinc-400 font-medium">Enterprise DPC</span>
                      </div>
                    </div>
                  </div>

                  {/* Amazon Web Services */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-2">
                      <svg className="h-7 w-auto" viewBox="0 0 70 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <text x="35" y="16" fill="#1E293B" fontSize="16" fontWeight="900" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="1.5">aws</text>
                        <path d="M12 23 C 28 28, 46 28, 58 23" stroke="#FF9900" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M53 21 L 58 23 L 54 26" fill="#FF9900" />
                      </svg>
                      <span className="font-extrabold text-base text-zinc-900 tracking-tight">Cloud</span>
                    </div>
                  </div>

                  {/* Samsung Knox */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="size-7 text-[#1428A0]" strokeWidth={1.75} />
                      <div className="flex flex-col">
                        <span className="font-extrabold text-base text-zinc-900 tracking-tight">Samsung Knox</span>
                        <span className="text-xs text-zinc-400 font-medium">Device Security</span>
                      </div>
                    </div>
                  </div>

                  {/* PostgreSQL */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <Database className="size-7 text-[#336791]" strokeWidth={1.75} />
                      <div className="flex flex-col">
                        <span className="font-extrabold text-base text-zinc-900 tracking-tight">PostgreSQL</span>
                        <span className="text-xs text-zinc-400 font-medium">Row-Level Security</span>
                      </div>
                    </div>
                  </div>

                  {/* Google Play Integrity */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <Shield className="size-7 text-[#34A853]" strokeWidth={1.75} />
                      <div className="flex flex-col">
                        <span className="font-extrabold text-base text-zinc-900 tracking-tight">Play Integrity</span>
                        <span className="text-xs text-zinc-400 font-medium">Google Verified</span>
                      </div>
                    </div>
                  </div>

                  {/* CEMAC / WAEMU */}
                  <div className="rounded-2xl bg-[#EEF1F5] hover:bg-white hover:shadow-lg border border-transparent hover:border-zinc-200 transition-all duration-200 h-28 sm:h-32 flex items-center justify-center px-6">
                    <div className="flex items-center gap-3">
                      <Globe2 className="size-7 text-[#04342C]" strokeWidth={1.75} />
                      <div className="flex flex-col">
                        <span className="font-extrabold text-base text-zinc-900 tracking-tight">CEMAC</span>
                        <span className="text-xs text-zinc-400 font-medium">WAEMU Regulatory</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. ALL THE TOOLS IN ONE PLATFORM (6 Cards)
      ────────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 lg:py-24 bg-gradient-to-b from-white to-emerald-50/30 border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              All the tools you need in <span className="text-[#00D084]">one platform</span>
            </h2>
            <p className="text-base text-zinc-600 max-w-2xl mx-auto leading-relaxed">
              From customer onboarding and instant credit approval to final payment and automated device release, EonPay covers your entire workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description, featured, iconBg }) => (
              <div
                key={title}
                className={
                  featured
                    ? "relative overflow-hidden rounded-2xl bg-[#04342C] p-7 shadow-lg flex flex-col justify-between border border-[#0F6E56]/60 transition-transform hover:-translate-y-1"
                    : "rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs hover:shadow-md hover:border-zinc-300 transition-all flex flex-col justify-between hover:-translate-y-1"
                }
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className={`flex size-12 items-center justify-center rounded-xl border ${iconBg || "bg-zinc-100 text-zinc-800"}`}
                    >
                      <Icon size={22} strokeWidth={1.75} />
                    </div>
                  </div>

                  <h3
                    className={
                      featured
                        ? "mb-2 text-lg font-bold text-[#E1F5EE]"
                        : "mb-2 text-lg font-bold text-zinc-950"
                    }
                  >
                    {title}
                  </h3>
                  <p
                    className={
                      featured
                        ? "text-sm leading-relaxed text-[#9FE1CB]"
                        : "text-sm leading-relaxed text-zinc-600"
                    }
                  >
                    {description}
                  </p>
                </div>

                <div className="pt-5 mt-auto border-t border-zinc-100/10 flex items-center gap-1.5 text-xs font-medium">
                  <span className={featured ? "text-[#5DCAA5]/70" : "text-zinc-400"}>Learn more</span>
                  <ArrowRight size={12} className={featured ? "text-[#5DCAA5]/70" : "text-zinc-400"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. HARDWARE DEVICE PROTECTION (Real Android DPC Software UI)
      ────────────────────────────────────────────────────────────── */}
      <section id="protection" className="bg-[#04342C] py-20 lg:py-24 text-white border-y border-[#0F6E56]/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left: Real Smartphone Enforcer Screenshots */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div className="mb-4 flex items-center gap-1 rounded-xl bg-[#032620] p-1 border border-[#0F6E56] text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setProtectionViewMode("lock")}
                  className={
                    protectionViewMode === "lock"
                      ? "rounded-lg bg-[#5DCAA5] text-[#04342C] px-3.5 py-1.5 font-bold cursor-pointer transition-all shadow-xs"
                      : "rounded-lg text-[#9FE1CB] hover:text-white px-3.5 py-1.5 cursor-pointer transition-all"
                  }
                >
                  DPC Soft Lock Screen
                </button>
                <button
                  type="button"
                  onClick={() => setProtectionViewMode("grace")}
                  className={
                    protectionViewMode === "grace"
                      ? "rounded-lg bg-[#5DCAA5] text-[#04342C] px-3.5 py-1.5 font-bold cursor-pointer transition-all shadow-xs"
                      : "rounded-lg text-[#9FE1CB] hover:text-white px-3.5 py-1.5 cursor-pointer transition-all"
                  }
                >
                  Grace Period Warning
                </button>
              </div>

              <div className="relative max-w-xs sm:max-w-sm w-full">
                <AnimatePresence mode="wait">
                  {protectionViewMode === "lock" ? (
                    <motion.div
                      key="lock"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-[40px] border-[5px] border-zinc-950 bg-zinc-950 p-1.5 shadow-2xl"
                    >
                      <img
                        src="/App_images/eonpay-12-home-device-restricted.png"
                        alt="Real EonPay DPC Device Access Restricted Soft Lock Screen"
                        className="w-full h-auto rounded-[32px] object-cover"
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="grace"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-[40px] border-[5px] border-zinc-950 bg-zinc-950 p-1.5 shadow-2xl"
                    >
                      <img
                        src="/App_images/eonpay-11-home-grace-period.png"
                        alt="Real EonPay Grace Period Countdown Screen"
                        className="w-full h-auto rounded-[32px] object-cover"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right: Authoritative Hardware Policy Copy */}
            <div className="lg:col-span-6 space-y-6 text-left">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#E1F5EE] leading-tight tracking-tight">
                Protection that works throughout the repayment period.
              </h2>

              <p className="text-[#9FE1CB] text-sm sm:text-base leading-relaxed">
                Enroll financed smartphones into Android Device Owner management. When a customer defaults past their scheduled grace period, EonPay automatically transitions the device into a soft or hard lock kiosk.
              </p>

              <div className="space-y-3.5 pt-2">
                {[
                  {
                    title: "Cryptographically Signed Ed25519 Tokens",
                    desc: "Device policies are signed with asymmetric keys and verified locally in hardware Keystore.",
                  },
                  {
                    title: "Soft & Hard Lock Enforcement",
                    desc: "Restricts non-essential apps while keeping emergency calling and payment apps accessible.",
                  },
                  {
                    title: "Instant Mobile Money Restoration",
                    desc: "As soon as MTN MoMo or Orange Money settlement clears, the phone unlocks automatically in seconds.",
                  },
                  {
                    title: "Anti-Tamper & Persistent Factory Reset Defense",
                    desc: "Safe boot is disabled and uninstallation is blocked for the enrolled device controller.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div className="size-5 rounded-md bg-[#5DCAA5]/20 text-[#5DCAA5] grid place-items-center shrink-0 mt-1">
                      <Check className="size-3.5 stroke-[3]" />
                    </div>
                    <div>
                      <div className="text-sm text-[#E1F5EE] font-bold">{item.title}</div>
                      <div className="text-xs text-[#9FE1CB] mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <Button
                  onClick={() => setDemoModalOpen(true)}
                  className="rounded-xl bg-[#5DCAA5] text-[#04342C] font-bold text-sm h-11 px-6 hover:bg-[#5DCAA5]/90 transition-all cursor-pointer"
                >
                  Learn more about device protection
                  <ArrowRight className="size-4 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. IN-STORE FINANCING ORIGINATION WORKFLOW (6 Steps)
      ────────────────────────────────────────────────────────────── */}
      <section id="workflow" className="py-20 lg:py-24 bg-[#FBFBFC] border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              Origination in under <span className="text-[#00D084]">3 minutes</span>
            </h2>
            <p className="text-base text-zinc-600 max-w-2xl mx-auto leading-relaxed">
              Designed for high-speed store environments. Clerks can onboard borrowers, reserve IMEI inventory, collect down payments, and provision devices in a streamlined 6-step flow.
            </p>
          </div>

          {/* Interactive 6-Step Workflow Console */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white rounded-3xl border border-zinc-200/90 p-6 sm:p-8 lg:p-10 shadow-lg">
            {/* Left Column: 6 Interactive Step Selectors */}
            <div className="lg:col-span-6 space-y-3">
              {originationSteps.map((step, idx) => {
                const isSelected = idx === activeOriginationStep;
                return (
                  <div
                    key={step.number}
                    onClick={() => setActiveOriginationStep(idx)}
                    className={
                      isSelected
                        ? "p-4 rounded-2xl bg-[#04342C] text-white shadow-md cursor-pointer transition-all border border-[#0F6E56]"
                        : "p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800 cursor-pointer transition-all border border-zinc-200/70"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={
                            isSelected
                              ? "size-8 rounded-lg bg-[#0F6E56] text-[#5DCAA5] font-bold text-xs grid place-items-center font-mono"
                              : "size-8 rounded-lg bg-zinc-200 text-zinc-700 font-bold text-xs grid place-items-center font-mono"
                          }
                        >
                          {step.number}
                        </div>
                        <div>
                          <div className={isSelected ? "font-bold text-sm text-[#E1F5EE]" : "font-bold text-sm text-zinc-900"}>
                            {step.title}
                          </div>
                          <div className={isSelected ? "text-xs text-[#9FE1CB]" : "text-xs text-zinc-500"}>
                            {step.shortDesc}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Step Detail Card */}
            <div className="lg:col-span-6 flex flex-col justify-between h-full bg-[#04342C] rounded-2xl p-7 sm:p-8 text-white text-left border border-[#0F6E56]">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-[#0F6E56]">
                  <span className="font-mono text-xs text-[#5DCAA5] font-bold">
                    STEP {originationSteps[activeOriginationStep].number} OF 06
                  </span>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl bg-[#0F6E56] text-[#5DCAA5] grid place-items-center">
                      {(() => {
                        const Icon = originationSteps[activeOriginationStep].icon;
                        return <Icon size={24} />;
                      })()}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-[#E1F5EE]">
                        {originationSteps[activeOriginationStep].title}
                      </h3>
                      <p className="text-xs text-[#9FE1CB]">
                        {originationSteps[activeOriginationStep].shortDesc}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-[#9FE1CB] pt-2">
                    {originationSteps[activeOriginationStep].detail}
                  </p>

                  <div className="mt-6 flex items-center gap-3">
                    {originationSteps.map((_, idx) => (
                      <div
                        key={idx}
                        className={
                          idx <= activeOriginationStep
                            ? "h-1 flex-1 rounded-full bg-[#5DCAA5] transition-all"
                            : "h-1 flex-1 rounded-full bg-[#0F6E56]/40 transition-all"
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-[#0F6E56] flex items-center justify-between">
                <Button
                  variant="ghost"
                  disabled={activeOriginationStep === 0}
                  onClick={() => setActiveOriginationStep(Math.max(0, activeOriginationStep - 1))}
                  className="text-xs text-[#9FE1CB] hover:text-white hover:bg-[#0F6E56] disabled:opacity-30 cursor-pointer"
                >
                  Previous Step
                </Button>
                <Button
                  disabled={activeOriginationStep === originationSteps.length - 1}
                  onClick={() => setActiveOriginationStep(Math.min(originationSteps.length - 1, activeOriginationStep + 1))}
                  className="rounded-xl bg-[#5DCAA5] text-[#04342C] font-bold text-xs h-9 px-4 hover:bg-[#5DCAA5]/90 cursor-pointer"
                >
                  Next Step
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          7. HOW IT WORKS (5 Steps)
      ────────────────────────────────────────────────────────────── */}
      <section className="py-20 lg:py-24 bg-amber-50/25 border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              How it works for your retail clerks
            </h2>
            <p className="text-base text-zinc-600">
              Get started in minutes and scale your installment sales with zero technical overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                step: "1",
                title: "Register customer",
                desc: "Capture national ID and guarantor details.",
                icon: UserCheck,
              },
              {
                step: "2",
                title: "Choose device & plan",
                desc: "Select device and set deposit & tenor.",
                icon: Smartphone,
              },
              {
                step: "3",
                title: "Create contract",
                desc: "Generate digital contract and promissory terms.",
                icon: FileSignature,
              },
              {
                step: "4",
                title: "Deliver & enroll",
                desc: "Scan DPC QR code and handover device.",
                icon: QrCode,
              },
              {
                step: "5",
                title: "Collect & complete",
                desc: "Track MoMo auto-clearing until final release.",
                icon: CheckCircle2,
              },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-5 text-left hover:bg-white hover:border-zinc-300 hover:shadow-md transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-8 rounded-lg bg-[#00D084] text-slate-950 font-extrabold text-xs grid place-items-center shrink-0">
                    {item.step}
                  </div>
                  <item.icon className="size-5 text-zinc-400 group-hover:text-[#00D084] transition-colors" strokeWidth={1.75} />
                </div>
                <h4 className="font-bold text-sm text-zinc-900 mb-1">{item.title}</h4>
                <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          8. BORROWER MOBILE APP (6 Stages)
      ────────────────────────────────────────────────────────────── */}
      <section id="customer-experience" className="py-20 lg:py-24 bg-[#F8FAFC] border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              A transparent, self-service client experience
            </h2>
            <p className="text-base text-zinc-600 max-w-2xl mx-auto leading-relaxed">
              Explore the 6 actual stages of the EonPay customer mobile app—from active repayment to automated hardware restriction and final certificate release.
            </p>
          </div>

          {/* Interactive Screen Selector Strip */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {customerLifecycleScreens.map((screen, idx) => {
              const active = idx === activeCustomerScreenIndex;
              return (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => setActiveCustomerScreenIndex(idx)}
                  className={
                    active
                      ? "px-4 py-2.5 rounded-xl bg-[#04342C] text-[#5DCAA5] font-bold text-xs shadow-md border border-[#0F6E56] transition-all cursor-pointer"
                      : "px-4 py-2.5 rounded-xl bg-white text-zinc-700 font-semibold text-xs border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all cursor-pointer"
                  }
                >
                  <span>{screen.title}</span>
                </button>
              );
            })}
          </div>

          {/* Screen Showcase Container */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center bg-white rounded-3xl border border-zinc-200/90 p-6 sm:p-10 shadow-xl">
            {/* Left Column: Phone Frame */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative max-w-[280px] sm:max-w-[300px] w-full">
                <div className="rounded-[44px] border-[6px] border-zinc-900 bg-zinc-950 p-1.5 shadow-2xl">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={currentScreen.id}
                      src={currentScreen.image}
                      alt={currentScreen.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                      className="w-full h-auto rounded-[36px] object-cover"
                    />
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Right Column: Screen Context */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
                  {currentScreen.headline}
                </h3>
                <p className="text-sm sm:text-base text-zinc-600 mt-2 leading-relaxed">
                  {currentScreen.description}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {currentScreen.features.map((feat) => (
                  <div key={feat} className="flex items-center gap-3">
                    <div className="size-5 rounded-md bg-emerald-100 text-emerald-800 grid place-items-center shrink-0">
                      <Check className="size-3.5 stroke-[3]" />
                    </div>
                    <span className="text-xs sm:text-sm text-zinc-700 font-medium">{feat}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100">
                <Button
                  onClick={() => setDemoModalOpen(true)}
                  className="rounded-xl bg-[#00D084] text-slate-950 font-bold text-xs h-10 px-5 hover:bg-[#00B974] transition-all cursor-pointer"
                >
                  Test customer mobile app in demo
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveCustomerScreenIndex((prev) => (prev + 1) % customerLifecycleScreens.length)
                  }
                  className="text-xs font-semibold text-zinc-600 hover:text-zinc-950 px-3 py-2 cursor-pointer"
                >
                  Next Screen ({activeCustomerScreenIndex + 1}/6) →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          9. PORTFOLIO INTELLIGENCE & COLLECTIONS ANALYTICS
      ────────────────────────────────────────────────────────────── */}
      <section id="analytics" className="py-20 lg:py-24 bg-white border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              Know your portfolio before problems become expensive
            </h2>
            <p className="text-base text-zinc-600 max-w-2xl mx-auto leading-relaxed">
              Real-time ledger data provides complete visibility into collection rates, upcoming maturities, delinquent contracts, and cashier recovery performance.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 4 KPI Cards */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-3">
              <div className="p-5 rounded-2xl bg-[#04342C] text-white flex flex-col justify-between col-span-2">
                <div className="text-[11px] text-[#9FE1CB] font-semibold uppercase tracking-wide">Collection Rate</div>
                <div className="text-4xl font-extrabold text-[#5DCAA5] font-mono mt-2">92.6%</div>
                <div className="text-[11px] text-[#9FE1CB] mt-1">↑ +3.2% vs last month</div>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex flex-col justify-between">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase">PAR &gt; 30</div>
                <div className="text-2xl font-extrabold text-zinc-900 font-mono mt-2">7.4%</div>
                <div className="text-[11px] text-emerald-600 font-medium mt-1">↓ -2.1%</div>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex flex-col justify-between">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase">Active</div>
                <div className="text-2xl font-extrabold text-zinc-900 font-mono mt-2">1,248</div>
                <div className="text-[11px] text-zinc-500 font-medium mt-1">4 branches</div>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex flex-col justify-between col-span-2">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase">Total Outstanding Portfolio</div>
                <div className="text-2xl font-extrabold text-zinc-900 font-mono mt-2">48.6M <span className="text-xs font-normal text-zinc-500">XAF</span></div>
                <div className="text-[11px] text-emerald-700 font-medium mt-1">100% Principal Tracked</div>
              </div>
            </div>

            {/* Right: Health Breakdown */}
            <div className="lg:col-span-8 p-7 rounded-2xl bg-[#04342C] text-white flex flex-col justify-between border border-[#0F6E56]">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-[#0F6E56]">
                  <h3 className="font-bold text-lg text-[#E1F5EE]">Portfolio Repayment Health Breakdown</h3>
                  <span className="text-xs font-mono text-[#5DCAA5] bg-[#0F6E56] px-3 py-1 rounded-full">
                    Audited Daily
                  </span>
                </div>

                <div className="mt-6 space-y-5">
                  <div>
                    <div className="flex justify-between text-xs text-[#9FE1CB] mb-2 font-medium">
                      <span>On-Time Active Servicing (82.4%)</span>
                      <span className="text-[#5DCAA5] font-bold">1,028 Devices</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#032620] overflow-hidden">
                      <div className="h-full bg-[#5DCAA5] rounded-full w-[82.4%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-[#9FE1CB] mb-2 font-medium">
                      <span>In Grace Period / Friendly Warning (10.2%)</span>
                      <span className="text-amber-400 font-bold">127 Devices</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#032620] overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full w-[10.2%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-[#9FE1CB] mb-2 font-medium">
                      <span>Soft Lock / Restricted Kiosk (5.2%)</span>
                      <span className="text-orange-400 font-bold">65 Devices</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#032620] overflow-hidden">
                      <div className="h-full bg-orange-400 rounded-full w-[5.2%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-[#9FE1CB] mb-2 font-medium">
                      <span>Hard Lock / Severe Arrears (2.2%)</span>
                      <span className="text-red-400 font-bold">28 Devices</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#032620] overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full w-[2.2%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#0F6E56] flex items-center justify-between text-xs text-[#9FE1CB]">
                <span>Automatic Double-Entry Journal Reconciliation</span>
                <span className="text-[#5DCAA5] font-semibold">Zero Default Write-Off Leaks</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          10. INTERACTIVE FINANCING CALCULATOR
      ────────────────────────────────────────────────────────────── */}
      <section id="calculator" className="py-20 lg:py-24 bg-[#FBFBFC] border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[760px]">
            <div className="mb-8 text-center space-y-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
                Simulate customer plans in real time
              </h2>
              <p className="mx-auto max-w-[500px] text-sm text-zinc-600 leading-relaxed">
                See how flexible down payments and terms lower customer friction while keeping your cash flow fully protected.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-200/80 bg-zinc-50/90 px-6 py-4">
                <div className="flex items-center gap-2 text-xs text-zinc-700 font-semibold">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#00D084]" />
                  <span>EonPay Installment Engine</span>
                  <span className="text-zinc-400">| CEMAC / WAEMU Standard</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Left: Inputs */}
                <div className="bg-white p-7 text-left space-y-6">
                  <div>
                    <div className="mb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                      1. Financed Phone Model
                    </div>
                    <select
                      className="w-full rounded-xl border border-zinc-300 bg-zinc-50/80 p-3 text-xs font-bold text-zinc-900 outline-none focus:border-[#00D084] transition-colors"
                      value={phonePrice}
                      onChange={(e) => setPhonePrice(Number(e.target.value))}
                    >
                      {PHONES.map((p) => (
                        <option key={p.label} value={p.price}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-2 flex justify-between items-center">
                      <span className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                        2. Down Payment ({downPaymentPct}%)
                      </span>
                      <span className="text-xs font-bold text-emerald-800">
                        {formatXaf(downPaymentAmount)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={40}
                      step={1}
                      value={downPaymentPct}
                      onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                      className="w-full accent-[#04342C] cursor-pointer h-2 bg-zinc-200 rounded-lg"
                    />
                    <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400 font-medium font-mono">
                      <span>15%</span>
                      <span>20%</span>
                      <span>25%</span>
                      <span>30%</span>
                      <span>40%</span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                      3. Repayment Tenor
                    </div>
                    <div className="flex gap-2">
                      {TENORS.map((m) => {
                        const active = m === tenorMonths;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTenorMonths(m)}
                            className={
                              active
                                ? "flex-1 rounded-xl bg-[#04342C] py-2.5 text-xs font-bold text-[#E1F5EE] shadow-xs cursor-pointer transition-all"
                                : "flex-1 rounded-xl border border-zinc-200 bg-zinc-50/70 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 cursor-pointer transition-all"
                            }
                          >
                            {m} mos
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right: Summary */}
                <div className="flex flex-col justify-between bg-[#04342C] p-7 text-left border-t md:border-t-0 md:border-l border-[#0F6E56]">
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-xs font-medium text-[#E1F5EE]">
                        Customer installment plan
                      </span>
                      <span className="rounded-full bg-[#0F6E56] px-2.5 py-1 text-[10px] font-medium text-[#9FE1CB]">
                        {tenorMonths} monthly installments
                      </span>
                    </div>
                    <div className="mb-1 text-xs text-[#9FE1CB]">
                      Calculated monthly installment
                    </div>
                    <div className="mb-1.5 flex items-baseline gap-1.5">
                      <span className="text-[36px] font-extrabold text-[#5DCAA5] tracking-tight font-mono">
                        {Math.round(monthlyInstallment).toLocaleString("en-US")}
                      </span>
                      <span className="text-xs text-[#9FE1CB]">XAF / mo</span>
                    </div>
                    <div className="mb-6 text-[11px] text-[#9FE1CB] leading-relaxed">
                      Auto-collected via MTN MoMo and Orange Money
                    </div>

                    <div className="flex flex-col gap-3 border-t border-[#0F6E56] pt-4 font-medium">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#9FE1CB]">Retail Phone Price:</span>
                        <span className="text-[#E1F5EE] font-mono">{formatXaf(phonePrice)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#9FE1CB]">Collected at Checkout:</span>
                        <span className="text-[#5DCAA5] font-bold font-mono">{formatXaf(downPaymentAmount)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#9FE1CB]">Financed Principal:</span>
                        <span className="text-[#E1F5EE] font-mono">{formatXaf(financedPrincipal)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDemoModalOpen(true)}
                    className="mt-6 w-full rounded-xl bg-[#5DCAA5] py-3 text-xs font-bold text-[#04342C] hover:bg-[#5DCAA5]/90 transition-all cursor-pointer shadow-sm"
                  >
                    Configure for your store inventory →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          11. INSTITUTIONAL PERFORMANCE DRIVERS (Animated Stats)
      ────────────────────────────────────────────────────────────── */}
      <section id="impact" className="py-20 lg:py-24 bg-[#FBFBFC] border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div
            ref={statsSectionRef}
            className="rounded-3xl bg-[#04342C] px-8 py-14 text-center md:px-14 shadow-2xl border border-[#0F6E56]"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#E1F5EE] tracking-tight">
              Engineered for retailer profit and portfolio safety
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[#9FE1CB] leading-relaxed">
              Replaces unmanaged informal store credit with automated KYC, mobile money reconciliation, and hardware-backed DPC enforcement.
            </p>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl bg-[#0F6E56] shadow-md">
              {stats.map((stat) => (
                <StatCard key={stat.label} stat={stat} active={statsActive} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          12. SECURITY, TRUST & COMPLIANCE
      ────────────────────────────────────────────────────────────── */}
      <section id="security" className="py-20 lg:py-24 bg-gradient-to-b from-slate-50/60 via-white to-slate-50/40 border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              Built with security at the core
            </h2>
            <p className="text-base text-zinc-600 max-w-2xl mx-auto leading-relaxed">
              EonPay handles sensitive customer identities, financial contracts, and remote device policies with cryptographic guarantees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              {
                icon: Database,
                title: "PostgreSQL Row-Level Security",
                desc: "100% of application tables force database-engine level isolation. Runtime roles have zero bypass permissions.",
                iconStyle: "bg-blue-50 text-[#336791] border border-blue-100",
              },
              {
                icon: ShieldAlert,
                title: "Ed25519 Hardware Signing",
                desc: "Device policies are signed with asymmetric keys and verified locally in hardware Keystore before restrictions activate.",
                iconStyle: "bg-emerald-50 text-emerald-700 border border-emerald-100",
              },
              {
                icon: ScrollText,
                title: "SHA-256 Audit Hash Chains",
                desc: "Every administrative, staff, and financial event appends to an immutable cryptographic hash chain verifiable by auditors.",
                iconStyle: "bg-purple-50 text-purple-700 border border-purple-100",
              },
              {
                icon: Lock,
                title: "Staff MFA & Lockout Protection",
                desc: "Platform administration strictly enforces AAL2 multi-factor authentication with database protections against self-demotion.",
                iconStyle: "bg-amber-50 text-amber-700 border border-amber-100",
              },
              {
                icon: RefreshCcw,
                title: "Idempotent Financial Ledger",
                desc: "Every money mutation requires idempotency keys. Deferred database constraints prevent concurrent over-allocation.",
                iconStyle: "bg-teal-50 text-teal-700 border border-teal-100",
              },
              {
                icon: Server,
                title: "Replay-Resistant Webhooks",
                desc: "Constant-time HMAC-SHA256 signature verification with 300-second sliding timestamp windows for all telecom webhooks.",
                iconStyle: "bg-indigo-50 text-indigo-700 border border-indigo-100",
              },
            ].map((sec) => (
              <div key={sec.title} className="p-6 rounded-2xl border border-zinc-200/90 bg-white hover:border-zinc-300 hover:shadow-md transition-all">
                <div className={`size-10 rounded-xl grid place-items-center mb-4 ${sec.iconStyle}`}>
                  <sec.icon className="size-5" />
                </div>
                <h3 className="font-bold text-base text-zinc-950 mb-1.5">{sec.title}</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">{sec.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          13. PRODUCT ROADMAP
      ────────────────────────────────────────────────────────────── */}
      <section id="roadmap" className="bg-zinc-950 py-20 lg:py-24 text-white border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              We&apos;re building the future of retail financing
            </h2>
            <p className="text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              EonPay is expanding to provide phone retailers with smarter automation, deeper analytics, and regional scale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Column 1: Available Now */}
            <div className="rounded-2xl border border-emerald-500/30 bg-[#04342C]/80 p-7 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#0F6E56]">
                <h3 className="font-bold text-lg text-[#E1F5EE]">Available Now</h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#5DCAA5] text-[#04342C]">
                  Live
                </span>
              </div>
              <ul className="space-y-3 text-xs text-[#9FE1CB]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#5DCAA5] shrink-0" />
                  <span>Customer KYC & identity verification</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#5DCAA5] shrink-0" />
                  <span>Financing contracts & installment scheduling</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#5DCAA5] shrink-0" />
                  <span>MTN MoMo & Orange Money auto-matching</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#5DCAA5] shrink-0" />
                  <span>Android DPC device locking & release</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#5DCAA5] shrink-0" />
                  <span>Multi-branch inventory & IMEI tracking</span>
                </li>
              </ul>
            </div>

            {/* Column 2: Coming Soon */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-7 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="font-bold text-lg text-white">Coming Soon</h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Q3-Q4 2026
                </span>
              </div>
              <ul className="space-y-3 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Clock className="size-4 text-blue-400 shrink-0" />
                  <span>WhatsApp automated repayment reminder bots</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-4 text-blue-400 shrink-0" />
                  <span>Advanced credit scoring & guarantor graph</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-4 text-blue-400 shrink-0" />
                  <span>Commercial bank direct debit integrations</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-4 text-blue-400 shrink-0" />
                  <span>Automated legal collection escalation notices</span>
                </li>
              </ul>
            </div>

            {/* Column 3: Future Vision */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="font-bold text-lg text-zinc-300">Future Vision</h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Planned
                </span>
              </div>
              <ul className="space-y-3 text-xs text-zinc-400">
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-purple-400 shrink-0" />
                  <span>Retailer working capital financing liquidity pool</span>
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-purple-400 shrink-0" />
                  <span>Multi-country expansion (CEMAC & WAEMU)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-purple-400 shrink-0" />
                  <span>Secondary market refurbishment & device buyback</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          14. MERCHANT PROOF & CASE STUDIES
      ────────────────────────────────────────────────────────────── */}
      <section className="py-20 lg:py-24 bg-gradient-to-b from-[#F8FAFC] to-white border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              Trusted by leading phone retailers across Cameroon
            </h2>
            <p className="text-base text-zinc-600">
              Real store operators scaling their monthly sales without taking on default losses.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Story 1 */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00D084] to-emerald-600" />
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 text-emerald-600">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="size-3.5 fill-emerald-600 text-emerald-600" />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    +40% Volume
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  &ldquo;Before EonPay, we tried offering installments manually and suffered massive unpaid phone balances. With the Android DPC lock and MoMo auto-reconciliation, our on-time collection is consistently above 94%.&rdquo;
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center gap-3">
                <div className="size-9 rounded-xl bg-emerald-950 text-[#5DCAA5] font-bold text-xs grid place-items-center">
                  JM
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900">Jean-Paul Mbarga</div>
                  <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <MapPin className="size-3 text-[#00D084]" /> Akwa Smart Telecom, Douala
                  </div>
                </div>
              </div>
            </div>

            {/* Story 2 */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 text-emerald-600">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="size-3.5 fill-emerald-600 text-emerald-600" />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                    95.8% Repaid
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  &ldquo;Our inventory turnover skyrocketed in the first quarter. Customers love that they can pay 25,000 XAF down and walk out with a brand new Samsung phone while settling the rest over 6 months.&rdquo;
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center gap-3">
                <div className="size-9 rounded-xl bg-indigo-950 text-indigo-300 font-bold text-xs grid place-items-center">
                  BN
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900">Brigitte Nde</div>
                  <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <MapPin className="size-3 text-blue-600" /> Mokolo Mobile Hub, Yaoundé
                  </div>
                </div>
              </div>
            </div>

            {/* Story 3 */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 text-emerald-600">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="size-3.5 fill-emerald-600 text-emerald-600" />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                    3 Store Branches
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  &ldquo;Managing multi-store stock, cashier user roles, and daily mobile money inflows from one central console saves us hours of tedious accounting work every single morning.&rdquo;
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center gap-3">
                <div className="size-9 rounded-xl bg-amber-950 text-amber-300 font-bold text-xs grid place-items-center">
                  ET
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900">Emmanuel Tagne</div>
                  <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <MapPin className="size-3 text-amber-600" /> West Digital Devices, Bafoussam
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          15. FREQUENTLY ASKED QUESTIONS (Accordion)
      ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 lg:py-24 bg-gradient-to-b from-white to-slate-50/70 border-b border-zinc-200/70">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <div className="mb-10 text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
              Frequently asked questions
            </h2>
            <p className="mx-auto max-w-[460px] text-sm text-zinc-600 leading-relaxed">
              Everything you need to know about EonPay&apos;s retail financing workflow and Android hardware protection.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.question}
                  className={
                    isOpen
                      ? "rounded-2xl border border-emerald-500/40 bg-white p-6 shadow-sm transition-all"
                      : "rounded-2xl border border-zinc-200/80 bg-white p-6 hover:border-zinc-300 transition-all"
                  }
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="flex w-full items-start justify-between gap-3 text-left cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <div>
                      <div className="text-[15px] font-bold text-zinc-950">
                        {faq.question}
                      </div>
                    </div>
                    <div
                      className={
                        isOpen
                          ? "flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-[#E1F5EE]"
                          : "flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100"
                      }
                    >
                      {isOpen ? (
                        <Minus size={14} className="text-[#04342C]" />
                      ) : (
                        <Plus size={14} className="text-zinc-500" />
                      )}
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="mt-3.5 border-t border-zinc-100 pt-3.5 text-xs sm:text-sm leading-relaxed text-zinc-600">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          16. HIGH-IMPACT CLOSING CTA & DUAL FOOTER
      ────────────────────────────────────────────────────────────── */}
      <footer id="footer" className="p-4 sm:p-6 lg:p-8 bg-[#FBFBFC] text-xs">
        <div className="mx-auto max-w-7xl">
          {/* Upper Dark Closing CTA Panel (#04342C) */}
          <div className="mb-4 grid grid-cols-1 items-center gap-8 rounded-3xl bg-[#04342C] p-8 md:p-12 md:grid-cols-[1fr_auto] shadow-xl text-left border border-[#0F6E56]">
            <div>
              <h2 className="mb-2 text-2xl font-extrabold text-[#E1F5EE] md:text-3xl tracking-tight">
                Ready to transform your installment business?
              </h2>
              <p className="max-w-[480px] text-sm leading-relaxed text-[#9FE1CB]">
                Join hundreds of smartphone retailers across Cameroon already using EonPay to sell more phones, reduce risk, and get paid on time.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-shrink-0 gap-3">
              <button
                type="button"
                onClick={() => setDemoModalOpen(true)}
                className="rounded-xl bg-[#5DCAA5] px-6 py-3 text-sm font-bold text-[#04342C] hover:bg-[#5DCAA5]/90 transition-all cursor-pointer shadow-md"
              >
                Book a live demo →
              </button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="rounded-xl border border-[#0F6E56] bg-transparent px-6 py-3 text-sm font-semibold text-[#E1F5EE] hover:bg-[#0F6E56]/30 transition-all cursor-pointer"
              >
                Access Merchant Console
              </button>
            </div>
          </div>

          {/* Lower Lighter Links Panel */}
          <div className="rounded-3xl bg-white border border-zinc-200/90 px-8 md:px-12 pb-8 pt-10 text-left shadow-xs">
            <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-1 space-y-3">
                <div className="flex items-center gap-2 text-lg font-extrabold text-zinc-950">
                  <div className="size-7 rounded-lg bg-[#00D084] text-black grid place-items-center">
                    <Zap size={16} className="fill-black text-black stroke-[2.5]" />
                  </div>
                  <span>EonPay</span>
                </div>
                <p className="max-w-[240px] text-xs leading-relaxed text-zinc-500">
                  Smart phone financing, stronger protection. Built for consumer electronics retailers across Africa.
                </p>
              </div>

              {/* 4 Link Columns */}
              {footerLinkColumns.map((col) => (
                <div key={col.heading}>
                  <div className="mb-3.5 text-xs font-bold tracking-wider text-zinc-900 uppercase">
                    {col.heading}
                  </div>
                  <div className="flex flex-col gap-2.5 text-xs text-zinc-600">
                    {col.links.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        onClick={(e) => {
                          if (link.href.startsWith("/")) {
                            e.preventDefault();
                            navigate(link.href);
                          } else if (link.href.startsWith("#")) {
                            scrollToSection(e, link.href.slice(1));
                          }
                        }}
                        className="hover:text-zinc-950 hover:underline transition-colors"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-zinc-200/80 pt-6 gap-3 text-xs text-zinc-500">
              <div>
                © {new Date().getFullYear()} EonPay Technologies, Inc. All rights reserved.
              </div>
              <div className="flex items-center gap-2 text-zinc-700 font-medium">
                <MapPin size={14} className="text-[#00D084]" />
                <span>Operating in Cameroon & CEMAC Region (XAF)</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ─────────────────────────────────────────────────────────────
          17. BOOK A DEMO / STORE WALKTHROUGH MODAL
      ────────────────────────────────────────────────────────────── */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-2xl relative text-left">
            <button
              type="button"
              onClick={() => setDemoModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 cursor-pointer"
            >
              <X className="size-5" />
            </button>

            {demoFormSubmitted ? (
              <div className="text-center py-8 space-y-3 animate-in zoom-in-95 duration-150">
                <div className="size-14 rounded-full bg-emerald-100 text-emerald-700 mx-auto grid place-items-center">
                  <CheckCircle2 className="size-8 text-emerald-700" />
                </div>
                <h3 className="text-xl font-bold text-zinc-950">Walkthrough Request Received</h3>
                <p className="text-xs text-zinc-600 max-w-xs mx-auto">
                  Our retail onboarding specialist will reach out to your store via WhatsApp within 2 hours to configure your customized demo.
                </p>
              </div>
            ) : (
              <form onSubmit={handleDemoSubmit} className="space-y-4">
                <div>
                  <h3 className="text-2xl font-extrabold text-zinc-950 mt-0.5 tracking-tight">See EonPay in action</h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Tell us about your smartphone store and we will prepare a live walkthrough tailored to your brand inventory.
                  </p>
                </div>

                <div className="space-y-3 pt-1 text-xs">
                  <div>
                    <label className="font-semibold text-zinc-800">Store / Retailer Name</label>
                    <input
                      type="text"
                      required
                      value={demoFormData.storeName}
                      onChange={(e) => setDemoFormData({ ...demoFormData, storeName: e.target.value })}
                      placeholder="e.g. Akwa Smart Telecom"
                      className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 outline-none focus:border-[#00D084] font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-zinc-800">Full Name / Contact Person</label>
                    <input
                      type="text"
                      required
                      value={demoFormData.fullName}
                      onChange={(e) => setDemoFormData({ ...demoFormData, fullName: e.target.value })}
                      placeholder="e.g. Jean-Paul Mbarga"
                      className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 outline-none focus:border-[#00D084] font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-zinc-800">WhatsApp Phone</label>
                      <input
                        type="tel"
                        required
                        value={demoFormData.phone}
                        onChange={(e) => setDemoFormData({ ...demoFormData, phone: e.target.value })}
                        placeholder="+237 6XX XXX XXX"
                        className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 outline-none focus:border-[#00D084] font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-zinc-800">City / Market</label>
                      <select
                        value={demoFormData.city}
                        onChange={(e) => setDemoFormData({ ...demoFormData, city: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 bg-white outline-none focus:border-[#00D084] font-medium"
                      >
                        <option value="Douala">Douala (Akwa / Bonabéri)</option>
                        <option value="Yaoundé">Yaoundé (Mokolo / Centre)</option>
                        <option value="Bafoussam">Bafoussam</option>
                        <option value="Garoua">Garoua</option>
                        <option value="Other">Other CEMAC City</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-zinc-800">Estimated Monthly Device Sales</label>
                    <select
                      value={demoFormData.monthlyVolume}
                      onChange={(e) => setDemoFormData({ ...demoFormData, monthlyVolume: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 bg-white outline-none focus:border-[#00D084] font-medium"
                    >
                      <option value="20-50 phones">20 – 50 phones / month</option>
                      <option value="50-100 phones">50 – 100 phones / month</option>
                      <option value="100-300 phones">100 – 300 phones / month</option>
                      <option value="300+ phones">300+ phones / month (Multi-branch)</option>
                    </select>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2 rounded-xl bg-[#00D084] text-slate-950 font-bold text-sm h-11 hover:bg-[#00B974] cursor-pointer shadow-md"
                >
                  Schedule Store Walkthrough →
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          18. FLOATING SCROLL TO TOP BUTTON
      ────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            type="button"
            onClick={scrollToTop}
            initial={{ opacity: 0, scale: 0.8, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 16 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-2xl backdrop-blur-md border border-zinc-800/80 hover:bg-[#00D084] hover:text-slate-950 hover:border-[#00D084] transition-colors cursor-pointer group"
            aria-label="Scroll back to top"
            title="Scroll to top"
          >
            <ArrowUp className="size-5 transition-transform group-hover:-translate-y-0.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
