import { ChangeDetectionStrategy, Component, Input, computed, output, signal } from '@angular/core';
import type { User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { generateTemporaryPassword } from '../canvas.mappers';

type NewUserForm = {
  email: string;
  name: string;
  password: string;
  role: User['role'];
};

const emptyNewUser = (): NewUserForm => ({
  email: '',
  name: '',
  password: generateTemporaryPassword(),
  role: 'MEMBER'
});

@Component({
  selector: 'app-admin-users-menu',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './admin-users-menu.component.html',
  styleUrl: './admin-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUsersMenuComponent {
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;
  @Input({ required: true }) isCreatingUser = false;

  readonly createUser = output<NewUserForm>();
  protected readonly newUser = signal<NewUserForm>(emptyNewUser());

  protected readonly canCreateUser = computed(() => {
    const user = this.newUser();
    return user.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(user.email) && user.password.length >= 6;
  });

  protected readonly updateNewUser = <TKey extends keyof NewUserForm>(key: TKey, value: NewUserForm[TKey]) => {
    this.newUser.update((current) => ({ ...current, [key]: value }));
  };

  protected readonly regeneratePassword = () => {
    this.updateNewUser('password', generateTemporaryPassword());
  };

  protected readonly handleSubmit = (event: Event) => {
    event.preventDefault();
    this.createUser.emit(this.newUser());
    this.newUser.set(emptyNewUser());
  };
}
