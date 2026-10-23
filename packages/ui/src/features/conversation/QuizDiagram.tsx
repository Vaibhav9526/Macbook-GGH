import type { SchoolQuizDiagram } from "@jargon/contracts/ipc";
import { For, Show } from "solid-js";

// The diagram of a quiz question: a line graph drawn as SVG from data, never from model markup.
const WIDTH = 280;
const HEIGHT = 170;
const PAD_LEFT = 40;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 34;
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;
const SERIES_CLASSES = ["quiz-diagram-line-1", "quiz-diagram-line-2", "quiz-diagram-line-3"] as const;

/** A tick step of 1, 2 or 5 times a power of ten that gives about four ticks over the range. */
function tickStep(range: number): number {
  const rough = range / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

function ticks(min: number, max: number): number[] {
  const step = tickStep(max - min);
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step / 1000; value += step) {
    out.push(Number(value.toPrecision(10)));
  }
  return out;
}

function tickText(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** The axes cover the data and always include zero, as a physics graph does. */
function extent(values: number[]): [number, number] {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  return low === high ? [low, low + 1] : [low, high];
}

export function QuizDiagram(props: { diagram: SchoolQuizDiagram; label: string }) {
  const model = () => {
    const all = props.diagram.lines.flatMap((line) => line.points);
    const [xMin, xMax] = extent([...all.map(([x]) => x), ...props.diagram.marks.map((mark) => mark.x)]);
    const [yMin, yMax] = extent([...all.map(([, y]) => y), ...props.diagram.marks.map((mark) => mark.y)]);
    const x = (value: number) => PAD_LEFT + ((value - xMin) / (xMax - xMin)) * PLOT_WIDTH;
    const y = (value: number) => PAD_TOP + PLOT_HEIGHT - ((value - yMin) / (yMax - yMin)) * PLOT_HEIGHT;
    return { x, y, xTicks: ticks(xMin, xMax), yTicks: ticks(yMin, yMax), xZero: x(0), yZero: y(0) };
  };

  return (
    <figure class="quiz-diagram">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={props.label} class="quiz-diagram-svg">
        <For each={model().yTicks}>
          {(value) => (
            <>
              <line
                class="quiz-diagram-grid"
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={model().y(value)}
                y2={model().y(value)}
              />
              <text
                class="quiz-diagram-tick"
                x={PAD_LEFT - 6}
                y={model().y(value)}
                text-anchor="end"
                dominant-baseline="middle"
              >
                {tickText(value)}
              </text>
            </>
          )}
        </For>
        <For each={model().xTicks}>
          {(value) => (
            <>
              <line
                class="quiz-diagram-grid"
                x1={model().x(value)}
                x2={model().x(value)}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
              />
              <text class="quiz-diagram-tick" x={model().x(value)} y={HEIGHT - PAD_BOTTOM + 13} text-anchor="middle">
                {tickText(value)}
              </text>
            </>
          )}
        </For>
        <line class="quiz-diagram-axis" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={model().yZero} y2={model().yZero} />
        <line class="quiz-diagram-axis" x1={model().xZero} x2={model().xZero} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} />
        <text class="quiz-diagram-label" x={PAD_LEFT + PLOT_WIDTH / 2} y={HEIGHT - 4} text-anchor="middle">
          {props.diagram.xLabel}
        </text>
        <text
          class="quiz-diagram-label"
          transform={`translate(11 ${PAD_TOP + PLOT_HEIGHT / 2}) rotate(-90)`}
          text-anchor="middle"
        >
          {props.diagram.yLabel}
        </text>
        <For each={props.diagram.lines}>
          {(line, index) => (
            <polyline
              class={`quiz-diagram-line ${SERIES_CLASSES[index() % SERIES_CLASSES.length] ?? ""}`}
              points={line.points.map(([px, py]) => `${model().x(px)},${model().y(py)}`).join(" ")}
            />
          )}
        </For>
        <For each={props.diagram.marks}>
          {(mark) => (
            <>
              <circle class="quiz-diagram-mark" cx={model().x(mark.x)} cy={model().y(mark.y)} r="3" />
              <text class="quiz-diagram-mark-label" x={model().x(mark.x) + 5} y={model().y(mark.y) - 6}>
                {mark.label}
              </text>
            </>
          )}
        </For>
      </svg>
      <Show when={props.diagram.lines.some((line) => line.label)}>
        <figcaption class="quiz-diagram-legend">
          <For each={props.diagram.lines}>
            {(line, index) => (
              <Show when={line.label}>
                <span class="quiz-diagram-legend-item">
                  <span class={`quiz-diagram-swatch ${SERIES_CLASSES[index() % SERIES_CLASSES.length] ?? ""}`} />
                  {line.label}
                </span>
              </Show>
            )}
          </For>
        </figcaption>
      </Show>
    </figure>
  );
}
