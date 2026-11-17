import { describe, expect, it } from "vitest";
import { batchCsv } from "./batch-csv";

describe("batchCsv", () => {
  it("gives the printer the code, the printed form and the link for each card", () => {
    expect(batchCsv("https://iscbrewersguild.org", ["ABCDEFGH", "23456789"])).toBe(
      "code,printed_code,url\n" +
        "ABCDEFGH,ABCD-EFGH,https://iscbrewersguild.org/p/ABCDEFGH\n" +
        "23456789,2345-6789,https://iscbrewersguild.org/p/23456789\n",
    );
  });
});
