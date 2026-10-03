"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-xl border bg-white px-4 py-3 text-base text-ink placeholder:text-muted/70 " +
  "transition-colors duration-150 focus:outline-none focus:ring-4 focus:ring-teal-soft focus:border-teal-dark " +
  "disabled:bg-soft disabled:text-muted";

type Common = {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
};

function FieldShell({
  id,
  label,
  error,
  hint,
  optional,
  required,
  className,
  children,
}: Common & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[0.95rem] font-semibold text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger animate-fade-in" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return [error && `${id}-error`, hint && !error && `${id}-hint`].filter(Boolean).join(" ") || undefined;
}

export function TextField({ label, error, hint, optional, className, id: givenId, ...rest }: Common & ComponentProps<"input">) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} required={rest.required} className={className}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, error ? "border-danger" : "border-line")}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, optional, className, id: givenId, ...rest }: Common & ComponentProps<"textarea">) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} required={rest.required} className={className}>
      <textarea
        id={id}
        rows={rest.rows ?? 4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, "resize-y", error ? "border-danger" : "border-line")}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  optional,
  className,
  id: givenId,
  children,
  ...rest
}: Common & ComponentProps<"select">) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} required={rest.required} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, "appearance-none bg-[length:1rem] pr-10", error ? "border-danger" : "border-line")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6660' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 1rem center",
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/** Large tappable radio cards. */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; description?: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string;
  columns?: 2 | 3 | 4;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 block text-[0.95rem] font-semibold text-ink">
        {legend}
        <span className="text-danger" aria-hidden="true"> *</span>
      </legend>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-2 sm:grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex min-h-12 cursor-pointer items-center rounded-xl border-2 px-3.5 py-2.5 text-[0.95rem] transition-colors",
                "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-teal-soft",
                checked ? "border-navy bg-navy-soft font-semibold text-navy-dark" : "border-line bg-white hover:border-teal-dark",
                error && !value && "border-danger/60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span>
                {option.label}
                {option.description && <span className="block text-xs font-normal text-muted">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function Checkbox({ label, className, ...rest }: { label: ReactNode; className?: string } & ComponentProps<"input">) {
  return (
    <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem]", className)}>
      <input type="checkbox" className="size-5 rounded accent-navy" {...rest} />
      <span>{label}</span>
    </label>
  );
}
