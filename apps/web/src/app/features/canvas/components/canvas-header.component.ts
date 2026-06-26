import { ChangeDetectionStrategy, Component, HostListener, Input, output, signal } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { KeyboardShortcutsComponent } from '../../../shared/components/keyboard-shortcuts.component';
import { UserMenuComponent } from './user-menu.component';

@Component({
  selector: 'app-canvas-header',
  standalone: true,
  imports: [LucideAngularModule, KeyboardShortcutsComponent, UserMenuComponent],
  templateUrl: './canvas-header.component.html',
  styleUrl: './canvas-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasHeaderComponent {
  @Input({ required: true }) isCreatingPlan = false;
  @Input({ required: true }) isExportingPlan = false;
  @Input({ required: true }) isImportingPlan = false;
  @Input({ required: true }) isSaving = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) user!: User;
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly exportPlan = output<string>();
  readonly exportBoardAsPng = output<void>();
  readonly exportBoardAsSvg = output<void>();
  readonly importPlan = output<File>();
  readonly logout = output<void>();
  readonly saveBoard = output<void>();
  readonly selectPlan = output<string>();

  protected readonly showShortcuts = signal(false);

  @HostListener('window:keydown', ['$event'])
  protected readonly handleShortcutHelpKey = (event: KeyboardEvent) => {
    if (event.key !== '?') return;

    const target = event.target as HTMLElement | null;
    const isTyping =
      !!target && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
    if (isTyping) return;

    event.preventDefault();
    this.showShortcuts.set(true);
  };

  protected readonly ownerName = (ownerId: string) => this.users.find((item) => item.id === ownerId)?.name;

  protected readonly handleQuickCreate = () => {
    this.createPlan.emit({
      objective: 'Define a measurable development outcome.',
      ownerId: this.users.find((candidate) => candidate.role === 'MEMBER')?.id,
      title: 'New PDI plan'
    });
  };

  protected readonly handleImportFile = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (file) {
      this.importPlan.emit(file);
    }
  };
}
