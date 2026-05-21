import { Component, Input, OnChanges, SimpleChanges, output } from '@angular/core';
import type { User } from '@pdi/contracts';
import { FormsModule } from '@angular/forms';
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

@Component({
  selector: 'app-techlead-users-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './techlead-users-page.component.html',
  styleUrl: './techlead-users-page.component.css'
})
export class TechleadUsersPageComponent implements OnChanges {
  @Input({ required: true }) isCreatingUser = false;
  @Input({ required: true }) isDeletingUser = false;
  @Input({ required: true }) currentUserId = '';
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createUser = output<NewUserForm>();
  readonly deleteUser = output<string>();
  protected newUser: NewUserForm = emptyNewUser();
  protected readonly roleLabel = toRoleLabel;
  protected deletingUserId = '';
  protected pendingDeleteUser: User | null = null;

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
