import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "../../components/common/AsyncState";
import { apiRequest } from "../../lib/api";
import { dateTime } from "../../lib/format";

interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationalIdReference: string | null;
  createdAt: string;
}

export function Profile() {
  const query = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => apiRequest<CustomerProfile>("/me/profile"),
  });
  if (query.isLoading) return <LoadingState label="Loading your profile…" />;
  if (query.isError || query.data === undefined) {
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  }
  const profile = query.data;
  return (
    <section>
      <h1 className="text-xl">Profile</h1>
      <dl className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">
        <Row label="Full name" value={profile.fullName} />
        <Row label="Phone" value={profile.phone} />
        <Row label="Email" value={profile.email ?? "Not provided"} />
        <Row
          label="National ID reference"
          value={profile.nationalIdReference ?? "Not provided"}
        />
        <Row label="Customer since" value={dateTime(profile.createdAt)} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
