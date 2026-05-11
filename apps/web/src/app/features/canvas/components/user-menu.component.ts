import { Component, Input, output } from '@angular/core';
import type { User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css'
})
export class UserMenuComponent {
  @Input({ required: true }) user!: User;
  @Input({ required: true }) usersCount = 0;

  readonly logout = output<void>();
}
