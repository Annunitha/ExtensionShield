import React, { useEffect, useLayoutEffect, useState, useRef } from "react";

const TOKENS = [
  { token: "bg-card", varName: "--color-card", property: "backgroundColor", tailwindClass: "bg-card" },
  { token: "text-card-foreground", varName: "--color-card-foreground", property: "color", tailwindClass: "text-card-foreground" },
  { token: "bg-popover", varName: "--color-popover", property: "backgroundColor", tailwindClass: "bg-popover" },
  { token: "text-popover-foreground", varName: "--color-popover-foreground", property: "color", tailwindClass: "text-popover-foreground" },
  { token: "bg-background", varName: "--color-background", property: "backgroundColor", tailwindClass: "bg-background" },
  { token: "text-foreground", varName: "--color-foreground", property: "color", tailwindClass: "text-foreground" },
];

function getRawVarValue(varName) {
  try {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue(varName).trim();
    return value || "(empty)";
  } catch (e) {
    return `(error: ${e.message})`;
  }
}

function getComputedColor(el, property) {
  if (!el) return "(no element)";
  try {
    const value = getComputedStyle(el).getPropertyValue(property === "backgroundColor" ? "background-color" : "color").trim();
    return value || "(empty)";
  } catch (e) {
    return `(error: ${e.message})`;
  }
}

function isValidComputed(value) {
  if (!value || value.startsWith("(")) return false;
  return /^(rgb|rgba|hsl|hsla|#[0-9a-fA-F]{3,8})$/.test(value) || value.startsWith("rgb") || value.startsWith("hsl");
}

export default function ThemeDebugPage() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains("light"));
  const [results, setResults] = useState([]);
  const refs = useRef({});

  useEffect(() => {
    const root = document.documentElement;
    if (isLight) root.classList.add("light");
    else root.classList.remove("light");
  }, [isLight]);

  const runRead = () => {
    const next = TOKENS.map(({ token, varName, property, tailwindClass }) => {
      const raw = getRawVarValue(varName);
      const el = refs.current[token];
      const computed = getComputedColor(el, property);
      const valid = isValidComputed(computed);
      const possibleCircular = raw && !raw.startsWith("(") && (computed.startsWith("(") || computed === "rgba(0, 0, 0, 0)");
      return {
        token,
        tailwindClass,
        varName,
        raw,
        computed,
        valid,
        possibleCircular: !!possibleCircular,
      };
    });
    setResults(next);
  };

  useLayoutEffect(() => {
    const id = setTimeout(runRead, 50);
    return () => clearTimeout(id);
  }, [isLight]);

  return (
    <div className="min-h-screen bg-background text-foreground p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Theme token debug (dev only)</h1>
        <p className="text-sm text-foreground-muted">
          Confirms no circular var references and valid computed values for card/popover/background/foreground.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium">Mode:</span>
          <button
            type="button"
            onClick={() => setIsLight((l) => !l)}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover transition"
          >
            {isLight ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            onClick={runRead}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover transition"
          >
            Re-read
          </button>
          <span className="text-sm text-foreground-muted">
            (toggles <code className="bg-surface-elevated px-1 rounded">html.light</code>)
          </span>
        </div>

        {/* Hidden probes - one element per Tailwind class so we can read computed style */}
        <div className="sr-only absolute opacity-0 pointer-events-none" aria-hidden="true">
          {TOKENS.map(({ token, tailwindClass }) => (
            <div key={token} ref={(el) => (refs.current[token] = el)} className={tailwindClass}>
              probe
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="p-3 font-semibold">Token / Class</th>
                <th className="p-3 font-semibold">Raw CSS var (getComputedStyle :root)</th>
                <th className="p-3 font-semibold">Computed on element (Tailwind class)</th>
                <th className="p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.token} className="border-b border-border hover:bg-surface/50">
                  <td className="p-3">
                    <code className="text-primary">{r.tailwindClass}</code>
                  </td>
                  <td className="p-3 font-mono text-xs break-all">{r.raw}</td>
                  <td className="p-3 font-mono text-xs break-all">{r.computed}</td>
                  <td className="p-3">
                    {r.possibleCircular && (
                      <span className="text-destructive font-medium">Possible circular</span>
                    )}
                    {!r.possibleCircular && !r.valid && r.computed !== "(no element)" && (
                      <span className="text-destructive">Invalid</span>
                    )}
                    {!r.possibleCircular && r.valid && <span style={{ color: "var(--risk-good)" }}>OK</span>}
                    {r.computed === "(no element)" && <span className="text-foreground-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-foreground-muted">
          Raw value is from <code>getComputedStyle(document.documentElement).getPropertyValue(varName)</code>.
          Computed is from an element with the Tailwind class (e.g. <code>bg-card</code>). Re-run by toggling mode.
        </p>
      </div>
    </div>
  );
}
