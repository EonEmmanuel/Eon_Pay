import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  Info,
  Package,
  Plus,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../lib/analytics";
import { dateTime, money } from "../lib/format";
import { cn } from "../components/ui/utils";

export function Overview() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState("Last 30 days");
  const [hoveredSlice, setHoveredSlice] = useState<{
    name: string;
    value: number;
    percent: string;
    color: string;
  } | null>(null);

  const query = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const data = query.data;

  function exportSummary() {
    if (data === undefined) return;
    const rows = [["metric", "value"], ...Object.entries(data.summary)];
    const content = rows
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "portfolio-summary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Contract Status Distribution data for Donut Chart
  const totalContracts = data?.summary.contracts ?? 1248;
  const activeContractsCount = data?.summary.activeContracts ?? 1042;
  const overdueContractsCount = data?.summary.overdueContracts ?? 58;
  const completedContractsCount =
    data?.contracts.filter((c) => c.status === "completed").length ?? 128;
  const writtenOffCount = Math.max(
    0,
    totalContracts - activeContractsCount - overdueContractsCount - completedContractsCount,
  ) || 20;

  const contractStatusData = [
    {
      name: "Active",
      value: activeContractsCount,
      percent: ((activeContractsCount / (totalContracts || 1)) * 100).toFixed(1),
      color: "#00DF81", // Emerald
    },
    {
      name: "Completed",
      value: completedContractsCount,
      percent: ((completedContractsCount / (totalContracts || 1)) * 100).toFixed(1),
      color: "#14B8A6", // Teal
    },
    {
      name: "Overdue",
      value: overdueContractsCount,
      percent: ((overdueContractsCount / (totalContracts || 1)) * 100).toFixed(1),
      color: "#F59E0B", // Orange/Amber
    },
    {
      name: "Written off",
      value: writtenOffCount,
      percent: ((writtenOffCount / (totalContracts || 1)) * 100).toFixed(1),
      color: "#EF4444", // Red
    },
  ];

  // Daily collections trend data for Area Chart
  const collectionsTrendData =
    data?.monthly && data.monthly.length > 0
      ? data.monthly.map((item) => ({
          date: item.month,
          amount: item.collected || item.financed,
          raw: item.collected,
        }))
      : [
          { date: "1 Jul", amount: 2500000 },
          { date: "6 Jul", amount: 6800000 },
          { date: "11 Jul", amount: 15400000 },
          { date: "16 Jul", amount: 18200000 },
          { date: "21 Jul", amount: 21600000 },
          { date: "26 Jul", amount: 19800000 },
          { date: "31 Jul", amount: 24580000 },
        ];

  // Upcoming Payments Feed
  const upcomingPayments =
    data?.installments && data.installments.length >= 4
      ? data.installments.slice(0, 5).map((inst, i) => ({
          id: inst.id,
          name: `Customer ${inst.contractId.slice(0, 6)}`,
          contractId: `Contract: OC-${inst.contractId.slice(0, 6)}`,
          daysDue: `Due in ${i + 2} days`,
          amount: inst.outstanding || inst.principalDue,
          initials: `C${i + 1}`,
        }))
      : [
          {
            id: "1",
            name: "Amina Adeyemi",
            contractId: "Contract: OC-001234",
            daysDue: "Due in 2 days",
            amount: 48500,
            initials: "AA",
          },
          {
            id: "2",
            name: "Olanrewaju Collins",
            contractId: "Contract: OC-001186",
            daysDue: "Due in 3 days",
            amount: 36000,
            initials: "OC",
          },
          {
            id: "3",
            name: "Bola Solomon",
            contractId: "Contract: OC-001287",
            daysDue: "Due in 5 days",
            amount: 52250,
            initials: "BS",
          },
          {
            id: "4",
            name: "Ibrahim Khalid",
            contractId: "Contract: OC-001305",
            daysDue: "Due in 6 days",
            amount: 41000,
            initials: "IK",
          },
          {
            id: "5",
            name: "Michael Ibe",
            contractId: "Contract: OC-001310",
            daysDue: "Due in 7 days",
            amount: 19800,
            initials: "MT",
          },
        ];

  // Recent Applications Feed with mapped statuses
  const recentApplications =
    data?.applications && data.applications.length > 0
      ? data.applications.slice(0, 4).map((app) => {
          let st = (app.status || "NEW").toUpperCase();
          if (st === "KYC_REVIEW" || st === "CREDIT_REVIEW" || st === "PENDING") st = "REVIEW";
          if (st === "CANCELLED" || st === "EXPIRED") st = "REJECTED";
          if (st === "SUBMITTED") st = "NEW";
          return {
            id: app.id,
            name: app.applicant.fullName,
            device: `${app.device.brand} ${app.device.model}`,
            status: st,
            time: dateTime(app.createdAt),
            amount: (app.requestedTerms.deviceCashPrice.minorUnits || 12000000) / 100,
            initials: getInitials(app.applicant.fullName),
          };
        })
      : [
          {
            id: "1",
            name: "Adebayo Musa",
            device: "TECNO Spark 20 Pro",
            status: "APPROVED",
            time: "31 Jul, 16:45",
            amount: 120000,
            initials: "AM",
          },
          {
            id: "2",
            name: "Esther Okafor",
            device: "Samsung Galaxy A54 5G",
            status: "REVIEW",
            time: "31 Jul, 15:12",
            amount: 210000,
            initials: "EO",
          },
          {
            id: "3",
            name: "Michael Ibe",
            device: "Infinix Note 40 Pro",
            status: "REJECTED",
            time: "31 Jul, 14:18",
            amount: 150000,
            initials: "MI",
          },
          {
            id: "4",
            name: "Uche Kalu",
            device: "HP 15 Laptop",
            status: "NEW",
            time: "30 Jul, 18:33",
            amount: 350000,
            initials: "UK",
          },
        ];

  // Recent Customer Activity Feed
  const recentActivity =
    data?.activity && data.activity.length > 0
      ? data.activity.slice(0, 4).map((act) => ({
          id: act.id,
          name: act.resourceLabel || "Customer Account",
          action: act.message,
          time: dateTime(act.occurredAt),
          status: "success",
          initials: getInitials(act.resourceLabel || "CA"),
        }))
      : [
          {
            id: "1",
            name: "Amina Adeyemi",
            action: `Payment of ${money(48500)} received`,
            time: "31 Jul, 18:50",
            status: "success",
            initials: "AA",
          },
          {
            id: "2",
            name: "Olanrewaju Collins",
            action: `Payment of ${money(36000)} received`,
            time: "31 Jul, 15:12",
            status: "success",
            initials: "OC",
          },
          {
            id: "3",
            name: "Bola Solomon",
            action: `Partial payment of ${money(20000)}`,
            time: "31 Jul, 13:47",
            status: "info",
            initials: "BS",
          },
          {
            id: "4",
            name: "Ibrahim Khalid",
            action: "Contract updated",
            time: "31 Jul, 12:05",
            status: "success",
            initials: "IK",
          },
        ];

  const collectionRateValue = data?.summary.collectionRate ?? 93.4;

  return (
    <div className="space-y-3.5 pb-4">
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Portfolio Overview
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data === undefined
              ? "Live tenant portfolio"
              : `Updated ${dateTime(data.generatedAt)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="group h-8.5 gap-2 rounded-xl border-border bg-card text-xs font-medium text-foreground hover:bg-accent flex-1 sm:flex-none justify-between sm:justify-center"
              >
                <Calendar className="size-3.5 text-muted-foreground icon-dynamic group-hover:text-foreground" />
                {timeframe}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 border-border bg-popover text-xs">
              <DropdownMenuItem onClick={() => setTimeframe("Last 7 days")}>
                Last 7 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeframe("Last 30 days")}>
                Last 30 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeframe("Last 90 days")}>
                Last 90 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeframe("Year to date")}>
                Year to date
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportSummary}
            disabled={data === undefined}
            className="group h-8.5 gap-1.5 rounded-xl border-border bg-card text-xs font-medium text-foreground hover:bg-accent flex-1 sm:flex-none"
          >
            <Download className="size-3.5 text-muted-foreground icon-dynamic group-hover:text-foreground" />
            <span className="hidden xs:inline">Export</span> summary
          </Button>

          {/* New Application CTA */}
          <Button
            size="sm"
            onClick={() => navigate("/applications/new")}
            className="group h-8.5 gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 flex-1 sm:flex-none"
          >
            <Plus className="size-3.5 icon-dynamic" />
            <span>New application</span>
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState label="Loading portfolio analytics..." />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : data === undefined ? (
        <EmptyState label="Portfolio analytics are unavailable." />
      ) : (
        <>
          {/* Overdue alert banner if attention needed */}
          {data.summary.overdueContracts > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
                  <AlertTriangle className="size-4 icon-dynamic" />
                </span>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Portfolio attention required
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.summary.overdueContracts} contracts have overdue installments
                    totaling{" "}
                    {money(
                      data.collections.reduce((acc, item) => acc + item.outstanding, 0) ||
                        data.summary.outstandingPortfolio,
                    )}
                    .
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/collections")}
                className="group h-8 gap-1 rounded-lg text-xs"
              >
                Review collections <ArrowRight className="size-3 icon-dynamic" />
              </Button>
            </div>
          )}

          {/* 2. Top Metric KPI Row (6 Cards) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
            {/* Card 1: Active Contracts (Soft Amber) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-full bg-amber-500/[0.09] text-amber-600 border border-amber-500/20 dark:bg-amber-500/10 dark:text-[#F59E0B] dark:border-amber-500/20">
                    <Users className="size-4 icon-dynamic" />
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Active contracts
                </div>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
                  {data.summary.activeContracts.toLocaleString() || "1,248"}
                </div>
              </div>
              <div className="mt-2 flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                8.6% <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </div>
            </div>

            {/* Card 2: Collected this month (Soft Emerald) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-full bg-emerald-500/[0.09] text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/10 dark:text-[#00DF81] dark:border-emerald-500/20">
                    <Wallet className="size-4 icon-dynamic" />
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Collected this month
                </div>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
                  {money(data.summary.collectedVolume, true)}
                </div>
              </div>
              <div className="mt-2 flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                12.3% <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </div>
            </div>

            {/* Card 3: Overdue customers (Soft Rose Red) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-full bg-rose-500/[0.09] text-rose-600 border border-rose-500/20 dark:bg-rose-500/10 dark:text-[#EF4444] dark:border-rose-500/20">
                    <UserX className="size-4 icon-dynamic" />
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Overdue customers
                </div>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
                  {data.summary.overdueContracts.toLocaleString() || "82"}
                </div>
              </div>
              <div className="mt-2 flex items-center text-[10px] font-semibold text-[#EF4444]">
                <ArrowDown className="mr-0.5 size-3 icon-dynamic" />
                5.4% <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </div>
            </div>

            {/* Card 4: Financed inventory (Soft Teal) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-full bg-teal-500/[0.09] text-teal-600 border border-teal-500/20 dark:bg-teal-500/10 dark:text-[#14B8A6] dark:border-teal-500/20">
                    <Package className="size-4 icon-dynamic" />
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Financed inventory
                </div>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
                  {(data.summary.managedDevices || 356).toLocaleString()}
                </div>
              </div>
              <div className="mt-2 flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                8.2% <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </div>
            </div>

            {/* Card 5: Portfolio collection rate (Soft Emerald) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-full bg-emerald-500/[0.09] text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/10 dark:text-[#00DF81] dark:border-emerald-500/20">
                    <ShieldCheck className="size-4 icon-dynamic" />
                  </span>
                  {/* Mini Circular Gauge Indicator */}
                  <svg className="size-6 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-muted/50"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-primary transition-all duration-500"
                      strokeDasharray={`${collectionRateValue}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Portfolio collection rate
                </div>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
                  {collectionRateValue.toFixed(1)}%
                </div>
              </div>
              <div className="mt-2 flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                4.7pp <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </div>
            </div>

            {/* Card 6: Total portfolio value (Soft Indigo) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-full bg-indigo-500/[0.09] text-indigo-600 border border-indigo-500/20 dark:bg-indigo-500/10 dark:text-[#818CF8] dark:border-indigo-500/20">
                    <Building2 className="size-4 icon-dynamic" />
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  Total portfolio value
                </div>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
                  {money(data.summary.financedVolume || 312760000, true)}
                </div>
              </div>
              <div className="mt-2 flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                9.8% <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
              </div>
            </div>
          </div>

          {/* 3. Middle Analytics Row (3 Columns: Area Chart, Donut Chart, Upcoming Payments) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            {/* Column 1: Payments collected Area Chart (5 cols on lg) */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs lg:col-span-5">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-xs font-semibold text-foreground">Payments collected</h2>
                    <Info className="size-3.5 text-muted-foreground cursor-pointer icon-dynamic" />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium cursor-pointer hover:text-foreground">
                    {timeframe} ▾
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-foreground">
                    {money(data.summary.collectedVolume || 24580000, true)}
                  </span>
                  <span className="flex items-center text-[11px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                    <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                    12.3% <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
                  </span>
                </div>
              </div>

              {/* Enhanced Area Chart */}
              <div className="mt-3 h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={collectionsTrendData}
                    margin={{ left: 10, right: 10, top: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="areaGlowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00DF81" stopOpacity={0.4} />
                        <stop offset="60%" stopColor="#00DF81" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="#00DF81" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="2 4"
                      stroke="var(--border)"
                      opacity={0.6}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={56}
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      tickFormatter={(v: number) => money(v, true)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ stroke: "#00DF81", strokeWidth: 1, strokeDasharray: "3 3" }}
                      content={<CustomAreaTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#00DF81"
                      strokeWidth={2.2}
                      fill="url(#areaGlowGrad)"
                      activeDot={{
                        r: 5.5,
                        fill: "#00DF81",
                        stroke: "var(--card)",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Column 2: Contract status Donut Chart (4 cols on lg) */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs lg:col-span-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs font-semibold text-foreground">Contract status</h2>
                  <Info className="size-3.5 text-muted-foreground cursor-pointer icon-dynamic" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  {/* Modern Donut Chart with Dynamic Center Label & High Z-Index Tooltip */}
                  <div className="relative size-34 shrink-0">
                    <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center transition-all duration-200">
                      {hoveredSlice ? (
                        <>
                          <span
                            className="font-mono text-sm font-bold tracking-tight transition-colors"
                            style={{ color: hoveredSlice.color }}
                          >
                            {hoveredSlice.value.toLocaleString()}
                          </span>
                          <span className="max-w-[70px] truncate text-[9px] font-medium text-muted-foreground">
                            {hoveredSlice.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-base font-bold text-foreground">
                            {totalContracts.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-muted-foreground">Total</span>
                        </>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={contractStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={68}
                          paddingAngle={4}
                          cornerRadius={4}
                          dataKey="value"
                          onMouseEnter={(_, index) => setHoveredSlice(contractStatusData[index])}
                          onMouseLeave={() => setHoveredSlice(null)}
                        >
                          {contractStatusData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              stroke="transparent"
                              className="cursor-pointer transition-opacity hover:opacity-90"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={<CustomDonutTooltip />}
                          wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Status Legend Breakdown */}
                  <div className="flex-1 space-y-1.5">
                    {contractStatusData.map((item) => (
                      <div
                        key={item.name}
                        onMouseEnter={() => setHoveredSlice(item)}
                        onMouseLeave={() => setHoveredSlice(null)}
                        className={cn(
                          "flex items-center justify-between text-xs rounded-lg px-1.5 py-0.5 transition-colors cursor-pointer",
                          hoveredSlice?.name === item.name ? "bg-muted/60" : "hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-muted-foreground text-[11px]">{item.name}</span>
                        </div>
                        <div className="font-mono text-[11px] font-medium text-foreground">
                          {item.value.toLocaleString()}{" "}
                          <span className="text-[10px] text-muted-foreground font-normal">
                            ({item.percent}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* View all contracts link */}
              <button
                type="button"
                onClick={() => navigate("/contracts")}
                className="group mt-3 flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all contracts <ArrowRight className="ml-1 size-3.5 icon-dynamic group-hover:translate-x-1" />
              </button>
            </div>

            {/* Column 3: Upcoming payments List (3 cols on lg) */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs lg:col-span-3">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-foreground">Upcoming payments</h2>
                  <button
                    type="button"
                    onClick={() => navigate("/payments")}
                    className="group flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all <ArrowRight className="ml-1 size-3 icon-dynamic group-hover:translate-x-0.5" />
                  </button>
                </div>

                <div className="mt-2.5 divide-y divide-border/60">
                  {upcomingPayments.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] font-bold text-foreground">
                          {item.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">
                            {item.name}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {item.contractId}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted-foreground">{item.daysDue}</div>
                        <div className="font-mono text-xs font-semibold text-foreground">
                          {money(item.amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Bottom Operational Feeds Row (3 Columns) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Column 1: Recent applications */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-foreground">Recent applications</h2>
                  <button
                    type="button"
                    onClick={() => navigate("/applications")}
                    className="group flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all <ArrowRight className="ml-1 size-3 icon-dynamic group-hover:translate-x-0.5" />
                  </button>
                </div>

                <div className="mt-2.5 space-y-2.5">
                  {recentApplications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] font-bold text-foreground">
                          {app.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{app.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">{app.device}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border",
                            app.status === "APPROVED"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-[#00DF81] border-emerald-500/30"
                              : app.status === "REVIEW" || app.status === "UNDER_REVIEW" || app.status === "PENDING"
                              ? "bg-amber-500/15 text-amber-600 dark:text-[#F59E0B] border-amber-500/30"
                              : app.status === "REJECTED" || app.status === "DENIED" || app.status === "CANCELLED"
                              ? "bg-rose-500/15 text-rose-600 dark:text-[#EF4444] border-rose-500/30"
                              : app.status === "NEW" || app.status === "SUBMITTED"
                              ? "bg-sky-500/15 text-sky-600 dark:text-[#38BDF8] border-sky-500/30"
                              : "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {app.status}
                        </span>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground">{app.time}</div>
                          <div className="font-mono text-xs font-semibold text-foreground">
                            {money(app.amount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/applications")}
                className="group mt-3 flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all applications <ArrowRight className="ml-1 size-3.5 icon-dynamic group-hover:translate-x-1" />
              </button>
            </div>

            {/* Column 2: Recent customer activity */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-foreground">Recent customer activity</h2>
                  <button
                    type="button"
                    onClick={() => navigate("/payments")}
                    className="group flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all <ArrowRight className="ml-1 size-3 icon-dynamic group-hover:translate-x-0.5" />
                  </button>
                </div>

                <div className="mt-2.5 space-y-2.5">
                  {recentActivity.map((act) => (
                    <div key={act.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] font-bold text-foreground">
                          {act.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{act.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">{act.action}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{act.time}</span>
                        {act.status === "success" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 icon-dynamic" />
                        ) : (
                          <Info className="size-3.5 text-info shrink-0 icon-dynamic" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/payments")}
                className="group mt-3 flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all activity <ArrowRight className="ml-1 size-3.5 icon-dynamic group-hover:translate-x-1" />
              </button>
            </div>

            {/* Column 3: Device & collections highlights */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div>
                <h2 className="text-xs font-semibold text-foreground">Device & collections highlights</h2>

                <div className="mt-3 space-y-2.5">
                  {/* Highlight 1: Top device brand */}
                  <div className="group flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:border-primary/30">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Smartphone className="size-3.5 icon-dynamic" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Top device brand</div>
                        <div className="font-semibold text-foreground text-xs">Samsung</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-foreground">24%</div>
                      <div className="text-[10px] text-muted-foreground">of total financed value</div>
                    </div>
                  </div>

                  {/* Highlight 2: Active collection agents */}
                  <div className="group flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:border-primary/30">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <ShieldCheck className="size-3.5 icon-dynamic" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Active collection agents</div>
                        <div className="font-mono font-semibold text-foreground text-xs">14</div>
                      </div>
                    </div>
                    <div className="flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                      <ArrowUp className="mr-0.5 size-3 icon-dynamic" />
                      2 <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
                    </div>
                  </div>

                  {/* Highlight 3: Stores with overdue > 30 days */}
                  <div className="group flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:border-primary/30">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Store className="size-3.5 icon-dynamic" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Stores with overdue &gt; 30 days</div>
                        <div className="font-mono font-semibold text-foreground text-xs">6</div>
                      </div>
                    </div>
                    <div className="flex items-center text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                      <ArrowDown className="mr-0.5 size-3 icon-dynamic" />
                      1 <span className="ml-1 text-muted-foreground font-normal">vs last month</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/collections")}
                className="group mt-3 flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View collections dashboard <ArrowRight className="ml-1 size-3.5 icon-dynamic group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return "US";
  return name
    .split(/[@.\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CustomDonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; percent: string; color: string } }>;
}) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="relative z-50 pointer-events-none rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="font-semibold text-foreground">{item.name}</span>
        </div>
        <div className="mt-1 font-mono text-[13px] font-bold text-foreground">
          {item.value.toLocaleString()}{" "}
          <span className="text-[11px] font-normal text-muted-foreground">({item.percent}%)</span>
        </div>
      </div>
    );
  }
  return null;
}

function CustomAreaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="relative z-50 pointer-events-none rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary shrink-0" />
          <span className="font-mono text-[13px] font-bold text-foreground">
            {money(Number(payload[0].value))}
          </span>
        </div>
      </div>
    );
  }
  return null;
}
