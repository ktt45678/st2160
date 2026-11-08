/** Splits text chunks into lines on CRLF, CR or LF, even when a CRLF spans two chunks. */
export class LineSplitter {
  private readonly onLine: (line: string) => void;
  private pending = '';
  private first = true;
  private lastWasCr = false;

  constructor(onLine: (line: string) => void) {
    this.onLine = onLine;
  }

  push(chunk: string): void {
    if (chunk.length === 0) return;
    let text = chunk;
    if (this.first) {
      this.first = false;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    let from = 0;
    if (this.lastWasCr && text.charCodeAt(0) === 10) from = 1;
    this.lastWasCr = false;
    for (let i = from; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      this.emit(this.pending + text.slice(from, i));
      this.pending = '';
      if (c === 13) {
        if (i + 1 === text.length) this.lastWasCr = true;
        else if (text.charCodeAt(i + 1) === 10) i++;
      }
      from = i + 1;
    }
    if (from < text.length) this.pending += text.slice(from);
  }

  /** Emits the last line if the input did not end with a line terminator. */
  end(): void {
    if (this.pending.length > 0) this.emit(this.pending);
    this.pending = '';
  }

  private emit(line: string): void {
    this.onLine(line.indexOf('\0') === -1 ? line : line.replaceAll('\0', '\uFFFD'));
  }
}
