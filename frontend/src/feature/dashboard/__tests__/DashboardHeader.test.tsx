import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardHeader,
  makeDateFilter,
  vietnamDate,
} from "../components/DashboardHeader";

describe("DashboardHeader & Vietnam timezone helpers (HG-75 P2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes presets in Asia/Ho_Chi_Minh regardless of UTC boundary", () => {
    // 2026-11-25T18:30:00Z = 2026-11-26 01:30:00 UTC+7
    const utcEveningVnMidnight = new Date("2026-11-25T18:30:00.000Z");

    expect(vietnamDate(utcEveningVnMidnight)).toBe("2026-11-26");
    expect(makeDateFilter("today", utcEveningVnMidnight)).toEqual({
      range: "today",
      from: "2026-11-26",
      to: "2026-11-26",
    });
    expect(makeDateFilter("7days", utcEveningVnMidnight)).toEqual({
      range: "7days",
      from: "2026-11-20",
      to: "2026-11-26",
    });
    expect(makeDateFilter("30days", utcEveningVnMidnight)).toEqual({
      range: "30days",
      from: "2026-10-28",
      to: "2026-11-26",
    });
  });

  it("validates custom range (1 day allowed, 365 allowed, 366 and future VN date rejected)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T18:30:00.000Z")); // 2026-11-26 VN

    const onFilterChange = vi.fn();
    render(
      <DashboardHeader
        filter={makeDateFilter("30days")}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));

    const fromInput = screen.getByLabelText("Từ ngày");
    const toInput = screen.getByLabelText("Đến ngày");
    expect(toInput).toHaveAttribute("max", "2026-11-26");

    // 366 ngày (2025-11-26 -> 2026-11-26) -> từ chối
    fireEvent.change(fromInput, { target: { value: "2025-11-26" } });
    fireEvent.change(toInput, { target: { value: "2026-11-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /tối đa 365 ngày/i,
    );
    expect(onFilterChange).not.toHaveBeenCalled();

    // Tương lai theo giờ VN (2026-11-27) -> từ chối
    fireEvent.change(fromInput, { target: { value: "2026-11-26" } });
    fireEvent.change(toInput, { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /không được ở tương lai/i,
    );

    // 1 ngày hợp lệ (2026-11-26 -> 2026-11-26)
    fireEvent.change(fromInput, { target: { value: "2026-11-26" } });
    fireEvent.change(toInput, { target: { value: "2026-11-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(onFilterChange).toHaveBeenCalledWith({
      range: "custom",
      from: "2026-11-26",
      to: "2026-11-26",
    });

    // 365 ngày hợp lệ (2025-11-27 -> 2026-11-26)
    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
    fireEvent.change(screen.getByLabelText("Từ ngày"), {
      target: { value: "2025-11-27" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày"), {
      target: { value: "2026-11-26" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(onFilterChange).toHaveBeenCalledWith({
      range: "custom",
      from: "2025-11-27",
      to: "2026-11-26",
    });
  });
});

