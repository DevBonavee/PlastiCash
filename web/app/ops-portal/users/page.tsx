import { Suspense } from "react";

import { CreateCollector, UsersTable } from "@/components/ops/users-table";
import { OpsPage, selectClass } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRow } from "@/lib/admin-types";
import { get } from "@/lib/api";
import type { Me } from "@/lib/me";

type Filters = { q?: string; role?: string; minor?: string; consent?: string };

export default function UsersPage({ searchParams }: PageProps<"/ops-portal/users">) {
  return (
    <OpsPage
      title="Users and collectors"
      filters={
        <Suspense>
          <FilterForm searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </OpsPage>
  );
}

async function filtersOf(searchParams: PageProps<"/ops-portal/users">["searchParams"]): Promise<Filters> {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const minors = one(params.minors);
  // "minors" picks under-18s, optionally by their guardian's answer; the API takes minor=true and consent=...
  return {
    q: one(params.q),
    role: one(params.role),
    minor: minors ? "true" : undefined,
    consent: minors && minors !== "all" ? minors : undefined,
  };
}

async function FilterForm({ searchParams }: { searchParams: PageProps<"/ops-portal/users">["searchParams"] }) {
  const f = await filtersOf(searchParams);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form className="flex flex-wrap items-end gap-2" action="/ops-portal/users">
        <input name="q" defaultValue={f.q ?? ""} placeholder="Name, email or phone" aria-label="Search" className={`${selectClass} w-56`} />
        <select name="role" defaultValue={f.role ?? ""} aria-label="Role" className={selectClass}>
          <option value="">Everyone</option>
          <option value="USER">Customers</option>
          <option value="COLLECTOR">Collectors</option>
          <option value="ADMIN">Admins</option>
        </select>
        <select name="minors" defaultValue={f.minor ? (f.consent ?? "all") : ""} aria-label="Under 18" className={selectClass}>
          <option value="">Any age</option>
          <option value="all">Under 18: all</option>
          <option value="PENDING">Under 18: waiting for guardian</option>
          <option value="EXPIRED">Under 18: link expired</option>
          <option value="DECLINED">Under 18: guardian declined</option>
          <option value="GRANTED">Under 18: guardian approved</option>
        </select>
        <button type="submit" className="d-btn d-btn-outline d-btn-sm">
          Search
        </button>
      </form>
      <CreateCollector />
    </div>
  );
}

async function Users({ searchParams }: { searchParams: PageProps<"/ops-portal/users">["searchParams"] }) {
  const f = await filtersOf(searchParams);
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const [rows, me] = await Promise.all([get<UserRow[]>(`/admin/users${query ? `?${query}` : ""}`), get<Me>("/me")]);
  return <UsersTable rows={rows} meId={me.id} />;
}
