import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService, type ThemeMode } from '../../../core/theme/theme.service';

const NEXT_THEME: Record<ThemeMode, { label: string; icon: string }> = {
  dark: { label: 'Light theme', icon: 'sun' },
  light: { label: 'High contrast', icon: 'contrast' },
  'high-contrast': { label: 'Dark theme', icon: 'moon' }
};

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserMenuComponent {
  readonly user = input.required<User>();
  readonly usersCount = input.required<number>();

  readonly logout = output<void>();

  private readonly themeService = inject(ThemeService);

  protected readonly theme = this.themeService.theme;
  protected readonly cycleTheme = this.themeService.cycleTheme;
  protected readonly nextTheme = computed(() => NEXT_THEME[this.theme()]);
}
