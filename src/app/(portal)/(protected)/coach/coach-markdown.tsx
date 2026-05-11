"use client";

import { memo } from "react";
import { Streamdown } from "streamdown";

export const CoachMarkdown = memo(
  ({ content }: { content: string }) => (
    <Streamdown
      className="w-full max-w-full prose-compact [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
    >
      {content}
    </Streamdown>
  ),
  (prev, next) => prev.content === next.content
);

CoachMarkdown.displayName = "CoachMarkdown";
