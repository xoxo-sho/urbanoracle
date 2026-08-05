import { describe, expect, it } from "vitest";
import { MIN_LENGTH, checkPassword, isPasswordAcceptable } from "@/lib/password";

const idOf = (password: string, id: string) =>
  checkPassword(password).find((c) => c.id === id)!;

describe("Password strength — three independent checks", () => {
  it("reports exactly three checks", () => {
    expect(checkPassword("").map((c) => c.id)).toEqual(["length", "letter", "digit"]);
  });

  describe("length", () => {
    it("fails below the minimum", () => {
      expect(idOf("a1".padEnd(MIN_LENGTH - 1, "b"), "length").passed).toBe(false);
    });
    it("passes at exactly the minimum", () => {
      expect(idOf("a".repeat(MIN_LENGTH), "length").passed).toBe(true);
    });
  });

  describe("letter", () => {
    it("fails with digits and symbols only", () => {
      expect(idOf("12345678!@", "letter").passed).toBe(false);
    });
    it("passes on a lowercase letter", () => {
      expect(idOf("1234567a", "letter").passed).toBe(true);
    });
    it("passes on an uppercase letter", () => {
      expect(idOf("1234567A", "letter").passed).toBe(true);
    });
    it("does not count a Japanese character as a letter", () => {
      // The rule means a Latin letter; accepting kana here would let a
      // password through that the copy says is not allowed.
      expect(idOf("パスワード12345", "letter").passed).toBe(false);
    });
  });

  describe("digit", () => {
    it("fails with letters only", () => {
      expect(idOf("abcdefgh", "digit").passed).toBe(false);
    });
    it("passes with one digit", () => {
      expect(idOf("abcdefg1", "digit").passed).toBe(true);
    });
    it("does not count a fullwidth digit", () => {
      expect(idOf("abcdefg１", "digit").passed).toBe(false);
    });
  });

  describe("overall acceptance", () => {
    it.each([
      ["", false],
      ["short1", false],
      ["abcdefgh", false],
      ["12345678", false],
      ["abcdefg1", true],
      ["Passw0rd", true],
      ["ぱすわーどabc1", true],
    ])("%s -> %s", (password, expected) => {
      expect(isPasswordAcceptable(password)).toBe(expected);
    });
  });
});
