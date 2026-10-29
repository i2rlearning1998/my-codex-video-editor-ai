// APP-019: the same project open in two tabs must never overwrite itself
// silently. Tabs talk over a BroadcastChannel: a new tab says hello, a tab that
// already has the project answers, and a save made by another tab is reported.
export type TabConflict = 'open-elsewhere' | 'saved-elsewhere';
interface Message {
  readonly type: 'hello' | 'present' | 'saved';
  readonly tab: string;
  readonly project: string;
}
export interface TabChannel {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  close(): void;
}

export class TabGuard {
  readonly tab = `t-${Math.random().toString(36).slice(2, 10)}`;
  constructor(
    private readonly channel: TabChannel,
    private readonly projectId: () => string,
    private readonly onConflict: (kind: TabConflict) => void,
  ) {
    channel.onmessage = (event) => this.#receive(event.data);
  }
  #post(type: Message['type']) {
    this.channel.postMessage({
      type,
      tab: this.tab,
      project: this.projectId(),
    } satisfies Message);
  }
  /** Call when the tab starts or opens another project. */
  announce() {
    this.#post('hello');
  }
  /** Call after every save. */
  saved() {
    this.#post('saved');
  }
  #receive(data: unknown) {
    const message = data as Message;
    if (!message || message.tab === this.tab) return;
    if (message.project !== this.projectId()) return;
    if (message.type === 'hello') this.#post('present');
    else if (message.type === 'present') this.onConflict('open-elsewhere');
    else if (message.type === 'saved') this.onConflict('saved-elsewhere');
  }
  dispose() {
    this.channel.onmessage = null;
    this.channel.close();
  }
}
