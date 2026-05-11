import { Injectable, computed, inject, signal } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { ApiService } from '../../core/api/api.service';

type PlanPatch = {
  objective?: string;
  ownerId?: string;
  status?: PdiPlan['status'];
  title?: string;
};

const insertCreatedPlan = (plans: PdiPlan[], createdPlan: PdiPlan) =>
  plans.some((plan) => plan.id === createdPlan.id) ? plans : [createdPlan, ...plans];

const removePlanById = (plans: PdiPlan[], planId: string) => plans.filter((plan) => plan.id !== planId);

@Injectable()
export class WorkspaceService {
  private readonly api = inject(ApiService);

  readonly plans = signal<PdiPlan[]>([]);
  readonly users = signal<User[]>([]);
  readonly activePlanId = signal<string | null>(null);
  readonly isCreatingPlan = signal(false);
  readonly isCreatingUser = signal(false);
  readonly isDeletingPlan = signal(false);
  readonly isUpdatingPlan = signal(false);

  readonly activePlan = computed(() => {
    const plans = this.plans();
    const activePlanId = this.activePlanId();

    return plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;
  });

  readonly load = async (user: User) => {
    const [plans, users] = await Promise.all([
      this.api.pdiPlans(),
      user.role === 'ADMIN' ? this.api.users() : Promise.resolve([])
    ]);

    this.plans.set(plans);
    this.users.set(users);
    this.activePlanId.set(this.activePlanId() ?? plans[0]?.id ?? null);
  };

  readonly selectPlan = (planId: string) => {
    this.activePlanId.set(planId);
  };

  readonly createPlan = async (input: { objective: string; ownerId?: string; title: string }) => {
    this.isCreatingPlan.set(true);

    try {
      const plan = await this.api.createPdiPlan(input);
      this.plans.set(insertCreatedPlan(this.plans(), plan));
      this.activePlanId.set(plan.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not create PDI');
    } finally {
      this.isCreatingPlan.set(false);
    }
  };

  readonly updatePlan = async (planId: string, input: PlanPatch) => {
    this.isUpdatingPlan.set(true);

    try {
      const updatedPlan = await this.api.updatePdiPlan(planId, input);
      this.plans.set(this.plans().map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)));
      this.activePlanId.set(updatedPlan.id);
    } finally {
      this.isUpdatingPlan.set(false);
    }
  };

  readonly deletePlan = async (planId: string) => {
    this.isDeletingPlan.set(true);

    try {
      await this.api.deletePdiPlan(planId);
      const remainingPlans = removePlanById(this.plans(), planId);
      this.plans.set(remainingPlans);
      this.activePlanId.set(this.activePlanId() === planId ? (remainingPlans[0]?.id ?? null) : this.activePlanId());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not remove PDI');
    } finally {
      this.isDeletingPlan.set(false);
    }
  };

  readonly createUser = async (input: { email: string; name: string; password: string; role: User['role'] }) => {
    this.isCreatingUser.set(true);

    try {
      await this.api.createUser(input);
      this.users.set(await this.api.users());
    } finally {
      this.isCreatingUser.set(false);
    }
  };
}
