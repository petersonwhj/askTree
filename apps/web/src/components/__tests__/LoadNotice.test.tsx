import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadNotice } from "../LoadNotice";

describe("LoadNotice", () => {
  it("shows the message and dismisses", () => {
    const onClose = vi.fn();
    render(<LoadNotice message="This file is not a valid PDF." onClose={onClose} />);
    expect(screen.getByText("This file is not a valid PDF.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ok/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
