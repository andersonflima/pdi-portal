import { Component, Input, output } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { AdminPdiMenuComponent } from './admin-pdi-menu.component';
import { AdminUsersMenuComponent } from './admin-users-menu.component';
import { UserMenuComponent } from './user-menu.component';

@Component({
  selector: 'app-canvas-header',
  standalone: true,
  imports: [AdminPdiMenuComponent, AdminUsersMenuComponent, LucideAngularModule, UserMenuComponent],
  templateUrl: './canvas-header.component.html',
  styleUrl: './canvas-header.component.css'
})
export class CanvasHeaderComponent {
  @Input({ required: true }) isCreatingPlan = false;
  @Input({ required: true }) isCreatingUser = false;
  @Input({ required: true }) isDeletingPlan = false;
  @Input({ required: true }) isExportingPlan = false;
  @Input({ required: true }) isImportingPlan = false;
  @Input({ required: true }) isSaving = false;
  @Input({ required: true }) isUpdatingPlan = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) user!: User;
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly createUser = output<{ email: string; name: string; password: string; role: User['role'] }>();
  readonly deletePlan = output<string>();
  readonly exportPlan = output<string>();
  readonly importPlan = output<File>();
  readonly logout = output<void>();
  readonly saveBoard = output<void>();
  readonly selectPlan = output<string>();
  readonly updatePlan = output<{ id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }>();

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
