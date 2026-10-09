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

// Ionic draws the window (the app lends it to the frame, app 1.6.0); this is only what is the
// tool's own: the board and the colour swatches. The rest takes the app's colours, through Ionic's
// variables, in light and dark.
const STYLE = `
ft-sketch { display: flex; flex-direction: column; height: 100%; }
ft-sketch ion-content { flex: 1; }
ft-sketch .ft-i {
  display: block; width: 22px; height: 22px; background: currentColor;
  -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat;
}
ft-sketch .swatch { display: block; width: 22px; height: 22px; border-radius: 50%; }
ft-sketch canvas { width: 100%; background: #fff; border-radius: 10px; touch-action: none; }
`;

/** An Ionicon in a button: Ionic's own `ion-icon` when the app lent it by name, else the one the
 *  app serves at `./icon/<name>.svg`, painted in the button's colour. Never a picture of ours. */
const icon = (name) =>
  globalThis.Ionicons?.map?.has(name)
    ? `<ion-icon slot="icon-only" name="${name}" aria-hidden="true"></ion-icon>`
    : `<i slot="icon-only" class="ft-i" style="--i:url(./icon/${name}.svg)" aria-hidden="true"></i>`;

class Sketch extends HTMLElement {
  constructor() {
    super();
    this.strokes = [];
    this.ink = 0;
    this.nib = 1;
    this.drawing = null;
  }

  connectedCallback() {
    // A swatch is the colour itself, not an icon: it keeps the button narrow so the bar fits.
    const inks = INKS.map(
      (colour, at) =>
        `<ion-button data-act="ink" data-at="${at}" aria-label="Colour ${at + 1}"><i class="swatch" style="background:${colour}" aria-hidden="true"></i></ion-button>`,
    ).join("");
    // In the page, not in a shadow root: the frame holds only this tool, and Ionic's global
    // styles (colours, typography) do not cross a shadow boundary.
    this.innerHTML = `
      <style>${STYLE}</style>
      <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          ${inks}
          <ion-button data-act="nib" aria-label="Line width">${icon("brush-outline")}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button data-act="undo" aria-label="Undo the last stroke">${icon("arrow-undo-outline")}</ion-button>
          <ion-button data-act="clear" aria-label="Start again">${icon("trash-outline")}</ion-button>
          <ion-button data-act="send" aria-label="Send the drawing">${icon("send-outline")}</ion-button>
        </ion-buttons>
      </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <canvas width="${BOARD.width}" height="${BOARD.height}"></canvas>
      </ion-content>
    `;
    this.canvas = this.querySelector("canvas");
    this.querySelector("ion-toolbar").addEventListener("click", (event) => this.onClick(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onMove(event));
    this.canvas.addEventListener("pointerup", () => this.onUp());
    this.canvas.addEventListener("pointercancel", () => this.onUp());
    this.paint();
  }

  onClick(event) {
    const button = event.target.closest("ion-button");
    if (!button || button.disabled) return;
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
    for (const button of this.querySelectorAll('[data-act="ink"]')) {
      const on = Number(button.dataset.at) === this.ink;
      button.fill = on ? "solid" : undefined;
      button.setAttribute("aria-pressed", String(on));
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
