import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { __testing as uploadQueue } from "@/features/uploads/uploadStore";
import { resetLocale } from "@/i18n";
import { resetSession } from "@/lib/api";
import { FakeEventSource } from "./fakes";

// jsdom has <dialog> but not its modal API.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetLocale(); // back to the browser default (jsdom: en-US)
  resetSession(); // the session promise is module-level; isolate tests
  uploadQueue.reset(); // so is the upload queue
  vi.unstubAllGlobals();
});
