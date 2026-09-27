import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TreeProvider, useTree } from "../useTree";

// Each test gets a pristine database so documents do not leak between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function Probe() {
  const { trees, activeTreeId, createDocument, deleteDocument, isLoading, loadNotice, setLoadNotice } = useTree();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="count">{trees.length}</span>
      <span data-testid="active">{activeTreeId ?? "none"}</span>
      <span data-testid="kind">{trees[0]?.kind ?? "none"}</span>
      <span data-testid="notice">{loadNotice ?? "none"}</span>
      <button onClick={() => setLoadNotice("boom")}>notice</button>
      <button onClick={() => createDocument("body", "Doc")}>create</button>
      <button onClick={() => createDocument("body", "Docx", "docx")}>create-docx</button>
      <button onClick={() => createDocument("", "Paper", "pdf", new Blob([new Uint8Array([4, 4])]))}>create-pdf</button>
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

  it("records the document kind", async () => {
    render(
      <TreeProvider>
        <Probe />
      </TreeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("create-docx"));
    await waitFor(() => expect(screen.getByTestId("kind").textContent).toBe("docx"));
  });

  it("stores a pdf asset with the document", async () => {
    render(
      <TreeProvider>
        <Probe />
      </TreeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("create-pdf"));
    await waitFor(() => expect(screen.getByTestId("kind").textContent).toBe("pdf"));
  });

  it("exposes a load notice", async () => {
    render(
      <TreeProvider>
        <Probe />
      </TreeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("notice"));
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toBe("boom"));
  });
});
