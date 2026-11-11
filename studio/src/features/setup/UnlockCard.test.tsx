import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UnlockOffer } from "@/lib/api";
import { UnlockCard } from "./UnlockCard";

const offer: UnlockOffer = {
  env_var: "FAL_KEY",
  providers: ["fal"],
  capabilities: [],
  new_capabilities: [
    "3d_asset_generation",
    "video_generation",
    "music_generation",
    "image_generation",
  ],
  tools: [],
  unlocks_video_types: ["animated-explainer"],
  improves_video_types: ["animation", "cinematic", "hybrid", "talking-head", "screen-demo"],
  install_instructions: "",
  signup_url: null,
};

describe("UnlockCard", () => {
  it("leads with the most meaningful capabilities and condenses long lists", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UnlockCard offer={offer} status={undefined} onSaved={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(
      "Add AI images & AI video clips + 2 more",
    );
    expect(screen.getAllByText(/^Better:/)).toHaveLength(3);
    expect(screen.getByText("+2 more improved")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Get a key/ })).not.toBeInTheDocument();
  });
});
