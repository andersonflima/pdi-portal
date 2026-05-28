import { ChangeDetectionStrategy, Component, HostListener, Input, output } from '@angular/core';

type CommandItem = {
  description: string;
  id: string;
  label: string;
};

@Component({
  selector: 'app-command-palette',
  standalone: true,
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommandPaletteComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) commands: CommandItem[] = [];

  readonly closed = output<void>();
  readonly commandTriggered = output<string>();

  @HostListener('window:keydown', ['$event'])
  protected readonly handleWindowKeydown = (event: KeyboardEvent) => {
    if (!this.isOpen) return;
    if (event.key !== 'Escape') return;

    event.preventDefault();
    this.closed.emit();
  };

  protected readonly close = () => {
    this.closed.emit();
  };

  protected readonly runCommand = (id: string) => {
    this.commandTriggered.emit(id);
  };
}
