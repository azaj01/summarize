// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }));
vi.mock("../apps/chrome-extension/src/lib/settings.js", () => ({ loadSettings }));
import automationContentScript from "../apps/chrome-extension/src/entrypoints/automation.content.js";

type Request = { type: string; action?: string };
let onMessage: (request: Request, sender: unknown, respond: () => void) => unknown;
const overlay = () => document.querySelector("#__summarize_repl_overlay__");
const send = (action: string) => {
  const response = vi.fn();
  onMessage({ type: "automation:repl-overlay", action }, {}, response);
  return response;
};

describe("automation interface locale", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__summarize_automation_installed__;
    document.body.innerHTML = "";
    loadSettings.mockReset().mockResolvedValue({ uiLocale: "en" });
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: {
          addListener: (listener: typeof onMessage) => {
            onMessage = listener;
          },
        },
        sendMessage: vi.fn(),
      },
    });
    (automationContentScript as unknown as { main: () => void }).main();
  });

  afterEach(() => {
    send("hide");
    delete (globalThis as Record<string, unknown>).__summarize_automation_installed__;
    vi.unstubAllGlobals();
  });

  it("reads the current preference each time an existing tab opens an overlay", async () => {
    for (const [uiLocale, label] of [
      ["en", "Abort (Esc)"],
      ["tr", "Durdur (Esc)"],
      ["en", "Abort (Esc)"],
    ]) {
      loadSettings.mockResolvedValue({ uiLocale });
      const response = send("show");
      await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true }));
      expect(overlay()?.textContent).toContain(label);
      send("hide");
    }
  });

  it("waits for the saved English preference before showing the first overlay", async () => {
    let resolveSettings!: (settings: { uiLocale: string }) => void;
    loadSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    const response = send("show");
    expect(overlay()).toBeNull();
    resolveSettings({ uiLocale: "en" });
    await vi.waitFor(() => expect(response).toHaveBeenCalled());
    expect(overlay()?.textContent).toContain("Abort (Esc)");
  });

  it("does not reopen an overlay hidden while settings were loading", async () => {
    let resolveSettings!: (settings: { uiLocale: string }) => void;
    loadSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    const response = send("show");
    send("hide");
    resolveSettings({ uiLocale: "tr" });
    await vi.waitFor(() => expect(response).toHaveBeenCalled());
    expect(overlay()).toBeNull();
  });

  it("uses the current locale for element pickers too", async () => {
    loadSettings.mockResolvedValue({ uiLocale: "tr" });
    const response = vi.fn();
    onMessage({ type: "automation:pick-element" }, {}, response);
    await vi.waitFor(() =>
      expect(document.querySelector("#__summarize_element_picker__")).not.toBeNull(),
    );
    const cancel = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Esc"),
    );
    expect(cancel?.textContent).toBe("İptal (Esc)");
    cancel?.click();
    await vi.waitFor(() => expect(response).toHaveBeenCalled());
  });
});
