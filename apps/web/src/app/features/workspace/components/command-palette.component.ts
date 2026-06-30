import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  SimpleChanges,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

export type CommandItem = {
  description: string;
  id: string;
  label: string;
};

export const filterCommands = (commands: readonly CommandItem[], query: string): CommandItem[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...commands];
  return commands.filter((command) =>
    `${command.label} ${command.description}`.toLowerCase().includes(normalized)
  );
};

@Component({
  selector: 'app-command-palette',
  standalone: true,
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'handleWindowKeydown($event)' }
})
export class CommandPaletteComponent implements OnChanges {
  readonly isOpen = input.required<boolean>();
  readonly commands = input.required<CommandItem[]>();

  readonly closed = output<void>();
  readonly commandTriggered = output<string>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  protected readonly filteredCommands = () => filterCommands(this.commands(), this.query());

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen'] && this.isOpen()) {
      this.query.set('');
      this.activeIndex.set(0);
      // Focus the search field once the dialog has rendered.
      setTimeout(() => this.searchInput()?.nativeElement.focus());
    }
  }

  protected readonly handleWindowKeydown = (event: KeyboardEvent) => {
    if (!this.isOpen()) return;
    if (event.key !== 'Escape') return;

    event.preventDefault();
    this.close();
  };

  protected readonly onSearch = (event: Event) => {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  };

  protected readonly handleKeydown = (event: KeyboardEvent) => {
    const items = this.filteredCommands();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1, items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1, items.length);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = items[this.activeIndex()];
        if (item) this.runCommand(item.id);
        break;
      }
      case 'Tab':
        this.trapFocus(event);
        break;
    }
  };

  protected readonly close = () => {
    this.closed.emit();
  };

  protected readonly runCommand = (id: string) => {
    this.commandTriggered.emit(id);
  };

  protected readonly setActive = (index: number) => this.activeIndex.set(index);

  private readonly moveActive = (delta: number, length: number) => {
    if (length === 0) return;
    const next = Math.min(length - 1, Math.max(0, this.activeIndex() + delta));
    this.activeIndex.set(next);
    setTimeout(() =>
      this.dialog()?.nativeElement
        .querySelector('.command-list button.is-active')
        ?.scrollIntoView({ block: 'nearest' })
    );
  };

  private readonly trapFocus = (event: KeyboardEvent) => {
    const root = this.dialog()?.nativeElement;
    if (!root) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hasAttribute('disabled'));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = root.ownerDocument.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };
}
