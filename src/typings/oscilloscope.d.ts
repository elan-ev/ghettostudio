declare module "oscilloscope" {
  export default class Oscilloscope {
    constructor(source: MediaStreamAudioSourceNode, options: { fftSize: number });
    animate(ctx: CanvasRenderingContext2D): void;
    stop(): void;
  }
}
