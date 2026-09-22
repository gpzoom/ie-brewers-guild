import { describe, expect, it } from "vitest";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL, visibleFieldsForMemberType } from "./type-fields";

describe("visibleFieldsForMemberType", () => {
  it("a producer only shows street_address", () => {
    expect(visibleFieldsForMemberType("producer")).toEqual(["street_address"]);
  });

  it("a mobile member only shows service_area", () => {
    expect(visibleFieldsForMemberType("mobile")).toEqual(["service_area"]);
  });

  it("an allied member shows the full set, including discount", () => {
    expect(visibleFieldsForMemberType("allied")).toEqual([
      "street_address",
      "service_area",
      "lead_time",
      "contact_email",
      "discount",
    ]);
  });
});

describe("isFieldVisibleForMemberType", () => {
  it("service_area is not visible for a producer", () => {
    expect(isFieldVisibleForMemberType("producer", "service_area")).toBe(false);
  });

  it("discount is only visible for allied", () => {
    expect(isFieldVisibleForMemberType("producer", "discount")).toBe(false);
    expect(isFieldVisibleForMemberType("mobile", "discount")).toBe(false);
    expect(isFieldVisibleForMemberType("allied", "discount")).toBe(true);
  });
});

describe("LOCATION_FIELD_LABEL", () => {
  it("labels each type's location field per the spec's comparison table", () => {
    expect(LOCATION_FIELD_LABEL.producer).toBe("Street address");
    expect(LOCATION_FIELD_LABEL.mobile).toBe("Service area");
    expect(LOCATION_FIELD_LABEL.allied).toBe("Warehouse address");
  });
});
