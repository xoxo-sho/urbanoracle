/**
 * Password strength — three independent checks (design-spec-v1 §6).
 *
 * Deliberately not a regex. Each rule is its own predicate so the UI can tell
 * the user exactly which one is unmet, and so a rule can be changed without
 * anyone having to decode a character class. A single opaque pattern fails all
 * three of those at once.
 */

export interface PasswordCheck {
  id: "length" | "letter" | "digit";
  label: string;
  passed: boolean;
}

export const MIN_LENGTH = 8;

export function checkPassword(password: string): PasswordCheck[] {
  const chars = [...password];
  return [
    {
      id: "length",
      label: `${MIN_LENGTH}文字以上`,
      passed: chars.length >= MIN_LENGTH,
    },
    {
      id: "letter",
      label: "英字を1文字以上",
      // Codepoint ranges rather than a character class: explicit, and it will
      // not silently accept a non-Latin letter the backend may not expect.
      passed: chars.some((c) => {
        const lower = c.toLowerCase();
        return lower >= "a" && lower <= "z";
      }),
    },
    {
      id: "digit",
      label: "数字を1文字以上",
      passed: chars.some((c) => c >= "0" && c <= "9"),
    },
  ];
}

export function isPasswordAcceptable(password: string): boolean {
  return checkPassword(password).every((c) => c.passed);
}
