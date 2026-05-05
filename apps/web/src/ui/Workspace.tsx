import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PdiPlan } from '@pdi/contracts';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { CanvasBoard } from './canvas/CanvasBoard';

export const Workspace = () => {
  const queryClient = useQueryClient();
  const { logout, user } = useAuth();
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const plansQuery = useQuery({ queryFn: api.pdiPlans, queryKey: ['pdi-plans'] });
  const usersQuery = useQuery({ enabled: user?.role === 'ADMIN', queryFn: api.users, queryKey: ['users'] });
  const createPlan = useMutation({
    mutationFn: api.createPdiPlan,
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : 'Could not create PDI');
    },
    onSuccess: async (plan) => {
      queryClient.setQueryData(['pdi-plans'], (currentPlans: PdiPlan[] | undefined) =>
        currentPlans?.some((currentPlan) => currentPlan.id === plan.id) ? currentPlans : [plan, ...(currentPlans ?? [])]
      );
      await queryClient.invalidateQueries({ queryKey: ['pdi-plans'] });
      setActivePlanId(plan.id);
    }
  });
  const createUser = useMutation({
    mutationFn: api.createUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
  const updatePlan = useMutation({
    mutationFn: (input: {
      id: string;
      data: {
        objective?: string;
        ownerId?: string;
        status?: 'DRAFT' | 'ACTIVE' | 'DONE';
        title?: string;
      };
    }) => api.updatePdiPlan(input.id, input.data),
    onSuccess: async (plan) => {
      await queryClient.invalidateQueries({ queryKey: ['pdi-plans'] });
      setActivePlanId(plan.id);
    }
  });
  const deletePlan = useMutation({
    mutationFn: api.deletePdiPlan,
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : 'Could not remove PDI');
    },
    onSuccess: async (_, deletedPlanId) => {
      const remainingPlans = plans.filter((plan) => plan.id !== deletedPlanId);
      queryClient.setQueryData(['pdi-plans'], remainingPlans);
      await queryClient.invalidateQueries({ queryKey: ['pdi-plans'] });
      setActivePlanId((currentPlanId) =>
        currentPlanId === deletedPlanId ? (remainingPlans[0]?.id ?? null) : currentPlanId
      );
    }
  });

  const plans = plansQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null,
    [activePlanId, plans]
  );

  return (
    <main className="workspace">
      <section className="work-surface">
        {activePlan && user ? (
          <CanvasBoard
            isCreatingUser={createUser.isPending}
            isCreatingPlan={createPlan.isPending}
            isDeletingPlan={deletePlan.isPending}
            isUpdatingPlan={updatePlan.isPending}
            onCreatePlan={(input) => createPlan.mutate(input)}
            onCreateUser={(input) => createUser.mutate(input)}
            onDeletePlan={(planId) => deletePlan.mutate(planId)}
            onLogout={logout}
            onSelectPlan={setActivePlanId}
            onUpdatePlan={(id, data) => updatePlan.mutate({ data, id })}
            plan={activePlan}
            plans={plans}
            user={user}
            users={users}
            usersCount={users.length}
          />
        ) : (
          <div className="empty-state">Create a PDI plan to start.</div>
        )}
      </section>
    </main>
  );
};
