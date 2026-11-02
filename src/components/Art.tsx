import type { Band } from "../lib/api";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8V5H5a2 2 0 0 1 0-4h13v4M3 3v16a2 2 0 0 0 2 2h15V8H6" />
        <path d="M20 12h-5v5h5m-3-2.5h.01" />
      </>
    ),
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
    trophy: (
      <>
        <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v6m-4 2h8M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4" />
      </>
    ),
    history: (
      <>
        <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6m3-3v6l4 2" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1C12 12 12 12 12 14m0 3h.01" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 3v6c0 5-8 10-8 10s-8-5-8-10V5l8-3Z" />
        <path d="m8 11 3 3 5-6" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
      </>
    ),
    duel: (
      <>
        <path d="m4 3 17 17M3 4l4-1-1 4m14-4L3 20M21 4l-4-1 1 4M2 16l6 6m8-20 6 6M2 8l6-6m8 20 6-6" />
      </>
    ),
    seed: (
      <>
        <path d="M18 3c5 9 0 18-8 18C2 21 1 10 18 3Z" />
        <path d="M6 18 16 6" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] ?? paths.seed}
    </svg>
  );
}
export function Hamster({
  mood = "run",
  className = "",
}: {
  mood?: Band;
  className?: string;
}) {
  const sleeping = mood === "sleep";
  return (
    <svg
      className={className}
      viewBox="0 0 100 90"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="50" cy="82" rx="28" ry="4" fill="#d4bf9c" opacity=".25" />
      <ellipse
        cx="32"
        cy="24"
        rx="12"
        ry="15"
        transform="rotate(-20 32 24)"
        fill="#dc9255"
      />
      <ellipse
        cx="69"
        cy="24"
        rx="12"
        ry="15"
        transform="rotate(20 69 24)"
        fill="#dc9255"
      />
      <ellipse
        cx="32"
        cy="24"
        rx="6"
        ry="9"
        transform="rotate(-20 32 24)"
        fill="#f5b8a1"
      />
      <ellipse
        cx="69"
        cy="24"
        rx="6"
        ry="9"
        transform="rotate(20 69 24)"
        fill="#f5b8a1"
      />
      <path
        d="M17 55C17 31 29 22 50 22s34 12 34 34c0 19-15 25-34 25S17 74 17 55Z"
        fill="#e8a769"
      />
      <path
        d="M28 63c0-15 10-25 22-25s24 11 24 25c0 12-9 18-24 18S28 75 28 63Z"
        fill="#fff0d5"
      />
      <ellipse cx="25" cy="59" rx="11" ry="10" fill="#f3bf84" />
      <ellipse cx="76" cy="59" rx="11" ry="10" fill="#f3bf84" />
      {sleeping ? (
        <g stroke="#54392a" strokeWidth="2.8" strokeLinecap="round">
          <path d="M32 48q5 5 10 0m17 0q5 5 10 0" />
        </g>
      ) : (
        <g fill="#49382c">
          <ellipse cx="36" cy="47" rx="3.4" ry="4" />
          <ellipse cx="65" cy="47" rx="3.4" ry="4" />
          <circle cx="37" cy="46" r="1" fill="white" />
          <circle cx="66" cy="46" r="1" fill="white" />
        </g>
      )}
      <ellipse cx="29" cy="56" rx="5" ry="3" fill="#e7987b" />
      <ellipse cx="73" cy="56" rx="5" ry="3" fill="#e7987b" />
      <path d="M46 56q5-4 10 0l-5 5-5-5Z" fill="#c77c6a" />
      <path
        d="M51 61v3m0 0q-5 5-8 0m8 0q4 5 8 0"
        stroke="#8f6047"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="37" cy="78" rx="9" ry="4" fill="#cf8a55" />
      <ellipse cx="66" cy="78" rx="9" ry="4" fill="#cf8a55" />
      {mood === "sprint" && (
        <g stroke="#d87437" strokeWidth="3" strokeLinecap="round">
          <path d="M3 40h8M0 52h9m-4 12h7M87 18l5-5m-4 14h8" />
        </g>
      )}
      {sleeping && (
        <path
          d="M80 14h9l-9 10h9M88 0h8l-8 9h8"
          stroke="#788c70"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
export function WheelArt({
  sleeping,
  running,
}: {
  sleeping: boolean;
  running: boolean;
}) {
  return (
    <div className="wheel-art" aria-hidden="true">
      <svg viewBox="0 0 360 265" fill="none" className="wheel-scene">
        <ellipse cx="181" cy="246" rx="128" ry="9" fill="#d4ddc8" />
        <path
          d="m142 176-20 68m92-68 21 68"
          stroke="#7e9076"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle
          cx="178"
          cy="122"
          r="105"
          fill="#f4f6eb"
          stroke="#788f70"
          strokeWidth="10"
        />
        <circle cx="178" cy="122" r="94" stroke="#b4c4a6" strokeWidth="2" />
        <g
          className={running ? "wheel-spokes rotating" : "wheel-spokes"}
          stroke="#c7d2bb"
          strokeWidth="3"
        >
          <path d="M178 21v202M77 122h202m-172-71 142 142M107 193 249 51" />
        </g>
        <path
          d="M93 176q86 51 171-1"
          stroke="#a6b79a"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M39 159c7-1 13 1 16 7-8 2-14 0-16-7Zm273 28c-10-2-17 2-18 9 11 1 17-2 18-9Z"
          fill="#b6c7a3"
        />
        <path
          d="M49 177v-14m253 47v-18"
          stroke="#9caf87"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g stroke="#adbb9e" strokeWidth="2" strokeLinecap="round">
          <path d="M315 61v10m-5-5h10M40 91v8m-4-4h8" />
        </g>
        <circle cx="299" cy="115" r="3" fill="#c2cba7" />
        <circle cx="60" cy="37" r="3" fill="#c2cba7" />
      </svg>
      <Hamster mood={sleeping ? "sleep" : "run"} className="wheel-hamster" />
    </div>
  );
}
