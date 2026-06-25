import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges, computed, output, signal } from '@angular/core';
import type { User } from '@pdi/contracts';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { generateTemporaryPassword } from '../canvas/canvas.mappers';

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

const toRoleLabel = (role: User['role']) => (role === 'ADMIN' ? 'TECHLEAD' : 'MEMBER');

const matchesRole = (role: User['role'], term: string) =>
  toRoleLabel(role).toLowerCase().includes(term) || role.toLowerCase().includes(term);

@Component({
  selector: 'app-techlead-users-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './techlead-users-page.component.html',
  styleUrl: './techlead-users-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TechleadUsersPageComponent implements OnChanges {
  @Input({ required: true }) isCreatingUser = false;
  @Input({ required: true }) isDeletingUser = false;
  @Input({ required: true }) currentUserId = '';
  @Input({ required: true })
  set users(value: User[]) {
    this.usersSignal.set(value);
  }
  get users(): User[] {
    return this.usersSignal();
  }
  @Input({ required: true }) usersCount = 0;

  readonly createUser = output<NewUserForm>();
  readonly deleteUser = output<string>();
  protected newUser: NewUserForm = emptyNewUser();
  protected readonly roleLabel = toRoleLabel;
  protected deletingUserId = '';
  protected pendingDeleteUser: User | null = null;

  private readonly usersSignal = signal<User[]>([]);
  protected readonly userSearch = signal('');

  protected readonly filteredUsers = computed(() => {
    const term = this.userSearch().trim().toLowerCase();
    const users = this.usersSignal();

    if (!term) return users;

    return users.filter((user) =>
      [user.name, user.email].some((field) => field.toLowerCase().includes(term)) || matchesRole(user.role, term)
    );
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isDeletingUser'] && !this.isDeletingUser) {
      this.deletingUserId = '';
      this.pendingDeleteUser = null;
    }
  }

  protected readonly regeneratePassword = () => {
    this.newUser = { ...this.newUser, password: generateTemporaryPassword() };
  };

  protected readonly handleSubmit = (event: Event) => {
    event.preventDefault();
    this.createUser.emit(this.newUser);
    this.newUser = emptyNewUser();
  };

  protected readonly canDeleteUser = (user: User) => user.id !== this.currentUserId;

  protected readonly handleDeleteUser = (user: User) => {
    if (!this.canDeleteUser(user)) return;
    this.pendingDeleteUser = user;
  };

  protected readonly closeDeleteModal = () => {
    this.pendingDeleteUser = null;
  };

  protected readonly confirmDeleteUser = () => {
    if (!this.pendingDeleteUser) return;
    this.deletingUserId = this.pendingDeleteUser.id;
    this.deleteUser.emit(this.pendingDeleteUser.id);
  };
}
