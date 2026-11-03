"use client";

import { Check, School, Sprout, User } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PhoneInput } from "@/components/brand/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADULT_AGE, MIN_AGE, ageOn, lagosToday } from "@/lib/age";
import { AREAS, ORG_TYPES } from "@/lib/areas";
import { cn } from "@/lib/utils";

import { createProfile, type DetailsState } from "./actions";

const INITIAL: DetailsState = { attempt: 0, values: {}, fieldErrors: {}, message: null };

// Native <select> styled like the shadcn Input: easiest to use on a cheap Android phone.
const selectClass =
  "h-13 w-full rounded-input border border-input bg-card px-3.5 text-base font-medium outline-none focus-visible:border-2 focus-visible:border-primary aria-invalid:border-2 aria-invalid:border-destructive";

export function DetailsForm({ defaultFullName = "" }: { defaultFullName?: string }) {
  const [state, action, pending] = useActionState(createProfile, {
    ...INITIAL,
    values: { full_name: defaultFullName },
  });
  const [accountType, setAccountType] = useState(state.values.account_type || "INDIVIDUAL");
  const isOrganization = accountType === "ORGANIZATION";
  const { values, fieldErrors: errors } = state;
  const [dob, setDob] = useState(values.date_of_birth ?? "");
  const today = lagosToday();
  const age = dob ? ageOn(dob, today) : null;
  const tooYoung = !isOrganization && age !== null && age < MIN_AGE;
  const isMinor = !isOrganization && age !== null && age >= MIN_AGE && age < ADULT_AGE;

  useEffect(() => {
    if (state.message) toast.error(state.message);
  }, [state]);

  if (state.blocked) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <Sprout className="size-10 text-primary" aria-hidden />
        <p className="text-lg font-bold">Not yet, but soon</p>
        <p className="text-muted-foreground">{state.blocked}</p>
        <Link href="/" className="d-btn d-btn-outline mt-2">
          Back to PlastiCash
        </Link>
      </div>
    );
  }

  return (
    <form key={state.attempt} action={action} className="flex flex-col gap-5" noValidate>
      <fieldset>
        <legend className="sr-only">Who&apos;s recycling?</legend>
        <div className="grid grid-cols-2 gap-3.5">
          <TypeOption value="INDIVIDUAL" current={accountType} onPick={setAccountType} icon={User} title="Just me">
            Home, waste picker or trader
          </TypeOption>
          <TypeOption value="ORGANIZATION" current={accountType} onPick={setAccountType} icon={School} title="Organization">
            School, office or estate
          </TypeOption>
        </div>
      </fieldset>

      {isOrganization && (
        <>
          <Field id="org_name" label="Organization name" error={errors.org_name}>
            <Input id="org_name" name="org_name" defaultValue={values.org_name} aria-invalid={!!errors.org_name} />
          </Field>
          <Field id="org_type" label="Type of organization" error={errors.org_type}>
            <select
              id="org_type"
              name="org_type"
              defaultValue={values.org_type ?? ""}
              aria-invalid={!!errors.org_type}
              className={selectClass}
            >
              <option value="" disabled>
                Choose one
              </option>
              {ORG_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field id="full_name" label={isOrganization ? "Contact person" : "Full name"} error={errors.full_name}>
        <Input
          id="full_name"
          name="full_name"
          autoComplete="name"
          defaultValue={values.full_name}
          aria-invalid={!!errors.full_name}
        />
      </Field>

      {!isOrganization && (
        <Field
          id="date_of_birth"
          label="Date of birth"
          hint="Under 18? A parent or guardian approves your account first."
          error={errors.date_of_birth}
        >
          <Input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            autoComplete="bday"
            max={today}
            min="1900-01-01"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            aria-invalid={!!errors.date_of_birth || tooYoung}
            aria-describedby={tooYoung ? "too-young" : undefined}
          />
          {tooYoung && (
            <p id="too-young" className="rounded-xl border border-warn-line bg-card p-3 text-sm font-medium text-warn" role="alert">
              PlastiCash is for ages 13 and up. Ask a parent to sign up and recycle with you.
            </p>
          )}
        </Field>
      )}

      {isMinor && (
        <fieldset className="flex flex-col gap-4 rounded-2xl border border-border p-4">
          <legend className="px-1 text-sm font-bold">Your parent or guardian</legend>
          <p className="-mt-1 text-sm text-muted-foreground">
            You&apos;re under 18, so we&apos;ll ask them to approve your account. Until they do, you can look around and see
            prices, but you can&apos;t request a pickup or withdraw.
          </p>
          <Field id="guardian_name" label="Their full name" error={errors.guardian_name}>
            <Input id="guardian_name" name="guardian_name" defaultValue={values.guardian_name} aria-invalid={!!errors.guardian_name} />
          </Field>
          <Field id="guardian_phone" label="Their phone number" error={errors.guardian_phone}>
            <PhoneInput id="guardian_phone" name="guardian_phone" defaultValue={values.guardian_phone} error={errors.guardian_phone} />
          </Field>
          <Field id="guardian_email" label="Their email" hint="We email them a link to approve." error={errors.guardian_email}>
            <Input
              id="guardian_email"
              name="guardian_email"
              type="email"
              defaultValue={values.guardian_email}
              aria-invalid={!!errors.guardian_email}
            />
          </Field>
          <Tick name="guardian_aware" defaultChecked={values.guardian_aware === "on"} error={errors.guardian_aware}>
            I confirm my parent or guardian knows I&apos;m signing up
          </Tick>
        </fieldset>
      )}

      <Field
        id="phone"
        label="Phone number"
        hint="We text your pickup code to this number. You can add your bank later, before your first withdrawal."
        error={errors.phone}
      >
        <PhoneInput id="phone" name="phone" defaultValue={values.phone} error={errors.phone} />
      </Field>

      <Field id="address" label="Street address" error={errors.address}>
        <Input
          id="address"
          name="address"
          autoComplete="street-address"
          placeholder="e.g. 7 Ezillo Street"
          defaultValue={values.address}
          aria-invalid={!!errors.address}
        />
      </Field>

      <Field id="area" label="Area" error={errors.area}>
        <select
          id="area"
          name="area"
          defaultValue={values.area ?? ""}
          aria-invalid={!!errors.area}
          className={selectClass}
        >
          <option value="" disabled>
            Choose your area
          </option>
          {AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </Field>

      {isOrganization && (
        <Field id="cac_number" label="CAC number (optional)" error={errors.cac_number}>
          <Input id="cac_number" name="cac_number" defaultValue={values.cac_number} />
        </Field>
      )}

      {isOrganization && (
        <Tick name="adult_confirmed" defaultChecked={values.adult_confirmed === "on"} error={errors.adult_confirmed}>
          I&apos;m the contact person and I&apos;m 18 or older
        </Tick>
      )}

      <Tick name="marketing_opt_in" defaultChecked={values.marketing_opt_in === "on"}>
        Send me tips, price updates and offers by email
        <span className="block text-xs font-normal text-muted-foreground">Optional. You can stop them any time.</span>
      </Tick>

      <p className="text-sm text-muted-foreground">
        By creating an account you agree to how we use your details in our{" "}
        <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">
          privacy notice
        </Link>
        .
      </p>

      <button type="submit" className="d-btn d-btn-primary d-btn-block" disabled={pending || tooYoung}>
        {pending ? "Saving…" : "Create my account"}
      </button>
    </form>
  );
}

function Tick({
  name,
  defaultChecked,
  error,
  children,
}: {
  name: string;
  defaultChecked?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm font-medium">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          aria-invalid={!!error}
          className="d-checkbox d-checkbox-primary mt-0.5"
        />
        <span>{children}</span>
      </label>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TypeOption({
  value,
  current,
  onPick,
  icon: Icon,
  title,
  children,
}: {
  value: string;
  current: string;
  onPick: (value: string) => void;
  icon: typeof User;
  title: string;
  children: ReactNode;
}) {
  const checked = value === current;
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-2 rounded-2xl border bg-card p-4 transition-colors",
        "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-leaf",
        checked ? "border-2 border-primary bg-mist p-[15px]" : "border-border hover:border-primary/50",
      )}
    >
      <input
        type="radio"
        name="account_type"
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
        className="sr-only"
      />
      {checked && (
        <span className="absolute top-2.5 right-2.5 grid size-[22px] place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={3.4} aria-hidden />
        </span>
      )}
      <span className={cn("grid size-10 place-items-center rounded-xl", checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <b className="text-base">{title}</b>
      <small className="text-[13px] text-muted-foreground">{children}</small>
    </label>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
