// A sketch board for FlickerTalk (Plan §53–§55): draw with a finger and send the drawing as a
// picture. Nothing leaves this frame but the picture the user sends, and the app is what sends it.

/** A stroke as a line to follow: through the middle of each pair, so a quick hand still curves. */
export function pathOf(points) {
  if (!points.length) return [];
  const path = [{ to: { x: points[0].x, y: points[0].y } }];
  for (let at = 1; at < points.length - 1; at += 1) {
    path.push({
      control: { x: points[at].x, y: points[at].y },
      to: { x: (points[at].x + points[at + 1].x) / 2, y: (points[at].y + points[at + 1].y) / 2 },
    });
  }
  if (points.length > 1) {
    const last = points[points.length - 1];
    path.push({ control: { x: last.x, y: last.y }, to: { x: last.x, y: last.y } });
  }
  return path;
}

/** Where the finger is, in the drawing's own pixels. */
export function strokeAt(event, box, width) {
  const scale = width / (box.width || 1);
  return { x: (event.clientX - box.left) * scale, y: (event.clientY - box.top) * scale };
}

/** What a drawing is called: the day and the time it was made. */
export function penName(now) {
  const two = (value) => String(value).padStart(2, "0");
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  return `sketch-${day}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}.png`;
}

/** The board, in pixels. Wide enough to read, light enough to send. */
const BOARD = { width: 1280, height: 960 };
const INKS = ["#111111", "#d92b2b", "#1d6fd0", "#e2a400"];
const NIBS = [4, 10, 22];

const STYLE = `
:host { display: block; font: 14px system-ui, sans-serif; color: #111; --paper: #fff; }
@media (prefers-color-scheme: dark) { :host { color: #f4f4f4; --paper: #111; } }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0 10px; }
button {
  appearance: none; border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 10px; min-width: 44px; height: 40px; font-size: 18px; cursor: pointer; opacity: .75;
}
button.on { opacity: 1; box-shadow: inset 0 0 0 2px currentColor; }
.i {
  display: block; width: 22px; height: 22px; margin: auto; background: currentColor;
  -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat;
}
button.on .i { background: var(--paper); }
.ink { border: 0; }
.ink i { display: block; width: 22px; height: 22px; border-radius: 50%; margin: auto; }
.grow { flex: 1; }
canvas { width: 100%; background: #fff; border-radius: 10px; touch-action: none; }
`;

class Sketch extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.strokes = [];
    this.ink = 0;
    this.nib = 1;
    this.drawing = null;
  }

  connectedCallback() {
    const inks = INKS.map(
      (colour, at) => `<button class="ink" data-act="ink" data-at="${at}" aria-label="Colour ${at + 1}"><i style="background:${colour}"></i></button>`,
    ).join("");
    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="bar">
        ${inks}
        <button data-act="nib" aria-label="Line width"><i class="i" style="--i:url(./icon/brush-outline.svg)"></i></button>
        <span class="grow"></span>
        <button data-act="undo" aria-label="Undo the last stroke"><i class="i" style="--i:url(./icon/arrow-undo-outline.svg)"></i></button>
        <button data-act="clear" aria-label="Start again"><i class="i" style="--i:url(./icon/trash-outline.svg)"></i></button>
        <button data-act="send" aria-label="Send the drawing"><i class="i" style="--i:url(./icon/send-outline.svg)"></i></button>
      </div>
      <canvas width="${BOARD.width}" height="${BOARD.height}"></canvas>
    `;
    this.canvas = this.root.querySelector("canvas");
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onMove(event));
    this.canvas.addEventListener("pointerup", () => this.onUp());
    this.canvas.addEventListener("pointercancel", () => this.onUp());
    this.paint();
  }

  onClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const { act, at } = button.dataset;
    if (act === "ink") this.ink = Number(at);
    else if (act === "nib") this.nib = (this.nib + 1) % NIBS.length;
    else if (act === "undo") this.strokes.pop();
    else if (act === "clear") this.strokes = [];
    else if (act === "send") this.send();
    this.paint();
  }

  onDown(event) {
    this.canvas.setPointerCapture?.(event.pointerId);
    this.drawing = {
      ink: INKS[this.ink],
      nib: NIBS[this.nib],
      points: [strokeAt(event, this.canvas.getBoundingClientRect(), BOARD.width)],
    };
    this.strokes.push(this.drawing);
    this.paint();
  }

  onMove(event) {
    if (!this.drawing) return;
    this.drawing.points.push(strokeAt(event, this.canvas.getBoundingClientRect(), BOARD.width));
    this.paint();
  }

  onUp() {
    this.drawing = null;
  }

  paint() {
    for (const act of ["ink", "nib"]) {
      for (const button of this.root.querySelectorAll(`[data-act="${act}"]`)) {
        button.classList.toggle("on", act === "nib" || Number(button.dataset.at) === this.ink);
      }
    }
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, BOARD.width, BOARD.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of this.strokes) {
      const path = pathOf(stroke.points);
      if (!path.length) continue;
      context.strokeStyle = stroke.ink;
      context.fillStyle = stroke.ink;
      context.lineWidth = stroke.nib;
      if (path.length === 1) {
        context.beginPath();
        context.arc(path[0].to.x, path[0].to.y, stroke.nib / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      context.moveTo(path[0].to.x, path[0].to.y);
      for (const step of path.slice(1)) {
        context.quadraticCurveTo(step.control.x, step.control.y, step.to.x, step.to.y);
      }
      context.stroke();
    }
  }

  send() {
    if (!this.strokes.length) return;
    let made = "";
    try {
      made = this.canvas.toDataURL("image/png");
    } catch {
      return;
    }
    globalThis.ft.send(penName(new Date()), "image/png", made.split(",")[1] ?? "");
  }
}

customElements.define("ft-sketch", Sketch);

/** An icon the app lends (`./icon/<name>.svg`): painted in the colour of the app, not a picture. */
function drawIcon(name) {
  const made = document.createElement("i");
  made.className = "i";
  made.style.setProperty("--i", `url(./icon/${name}.svg)`);
  return made;
}
