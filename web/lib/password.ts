import { z } from "zod";

export const MIN_PASSWORD = 8;

// One rule for every "new password" form. The confirm value only exists in the browser: it is checked here and never
// sent anywhere.
export const passwordField = z
  .string()
  .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`)
  .regex(/[A-Za-z]/, "Add at least one letter.")
  .regex(/[0-9]/, "Add at least one number.");

export const passwordFields = {
  password: passwordField,
  confirm: z.string().min(1, "Type your password again."),
};

export function passwordsMatch(v: { password: string; confirm: string }) {
  return v.password === v.confirm;
}

export const mismatch = { path: ["confirm"], message: "The two passwords don't match." };

export const newPasswordSchema = z.object(passwordFields).refine(passwordsMatch, mismatch);
