import { ChangeDetectionStrategy, Component, Input, inject, output } from '@angular/core';
import type { User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService } from '../../../core/theme/theme.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserMenuComponent {
  @Input({ required: true }) user!: User;
  @Input({ required: true }) usersCount = 0;

  readonly logout = output<void>();

  private readonly themeService = inject(ThemeService);

  protected readonly theme = this.themeService.theme;
  protected readonly toggleTheme = this.themeService.toggleTheme;
}
