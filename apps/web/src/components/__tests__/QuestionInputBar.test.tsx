import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuestionInputBar } from "../QuestionInputBar";

const baseProps = {
  onSend: () => {},
  isLoading: false,
  freeAskTarget: "right" as const,
  onFreeAskTargetChange: () => {},
};

describe("QuestionInputBar", () => {
  it("shows the free-ask direction toggle and reports changes", () => {
    const onTargetChange = vi.fn();
    render(
      <QuestionInputBar
        {...baseProps}
        contextText={null}
        onFreeAskTargetChange={onTargetChange}
      />,
    );

    expect(screen.getByText("Free ask")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /◀\s*left/i }));
    expect(onTargetChange).toHaveBeenCalledWith("left");
    fireEvent.click(screen.getByRole("button", { name: /right\s*▶/i }));
    expect(onTargetChange).toHaveBeenCalledWith("right");
  });

  it("hides the free-ask toggle when a selection context is present", () => {
    render(<QuestionInputBar {...baseProps} contextText="selected text" />);
    expect(screen.queryByText("Free ask")).toBeNull();
    expect(screen.queryByRole("button", { name: /◀\s*left/i })).toBeNull();
  });

  it("labels the source panel of a selection context", () => {
    render(<QuestionInputBar {...baseProps} contextText="selected text" contextSide="left" />);
    expect(screen.getByText("Left panel")).toBeTruthy();
  });

  it("reserves an assist button in the input area", () => {
    render(<QuestionInputBar {...baseProps} contextText={null} />);
    expect(screen.getByRole("button", { name: /suggest a question/i })).toBeTruthy();
  });

  it("sends the typed question", () => {
    const onSend = vi.fn();
    render(<QuestionInputBar {...baseProps} contextText={null} onSend={onSend} />);

    fireEvent.change(screen.getByPlaceholderText(/ask anything/i), {
      target: { value: "why?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(onSend).toHaveBeenCalledWith("why?", []);
  });

  it("generates and shows suggested questions on demand", async () => {
    const onRequestSuggestions = vi.fn().mockResolvedValue(["Q1?", "Q2?", "Q3?"]);
    render(
      <QuestionInputBar
        {...baseProps}
        contextText={null}
        onRequestSuggestions={onRequestSuggestions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /suggest a question/i }));

    expect(await screen.findByText("Q1?")).toBeTruthy();
    expect(screen.getByText("Q3?")).toBeTruthy();
    expect(onRequestSuggestions).toHaveBeenCalledTimes(1);
  });

  it("asks a suggested question directly when clicked", async () => {
    const onSend = vi.fn();
    const onRequestSuggestions = vi.fn().mockResolvedValue(["Why does it matter?"]);
    render(
      <QuestionInputBar
        {...baseProps}
        contextText={null}
        onSend={onSend}
        onRequestSuggestions={onRequestSuggestions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /suggest a question/i }));
    fireEvent.click(await screen.findByText("Why does it matter?"));

    expect(onSend).toHaveBeenCalledWith("Why does it matter?", []);
  });

  it("refreshes suggestions for a new batch", async () => {
    const onRequestSuggestions = vi
      .fn()
      .mockResolvedValueOnce(["Old?"])
      .mockResolvedValueOnce(["New?"]);
    render(
      <QuestionInputBar
        {...baseProps}
        contextText={null}
        onRequestSuggestions={onRequestSuggestions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /suggest a question/i }));
    await screen.findByText("Old?");
    fireEvent.click(screen.getByRole("button", { name: /refresh suggestions/i }));

    expect(await screen.findByText("New?")).toBeTruthy();
    expect(onRequestSuggestions).toHaveBeenCalledTimes(2);
  });

  it("offers a debug action for suggested questions", async () => {
    const onDebugSuggestions = vi.fn();
    const onRequestSuggestions = vi.fn().mockResolvedValue(["Q?"]);
    render(
      <QuestionInputBar
        {...baseProps}
        contextText={null}
        onRequestSuggestions={onRequestSuggestions}
        onDebugSuggestions={onDebugSuggestions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /suggest a question/i }));
    fireEvent.click(await screen.findByRole("button", { name: /debug suggested questions/i }));

    expect(onDebugSuggestions).toHaveBeenCalled();
  });

  it("shows an error with a settings action when generation fails", async () => {
    const onOpenSettings = vi.fn();
    const onRequestSuggestions = vi.fn().mockRejectedValue(new Error("LLM not configured"));
    render(
      <QuestionInputBar
        {...baseProps}
        contextText={null}
        onRequestSuggestions={onRequestSuggestions}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /suggest a question/i }));

    expect(await screen.findByText(/LLM not configured/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});

describe("QuestionInputBar images", () => {
  function pngFile(name = "shot.png"): File {
    return new File([Uint8Array.from([1, 2, 3])], name, { type: "image/png" });
  }

  it("attaches a picked image, shows a thumbnail, and sends it", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <QuestionInputBar {...baseProps} contextText={null} onSend={onSend} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });

    await waitFor(() => expect(container.querySelectorAll(".ask-image").length).toBe(1));

    fireEvent.change(screen.getByPlaceholderText(/ask anything/i), {
      target: { value: "what is this?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const [question, images] = onSend.mock.calls[0];
    expect(question).toBe("what is this?");
    expect(images).toHaveLength(1);
    expect(images[0].mediaType).toBe("image/png");
  });

  it("removes an attached image", async () => {
    const { container } = render(
      <QuestionInputBar {...baseProps} contextText={null} onSend={vi.fn()} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });
    await waitFor(() => expect(container.querySelectorAll(".ask-image").length).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: /remove image/i }));
    await waitFor(() => expect(container.querySelectorAll(".ask-image").length).toBe(0));
  });

  it("clears the question, the images and the selection context", async () => {
    const onClearContext = vi.fn();
    const { container } = render(
      <QuestionInputBar {...baseProps} contextText="selected text" onClearContext={onClearContext} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });
    await waitFor(() => expect(container.querySelectorAll(".ask-image").length).toBe(1));

    const textarea = screen.getByPlaceholderText(/about:/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "a question" } });

    fireEvent.click(screen.getByRole("button", { name: /clear context/i }));

    await waitFor(() => expect(container.querySelectorAll(".ask-image").length).toBe(0));
    expect((screen.getByPlaceholderText(/about:/i) as HTMLTextAreaElement).value).toBe("");
    expect(onClearContext).toHaveBeenCalledTimes(1);
  });

  it("opens a full-size preview when a thumbnail is clicked", async () => {
    const { container } = render(
      <QuestionInputBar {...baseProps} contextText={null} onSend={vi.fn()} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });
    await waitFor(() => expect(container.querySelectorAll(".ask-image").length).toBe(1));

    fireEvent.click(container.querySelector(".ask-image img")!);
    await waitFor(() => expect(document.querySelector(".image-lightbox-overlay")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /close preview/i }));
    await waitFor(() => expect(document.querySelector(".image-lightbox-overlay")).toBeNull());
  });
});
