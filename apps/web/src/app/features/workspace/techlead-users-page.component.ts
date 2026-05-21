import { Component, Input, output } from '@angular/core';
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
export class TechleadUsersPageComponent {
  @Input({ required: true }) isCreatingUser = false;
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createUser = output<NewUserForm>();
  protected newUser: NewUserForm = emptyNewUser();
  protected readonly roleLabel = toRoleLabel;

  protected readonly regeneratePassword = () => {
    this.newUser = { ...this.newUser, password: generateTemporaryPassword() };
  };

  protected readonly handleSubmit = (event: Event) => {
    event.preventDefault();
    this.createUser.emit(this.newUser);
    this.newUser = emptyNewUser();
  };
}
