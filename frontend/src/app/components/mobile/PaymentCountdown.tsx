import { useEffect, useState } from "react";

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  overdue: boolean;
};

function getRemaining(target: number): Remaining {
  const diff = target - Date.now();
  const overdue = diff <= 0;
  const abs = Math.abs(diff);
  return {
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
    overdue,
  };
}

// Live ticking countdown to the next payment due date.
export function PaymentCountdown({ dueDate }: { dueDate: string }) {
  // Due at end of the due day (local midnight of the following day).
  const target = new Date(`${dueDate}T23:59:59`).getTime();
  const [t, setT] = useState<Remaining>(() => getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setT(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const units = [
    { label: "days", value: t.days },
    { label: "hrs", value: t.hours },
    { label: "min", value: t.minutes },
    { label: "sec", value: t.seconds },
  ];

  return (
    <div>
      <div className="mb-1.5 text-[11px] text-white/70">
        {t.overdue ? "Payment overdue by" : "Time until next payment"}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {units.map((u) => (
          <div
            key={u.label}
            className="rounded-xl border border-white/10 bg-white/[0.06] py-1.5 text-center backdrop-blur"
          >
            <div className="font-mono text-lg font-semibold leading-none tabular-nums">
              {String(u.value).padStart(2, "0")}
            </div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wide text-white/60">
              {u.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
