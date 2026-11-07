// libass parse oracle: JASSUB's WASM libass in the browser. Test tooling only, never shipped.
import createModule from 'jassub/dist/wasm/jassub-worker.js';

/** `ASS_Style` fields as JASSUB `getStyles` returns them. Colours are 0xRRGGBBAA. */
export interface LibassStyle {
  readonly Name: string;
  readonly FontName: string;
  readonly FontSize: number;
  readonly PrimaryColour: number;
  readonly SecondaryColour: number;
  readonly OutlineColour: number;
  readonly BackColour: number;
  readonly Bold: number;
  readonly Italic: number;
  readonly Underline: number;
  readonly StrikeOut: number;
  readonly ScaleX: number;
  readonly ScaleY: number;
  readonly Spacing: number;
  readonly Angle: number;
  readonly BorderStyle: number;
  readonly Outline: number;
  readonly Shadow: number;
  readonly Alignment: number;
  readonly MarginL: number;
  readonly MarginR: number;
  readonly MarginV: number;
  readonly Encoding: number;
  readonly treat_fontname_as_pattern: number;
  readonly Blur: number;
  readonly Justify: number;
}

/** `ASS_Event` fields as JASSUB `getEvents` returns them. Start and Duration are cast to uint32. */
export interface LibassEvent {
  readonly Start: number;
  readonly Duration: number;
  readonly ReadOrder: number;
  readonly Layer: number;
  readonly Style: number;
  readonly MarginL: number;
  readonly MarginR: number;
  readonly MarginV: number;
  readonly Name: string;
  readonly Text: string;
  readonly Effect: string;
}

export interface LibassTrack {
  /** Index 0 is libass's built-in "Default" style. */
  readonly styles: LibassStyle[];
  readonly events: LibassEvent[];
}

interface JassubInstance {
  setLogLevel(level: number): void;
  createTrackMem(text: string): void;
  getStyles(): LibassStyle[];
  getEvents(): LibassEvent[];
  removeTrack(): void;
  quitLibrary(): void;
  delete(): void;
}

interface JassubModule {
  JASSUB: new (width: number, height: number, defaultFont: string) => JassubInstance;
}

let modulePromise: Promise<JassubModule> | undefined;

function loadModule(): Promise<JassubModule> {
  modulePromise ??= (createModule as (arg: object) => Promise<unknown>)({
    __poolSize: 0,
    __out: () => {},
  }) as Promise<JassubModule>;
  return modulePromise;
}

/** Parses a script with libass and returns its styles and events. */
export async function parseWithLibass(text: string): Promise<LibassTrack> {
  const { JASSUB } = await loadModule();
  const lib = new JASSUB(640, 360, '');
  try {
    lib.createTrackMem(text);
    return { styles: lib.getStyles(), events: lib.getEvents() };
  } finally {
    lib.quitLibrary();
    lib.delete();
  }
}
