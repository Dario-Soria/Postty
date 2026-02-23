import V3Page from "./v3/page";

export default function HomePage() {
  // Keep V3 as the canonical app experience while preserving root URL.
  return <V3Page />;
}
