import { Component, Input, OnChanges, SimpleChanges, output, signal } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';

type NewPlanForm = {
  objective: string;
  ownerId: string;
  title: string;
};

type EditPlanForm = {
  objective: string;
  ownerId: string;
  status: PdiPlan['status'];
  title: string;
};

const emptyNewPlan = (ownerId: string): NewPlanForm => ({
  objective: '',
  ownerId,
  title: ''
});

const toEditPlan = (plan: PdiPlan): EditPlanForm => ({
  objective: plan.objective,
  ownerId: plan.ownerId,
  status: plan.status,
  title: plan.title
});

@Component({
  selector: 'app-admin-pdi-menu',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './admin-pdi-menu.component.html',
  styleUrl: './admin-menu.component.css'
})
export class AdminPdiMenuComponent implements OnChanges {
  @Input({ required: true }) isCreatingPlan = false;
  @Input({ required: true }) isDeletingPlan = false;
  @Input({ required: true }) isUpdatingPlan = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) users: User[] = [];

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly deletePlan = output<string>();
  readonly selectPlanForCanvas = output<string>();
  readonly updatePlan = output<{ id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }>();

  protected readonly editingPlanId = signal('');
  protected readonly editPlan = signal<EditPlanForm | null>(null);
  protected readonly newPlan = signal<NewPlanForm>(emptyNewPlan(''));

  ngOnChanges(changes: SimpleChanges) {
    if (changes['plan']?.currentValue) {
      this.editingPlanId.set(this.plan.id);
      this.editPlan.set(toEditPlan(this.plan));
    }

    if (changes['users'] || changes['plan']) {
      const ownerId = this.defaultOwnerId();

      this.newPlan.update((current) => (current.ownerId ? current : { ...current, ownerId }));
    }
  }

  protected readonly ownerName = (ownerId: string) => this.users.find((user) => user.id === ownerId)?.name ?? 'No owner';

  protected readonly selectPlanForEdit = (planId: string) => {
    const selectedPlan = this.plans.find((candidate) => candidate.id === planId) ?? this.plan;
    this.editingPlanId.set(selectedPlan.id);
    this.editPlan.set(toEditPlan(selectedPlan));
  };

  protected readonly updateNewPlan = <TKey extends keyof NewPlanForm>(key: TKey, value: NewPlanForm[TKey]) => {
    this.newPlan.update((current) => ({ ...current, [key]: value }));
  };

  protected readonly updateEditPlan = <TKey extends keyof EditPlanForm>(key: TKey, value: EditPlanForm[TKey]) => {
    this.editPlan.update((current) => (current ? { ...current, [key]: value } : current));
  };

  protected readonly handleCreatePlan = (event: Event) => {
    event.preventDefault();
    const ownerId = this.newPlan().ownerId || this.defaultOwnerId();

    if (!ownerId) return;

    this.createPlan.emit({
      objective: this.newPlan().objective,
      ownerId,
      title: this.newPlan().title
    });
    this.newPlan.set(emptyNewPlan(ownerId));
  };

  protected readonly handleUpdatePlan = (event: Event) => {
    event.preventDefault();

    if (!this.editPlan()) return;

    this.updatePlan.emit({
      data: this.editPlan()!,
      id: this.editingPlanId()
    });
  };

  protected readonly handleDeletePlan = (planId: string, title: string) => {
    if (window.confirm(`Remove "${title}" and its board?`)) {
      this.deletePlan.emit(planId);
    }
  };

  private readonly defaultOwnerId = () =>
    this.users.find((user) => user.role === 'MEMBER')?.id ?? this.users[0]?.id ?? '';
}
