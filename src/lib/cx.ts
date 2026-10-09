/** Joins class names, skipping falsy ones. Plain module: usable from server and client components. */
export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
