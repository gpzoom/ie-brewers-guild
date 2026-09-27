import { describe, expect, it } from "vitest";
import {
  driveFileId,
  imageExtension,
  imageFetchUrl,
  imageStoragePath,
  withEventImageUrls,
} from "./event-images";

const ID = "1ybGtIGM10pl8F9raqBt22ZkWvYvJD7Qg";

describe("event images", () => {
  it("finds the file id in Google Drive links", () => {
    expect(driveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(driveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(driveFileId(`https://drive.google.com/uc?export=view&id=${ID}`)).toBe(ID);
    expect(driveFileId(`https://evil.example/open?id=${ID}`)).toBeNull();
    expect(driveFileId("not a url")).toBeNull();
  });

  it("fetches a Drive file through its thumbnail, anything else as given, http(s) only", () => {
    expect(imageFetchUrl(`https://drive.google.com/open?id=${ID}`)).toBe(
      `https://drive.google.com/thumbnail?id=${ID}&sz=w600`,
    );
    expect(imageFetchUrl("https://cdn.example/truck.jpg")).toBe("https://cdn.example/truck.jpg");
    expect(imageFetchUrl("javascript:alert(1)")).toBeNull();
    expect(imageFetchUrl("file:///etc/passwd")).toBeNull();
  });

  it("keeps only real image types", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/png; charset=binary")).toBe("png");
    expect(imageExtension("text/html; charset=utf-8")).toBeNull();
    expect(imageExtension("image/svg+xml")).toBeNull();
    expect(imageExtension(null)).toBeNull();
  });

  it("stores a picture in the member's folder, named by its link", async () => {
    const a = await imageStoragePath("m1", "https://x.example/a.jpg", "jpg");
    const b = await imageStoragePath("m1", "https://x.example/b.jpg", "jpg");
    expect(a).toMatch(/^m1\/[0-9a-f]{32}\.jpg$/);
    expect(a).not.toBe(b);
    expect(await imageStoragePath("m1", "https://x.example/a.jpg", "jpg")).toBe(a);
  });

  it("fills in the public address only for rows with a stored picture", () => {
    const rows = withEventImageUrls(
      [
        { id: "a", image_path: "m1/x.jpg" },
        { id: "b", image_path: null },
      ],
      (path) => `https://cdn.test/${path}`,
    );
    expect(rows.map((row) => (row as { image_url?: string | null }).image_url ?? null)).toEqual([
      "https://cdn.test/m1/x.jpg",
      null,
    ]);
  });
});
