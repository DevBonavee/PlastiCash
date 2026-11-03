"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { GoogleButton, OrDivider, PasswordInput } from "@/components/auth/auth-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD, mismatch, passwordFields, passwordsMatch } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

const schema = z
  .object({ email: z.email("Enter a valid email address."), ...passwordFields })
  .refine(passwordsMatch, mismatch);

type Values = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    trigger,
    getFieldState,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { email: "", password: "", confirm: "" },
  });

  async function onSubmit({ email, password }: Values) {
    // Only the password goes to Supabase; the confirm value stays in this form.
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/app` },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off in Supabase: logged in straight away.
      toast.success("Account created.");
      router.replace("/app");
      router.refresh();
      return;
    }
    toast.success("Check your email to confirm your account.");
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <p className="font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this
          phone to finish signing up.
        </p>
      </div>
    );
  }

  const password = register("password", {
    // Re-check the confirm box when the first password changes, once the user has typed in it.
    onChange: () => {
      if (getFieldState("confirm").isDirty) void trigger("confirm");
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby="password-hint password-error"
          {...password}
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          At least {MIN_PASSWORD} characters, with a letter and a number.
        </p>
        <FieldError id="password-error" message={errors.password?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          aria-describedby="confirm-error"
          {...register("confirm")}
        />
        <FieldError id="confirm-error" message={errors.confirm?.message} />
      </div>
      <button type="submit" className="d-btn d-btn-primary d-btn-block mt-1" disabled={!isValid || isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </button>
      <OrDivider />
      <GoogleButton />
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="min-h-5 text-sm text-bad" aria-live="polite">
      {message}
    </p>
  );
}
