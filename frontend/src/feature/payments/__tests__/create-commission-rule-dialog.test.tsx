import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateCommissionRuleDialog from "../components/create-commission-rule-dialog";

const mockMutate = vi.fn();
const mockReset = vi.fn();

vi.mock("../hooks/use-commission-rules", () => ({
  useCreateCommissionRule: () => ({
    isPending: false,
    error: null,
    reset: mockReset,
    mutate: mockMutate,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CreateCommissionRuleDialog (P2 single submit)", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockReset.mockReset();
  });

  it("submits exactly once on button click and blocks rapid second click before re-render", () => {
    const onCreated = vi.fn();
    render(<CreateCommissionRuleDialog disabled={false} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /Thêm quy tắc/i }));

    fireEvent.change(screen.getByLabelText(/Tỷ lệ hoa hồng/i), {
      target: { value: "10,5" },
    });
    fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/i), {
      target: { value: "2099-12-31T10:00" },
    });

    const submitButton = screen.getByRole("button", { name: /Tạo quy tắc/i });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({
      ratePercent: "10.5",
    });
  });
});

