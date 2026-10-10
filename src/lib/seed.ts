import type { SubjectKind } from "./types";

export const DEFAULT_SUBJECTS: { name: string; kind: SubjectKind; colour: string }[] = [
  { name: "Me", kind: "person", colour: "indigo" },
  { name: "Arpita", kind: "person", colour: "magenta" },
  { name: "Joey", kind: "pet", colour: "amber" },
  { name: "House", kind: "home", colour: "green" },
  { name: "Honda HR-V", kind: "vehicle", colour: "slate" },
  { name: "Parents", kind: "person", colour: "violet" },
  { name: "In-laws", kind: "person", colour: "violet" },
  { name: "Sister", kind: "person", colour: "violet" },
];

export const DEFAULT_AREAS = ["Health", "Insurance", "Finance and bills", "Home", "Job search", "Admin"];

export const COLOURS = ["indigo", "magenta", "amber", "green", "slate", "violet", "teal", "red"] as const;

export const KIND_LABELS: Record<SubjectKind, string> = {
  person: "Person",
  pet: "Pet",
  home: "Home",
  vehicle: "Vehicle",
  place: "Place",
  other: "Other",
};
