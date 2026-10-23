declare module "@jargon/renderer-preview" {
  import type { JSX } from "@solidjs/web";

  export interface JargonPlaygroundProps {
    variant?: "default" | "landing";
  }

  export function JargonPlayground(props: JargonPlaygroundProps): JSX.Element;
}
