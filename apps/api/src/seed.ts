import { hash } from 'bcryptjs';
import { upsertUserByEmail } from './database.js';
import { upsertDefaultRoadmapForUser } from './default-roadmap-plan.js';

const createUser = async (input: {
  email: string;
  name: string;
  password: string;
  role: 'ADMIN' | 'MEMBER';
}) => {
  const passwordHash = await hash(input.password, 10);

  return upsertUserByEmail({
    email: input.email,
    name: input.name,
    passwordHash,
    role: input.role
  });
};

const main = async () => {
  await createUser({
    email: 'admin@pdi.local',
    name: 'Anderson Espindola',
    password: 'admin123',
    role: 'ADMIN'
  });

  const member = await createUser({
    email: 'member@pdi.local',
    name: 'Pessoa Colaboradora',
    password: 'member123',
    role: 'MEMBER'
  });

  upsertDefaultRoadmapForUser({
    ownerId: member.id,
    planId: 'seed-pdi-plan'
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
