import { type AvatarMood, avatarMoodPresentation } from "@jargon/brand/bloub-avatar-motion";
import type { AvatarHue } from "@jargon/contracts/ipc";
import { prefersReducedMotion } from "@jargon/ui/utils";
import { BotEngine, type BotFrame, DEMI_VIEWBOX, POSES, RAYON } from "@norbert_bodziony/bloub";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import type { AvatarMotion, SupportedAvatarSilhouetteId } from "../../bloub-avatar";
import type { AgentProfile } from "../../data";
import type { FloorCustom } from "../floor/floor-custom";
import { personPortraitUrl } from "./person-look";

// Cap avatar animation at 30fps: uncapped bloub clocks measured 30% renderer / 24% GPU
// for two visible avatars. The shape is 24-40px, so the eye cannot see the difference.
const AVATAR_FPS = 30;
// Decor rings are sampled from the `orbit` pose, not played as a state: `orbit`
// replaces the body, while sampling only `frame.arcs` keeps the silhouette.
const RING_POSE = "orbit";

interface AgentAvatarProps {
  agent?: (Pick<AgentProfile, "avatarSeed" | "avatarHue" | "avatarUrl"> & { id?: string | undefined }) | undefined;
  /** The agent id, which finds the look saved on the floor. Defaults to `agent.id`. */
  agentId?: string | undefined;
  /** A look to draw instead of the one saved for the agent, for a form that has no agent yet. */
  custom?: FloorCustom | null | undefined;
  seed?: string | undefined;
  hue?: AvatarHue | null;
  url?: string | null | undefined;
  motion?: AvatarMotion;
  /** What the agent is doing. It chooses the face, never the silhouette. */
  mood?: AvatarMood;
  cycleOffset?: number;
  animationOffset?: number;
  shape?: SupportedAvatarSilhouetteId;
  /**
   * Kept for callers. A portrait does not move its eyes, so this has no effect.
   */
  followPointer?: boolean;
  class?: string;
  style?: Record<string, string>;
}

export function AgentAvatar(props: AgentAvatarProps) {
  const seed = () => props.seed ?? props.agent?.avatarSeed ?? "agent";
  const hue = () => (props.hue !== undefined ? props.hue : (props.agent?.avatarHue ?? null));
  const motion = () => props.motion ?? "hover";
  const url = () => (props.url !== undefined ? props.url : (props.agent?.avatarUrl ?? null));
  const mood = (): AvatarMood => props.mood ?? "idle";
  const presentation = () => avatarMoodPresentation(mood());
  const [imageFailed, setImageFailed] = createSignal(false);
  createEffect(
    () => url(),
    () => {
      setImageFailed(false);
    },
  );
  const className = () => `agent-avatar agent-avatar-motion-${motion()} ${props.class ?? ""}`;
  // The custom property rides with the attribute rather than being set on every avatar: the
  // keyframe is an infinite animation, and a selector that matched all of them would start one
  // behind every resting row in the sidebar.
  const breathe = () => (presentation().breathe > 0 ? String(presentation().breathe) : undefined);
  const style = (): Record<string, string> => {
    const amount = breathe();
    return amount ? { ...props.style, "--agent-avatar-breathe": amount } : { ...props.style };
  };
  return (
    <Show
      when={url() && !imageFailed()}
      fallback={
        <GeneratedAvatar
          seed={seed()}
          hue={hue()}
          mood={mood()}
          agentId={props.agentId ?? props.agent?.id}
          custom={props.custom}
          shape={props.shape}
          breathe={breathe()}
          class={className()}
          style={style()}
        />
      }
    >
      <span
        class={`${className()} agent-avatar-custom`}
        style={style()}
        data-avatar="image"
        data-mood={mood()}
        data-breathe={breathe()}
        aria-hidden="true"
      >
        {/* A photo cannot wear an expression, so the Bloub's own decor carries the mood around it.
            A working agent used to hide behind three dots, which hid the one thing the person
            chose; it now keeps its face and flies the same rings the generated avatar does. */}
        <AvatarRings when={presentation().rings}>
          <AvatarImage url={url()} onFailed={() => setImageFailed(true)} />
        </AvatarRings>
      </span>
    </Show>
  );
}

function AvatarImage(props: { url: string | null; onFailed: () => void }) {
  return <img src={props.url ?? ""} alt="" draggable={false} onError={() => props.onFailed()} />;
}

/**
 * Orbit rings drawn around the avatar instead of in place of it, sampled from a second
 * engine so a working avatar keeps its silhouette (`orbit` as a state is not shape-safe).
 */
function AvatarRings(props: { when: boolean; children: JSX.Element }) {
  return (
    <Show when={props.when} fallback={props.children}>
      <OrbitRings>{props.children}</OrbitRings>
    </Show>
  );
}

function OrbitRings(props: { children: JSX.Element }) {
  let elapsed = POSES[RING_POSE];
  let ringsSeen = false;
  let anchor: SVGSVGElement | undefined;
  const engine = new BotEngine(RAYON, RING_POSE);
  const [arcs, setArcs] = createSignal<BotFrame["arcs"]>(engine.sample(elapsed).arcs, { equals: false });

  onSettled(() => {
    if (prefersReducedMotion()) return;
    let handle = 0;
    let previousFrameAt = 0;
    let drawnAt = -Infinity;
    const step = (now: number) => {
      handle = requestAnimationFrame(step);
      elapsed += previousFrameAt ? Math.min((now - previousFrameAt) / 1000, 0.064) : 0;
      previousFrameAt = now;
      if (elapsed - drawnAt < 1 / AVATAR_FPS) return;
      drawnAt = elapsed;
      let sampled = engine.sample(elapsed);
      // A pose plays once, and its rings fade out before it ends - orbit holds them for 3.6s of a
      // 4.3s block. So the pose restarts on the frame its rings run out, which is the engine's own
      // measure of the cycle rather than a duration restated here.
      if (ringsSeen && sampled.arcs.length === 0) {
        ringsSeen = false;
        engine.reset(RING_POSE, elapsed);
        sampled = engine.sample(elapsed);
      }
      ringsSeen ||= sampled.arcs.length > 0;
      setArcs(sampled.arcs);
    };
    const stop = () => {
      if (!handle) return;
      cancelAnimationFrame(handle);
      handle = 0;
    };
    const start = () => {
      if (handle) return;
      // The clock restarts from the next frame, so a row that scrolls back in resumes where it
      // stopped rather than jumping forward by the time it spent out of sight.
      previousFrameAt = 0;
      handle = requestAnimationFrame(step);
    };
    // A `BloubBot` pauses itself off screen through its own observer. These rings are our loop, so
    // without the same gate every working row in a long sidebar keeps sampling an engine and
    // writing paths that nobody can see.
    const observer =
      anchor && window.IntersectionObserver
        ? new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) start();
            else stop();
          })
        : undefined;
    if (observer && anchor) observer.observe(anchor);
    else start();
    return () => {
      observer?.disconnect();
      stop();
    };
  });

  return (
    <>
      <AvatarArcs arcs={arcs()} half="back" ref={(element) => (anchor = element)} />
      {props.children}
      <AvatarArcs arcs={arcs()} half="front" />
    </>
  );
}

function AvatarArcs(props: { arcs: BotFrame["arcs"]; half: "back" | "front"; ref?: (element: SVGSVGElement) => void }) {
  const gradientId = createUniqueId();
  return (
    <svg
      ref={props.ref}
      class="agent-avatar-arcs"
      viewBox={`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`}
      fill="none"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <defs>
        <For each={props.arcs} keyed={false}>
          {(arc) => (
            <linearGradient
              id={`${gradientId}-${arc().id}`}
              gradientUnits="userSpaceOnUse"
              x1={arc().grad.x1}
              y1={arc().grad.y1}
              x2={arc().grad.x2}
              y2={arc().grad.y2}
            >
              <For each={arc().grad.stops} keyed={false}>
                {(stop, index) => (
                  <stop offset={index / Math.max(1, arc().grad.stops.length - 1)} stop-color={stop()} />
                )}
              </For>
            </linearGradient>
          )}
        </For>
      </defs>
      <For each={props.arcs} keyed={false}>
        {(arc) => (
          <path
            d={props.half === "back" ? arc().back : arc().front}
            stroke={`url(#${gradientId}-${arc().id})`}
            stroke-width={arc().width}
            opacity={arc().opacity}
          />
        )}
      </For>
    </svg>
  );
}

function GeneratedAvatar(props: {
  seed: string;
  hue: AvatarHue | null;
  mood: AvatarMood;
  agentId?: string | undefined;
  custom?: FloorCustom | null | undefined;
  shape?: SupportedAvatarSilhouetteId | undefined;
  breathe?: string | undefined;
  class: string;
  style?: Record<string, string>;
}) {
  const presentation = createMemo(() => avatarMoodPresentation(props.mood));
  // The person comes from the seed (silhouette and face) and the clothes from the hue. The mood adds
  // the glow, the breathing and the rings through CSS and AvatarRings; a portrait has no expression.
  const src = createMemo(() => personPortraitUrl(props.seed, props.hue, props.agentId, props.shape, props.custom));
  return (
    <span
      class={`${props.class} agent-avatar-person`}
      style={props.style}
      data-avatar="generated"
      data-mood={props.mood}
      data-breathe={props.breathe}
      aria-hidden="true"
    >
      <AvatarRings when={presentation().rings}>
        <img src={src()} alt="" draggable={false} />
      </AvatarRings>
    </span>
  );
}
