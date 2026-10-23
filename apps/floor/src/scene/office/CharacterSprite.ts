import { AnimatedSprite, Container, Graphics, type Texture } from "pixi.js";

export type Direction = "down" | "up" | "right" | "left";
export type AnimState = "walk" | "type" | "read" | "idle" | "teach" | "hand";

// Output rows from SpriteAdapter: down=0, up=1, right=2 (left = flipped right)
const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

const ANIM_FRAMES: Record<AnimState, number[]> = {
  walk: [1, 0, 2, 0], // step, stand, step, stand (frame 0 is the stand pose)
  type: [3, 4], // seated typing: hands alternate
  read: [5, 6], // seated reading: page turns
  teach: [7, 0], // arm up pointing, then back to stand
  hand: [8, 8], // hand raised
  idle: [0],
};

// Render characters a bit larger than their native 18×32 so heads/faces read
// clearly on the floor. Applied to the container so the leg-crop mask (a child)
// scales with the sprite and stays aligned.
const CHAR_SCALE = 1.08;

/** Ported from shahar061/the-office (office/characters/CharacterSprite.ts). */
export class CharacterSprite {
  readonly container: Container;
  private sprite: AnimatedSprite;
  private frames: Texture[][];
  private pose: Texture | null = null;
  private currentDirection: Direction | null = "down";
  private currentAnim: AnimState | null = "idle";
  private frameSpeed = 0.15;
  private frameW: number;
  private frameH: number;
  private cropMask: Graphics | null = null;

  constructor(frames: Texture[][]) {
    this.frames = frames;
    this.container = new Container();

    const initialFrames = this.getFrames("down", "idle");
    this.sprite = new AnimatedSprite(initialFrames);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.animationSpeed = this.frameSpeed;
    this.sprite.play();
    // Anchor is (0.5, 1): in container space the sprite spans x∈[-w/2, w/2],
    // y∈[-h, 0] (feet at the origin). Used by the seated leg-crop mask.
    this.frameW = this.sprite.texture.frame.width || this.sprite.width || 16;
    this.frameH = this.sprite.texture.frame.height || this.sprite.height || 32;

    this.container.addChild(this.sprite);
    this.container.scale.set(CHAR_SCALE);
  }

  /**
   * Crop `cropPx` off the bottom of the sprite (the legs) so a seated agent
   * reads as tucked under the desk instead of standing on top of it. Pass 0 to
   * clear the crop (standing / walking). The mask only covers the sprite, so
   * status glyphs / bubbles parented elsewhere are unaffected.
   */
  setSeatedCrop(cropPx: number): void {
    if (cropPx <= 0) {
      if (this.cropMask) {
        this.sprite.mask = null;
        this.cropMask.visible = false;
      }
      return;
    }
    if (!this.cropMask) {
      this.cropMask = new Graphics();
      this.container.addChild(this.cropMask);
    }
    const w = this.frameW;
    const h = this.frameH;
    this.cropMask.clear();
    // Keep the top (h - cropPx) of the sprite; reveal whatever (the desk) is
    // behind where the legs were.
    this.cropMask.rect(-w / 2 - 2, -h - 2, w + 4, h - cropPx + 2).fill(0xffffff);
    this.cropMask.visible = true;
    this.sprite.mask = this.cropMask;
  }

  /** Swap the sprite sheet (a changed look) and keep the current animation and direction. */
  setFrames(frames: Texture[][]): void {
    this.frames = frames;
    const anim = this.currentAnim;
    const dir = this.currentDirection;
    this.currentAnim = null;
    this.currentDirection = null;
    if (this.pose) return;
    if (anim && dir) this.setAnimation(anim, dir);
  }

  private getFrames(direction: Direction, anim: AnimState): Texture[] {
    const row = DIRECTION_ROW[direction];
    return ANIM_FRAMES[anim].map((col) => this.frames[row][col]);
  }

  /** Draw the character bigger or smaller than its 18 x 32 frame (used by the school floor). */
  setDisplayScale(scale: number): void {
    this.container.scale.set(scale);
  }

  /** Hold one still frame (a work or emote pose) until cleared with null. While a pose
   *  is held, walk and animation calls leave it alone; the caller clears it first. */
  setPose(texture: Texture | null): void {
    if (!texture) {
      this.pose = null;
      this.currentAnim = null;
      this.currentDirection = null;
      return;
    }
    this.pose = texture;
    this.sprite.stop();
    this.sprite.textures = [texture];
    this.sprite.gotoAndStop(0);
    this.sprite.scale.x = 1;
  }

  hasPose(): boolean {
    return this.pose !== null;
  }

  setAnimation(anim: AnimState, direction: Direction): void {
    if (this.pose) return;
    if (anim === this.currentAnim && direction === this.currentDirection) return;

    this.currentAnim = anim;
    this.currentDirection = direction;

    this.sprite.textures = this.getFrames(direction, anim);
    this.sprite.scale.x = direction === "left" ? -1 : 1;
    this.sprite.animationSpeed = anim === "walk" ? 0.15 : anim === "type" ? 0.12 : anim === "idle" ? 0.08 : 0.05;
    this.sprite.play();
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  setAlpha(alpha: number): void {
    this.container.alpha = alpha;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
