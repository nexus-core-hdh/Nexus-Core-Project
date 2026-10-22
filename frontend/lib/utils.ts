import { Metadata } from "next";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type DateTimeInput = Date | string | number | null | undefined;

/** Format date/time as `MM-dd-yyyy, hh:mm a` (e.g. `04-14-2026, 05:42 PM`). */
export function formatDateTime(value: DateTimeInput): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const mm = get("month");
  const dd = get("day");
  const yyyy = get("year");
  const hh = get("hour");
  const min = get("minute");
  const dayPeriod = get("dayPeriod");

  return `${mm}-${dd}-${yyyy}, ${hh}:${min} ${dayPeriod}`.trim();
}

export function generateAvatarFallback(string: string) {
  const names = string.split(" ").filter((name: string) => name);
  const mapped = names.map((name: string) => name.charAt(0).toUpperCase());

  return mapped.join("");
}

export function generateMeta({
  title,
  description,
  canonical
}: {
  title: string;
  description: string;
  canonical: string;
}): Metadata {
  return {
    title: `${title} - Nexus Core`,
    description: description,
    metadataBase: new URL(`https://nexuscore.io`),
    alternates: {
      canonical
    },
    openGraph: {
      images: [`/images/seo.jpg`]
    }
  };
}

// a function to get the first letter of the first and last name of names
export const getInitials = (fullName: string) => {
  const nameParts = fullName.split(" ");
  const firstNameInitial = nameParts[0].charAt(0).toUpperCase();
  const lastNameInitial = nameParts[1].charAt(0).toUpperCase();
  return `${firstNameInitial}${lastNameInitial}`;
};
