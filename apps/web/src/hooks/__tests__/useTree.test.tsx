import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TreeProvider, useTree } from "../useTree";

function Probe() {
  const { trees, activeTreeId, createDocument, deleteDocument, isLoading } = useTree();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="count">{trees.length}</span>
      <span data-testid="active">{activeTreeId ?? "none"}</span>
      <button onClick={() => createDocument("body", "Doc")}>create</button>
      <button onClick={() => deleteDocument(trees[0].id)}>delete-first</button>
    </div>
  );
}

describe("useTree forest context", () => {
  it("creates, activates and deletes documents", async () => {
    render(
      <TreeProvider>
        <Probe />
      </TreeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("count").textContent).toBe("0");

    fireEvent.click(screen.getByText("create"));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("active").textContent).not.toBe("none");

    fireEvent.click(screen.getByText("delete-first"));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(screen.getByTestId("active").textContent).toBe("none");
  });
});
