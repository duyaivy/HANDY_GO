import { describe, expect, it } from "vitest";
import { EntityError, HttpError } from "@/shared/api/http";
import { classifyCreateRefundError, REFUND_STATUSES } from "../refund-utils";

describe("classifyCreateRefundError", () => {
  it("treats backend 409 business rejections as definitive_rejection", () => {
    const exceedError = new HttpError({
      status: 409,
      payload: {
        code: "CONFLICT",
        message: "Refund reservations exceed the paid amount",
      },
    });
    const statusError = new HttpError({
      status: 409,
      payload: {
        code: "CONFLICT",
        message: "Only settled payments can be refunded",
      },
    });

    expect(classifyCreateRefundError(exceedError, { isRetry: false })).toMatchObject({
      kind: "definitive_rejection",
      reason: "exceeds_capacity",
    });
    expect(classifyCreateRefundError(exceedError, { isRetry: true })).toMatchObject({
      kind: "definitive_rejection",
      reason: "exceeds_capacity",
    });
    expect(classifyCreateRefundError(statusError, { isRetry: true })).toMatchObject({
      kind: "definitive_rejection",
      reason: "payment_not_eligible",
    });
  });

  it("treats 409 idempotency key conflict or unverified 409 as idempotency_conflict", () => {
    const keyConflict = new HttpError({
      status: 409,
      payload: {
        code: "CONFLICT",
        message: "Idempotency key was used for another request",
      },
    });
    const genericConflict = new HttpError({
      status: 409,
      payload: { message: "Conflict" },
    });

    expect(classifyCreateRefundError(keyConflict, { isRetry: false }).kind).toBe(
      "idempotency_conflict",
    );
    expect(classifyCreateRefundError(genericConflict, { isRetry: true }).kind).toBe(
      "idempotency_conflict",
    );
  });

  it("releases validation errors only on initial submit, never on retry", () => {
    const validationError = new EntityError({
      status: 422,
      payload: {
        code: "VALIDATION_ERROR",
        message: "Invalid whole VND amount",
      },
    });

    expect(
      classifyCreateRefundError(validationError, { isRetry: false }),
    ).toMatchObject({
      kind: "definitive_rejection",
      reason: "validation",
    });
    expect(
      classifyCreateRefundError(validationError, { isRetry: true }).kind,
    ).toBe("ambiguous_outcome");
  });

  it("never auto-releases on 403, 404, 502, non-JSON, or network errors", () => {
    const cases = [
      new HttpError({ status: 403, payload: { code: "FORBIDDEN", message: "Forbidden" } }),
      new HttpError({ status: 404, payload: { code: "NOT_FOUND", message: "Not found" } }),
      new HttpError({ status: 502, payload: { message: "Bad gateway" } }),
      new HttpError({
        status: 201,
        payload: { message: "Backend trả về dữ liệu không phải JSON" },
      }),
      new Error("Failed to fetch"),
    ];

    for (const err of cases) {
      expect(classifyCreateRefundError(err, { isRetry: false }).kind).toBe(
        "ambiguous_outcome",
      );
      expect(classifyCreateRefundError(err, { isRetry: true }).kind).toBe(
        "ambiguous_outcome",
      );
    }
  });
});

describe("REFUND_STATUSES", () => {
  it("distinguishes needs_review from processing", () => {
    expect(REFUND_STATUSES.needs_review.label).toBe("Cần xem xét");
    expect(REFUND_STATUSES.processing.label).toBe("Đang xử lý");
    expect(REFUND_STATUSES.needs_review.color).not.toBe(
      REFUND_STATUSES.processing.color,
    );
  });
});

