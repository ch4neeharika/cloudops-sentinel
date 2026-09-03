import { randomUUID } from 'crypto';
import {
  UserModel,
  WorkspaceModel,
  CloudResourceModel,
  connectMongo,
  createLogger,
  hashPassword,
  signAccessToken,
  buildMockInventory,
} from '@cloudops/shared';
import { loadConfig } from './config';

async function seed() {
  const config = loadConfig();
  const logger = createLogger('seed', config.LOG_LEVEL);
  await connectMongo(config.MONGODB_URI, logger);

  const workspaceId = process.env.DEFAULT_WORKSPACE_ID ?? 'ws_demo_acme';
  const workspaceName = process.env.DEFAULT_WORKSPACE_NAME ?? 'acme-platform';
  const password = process.env.DEMO_PASSWORD ?? 'CloudOps!demo';

  await WorkspaceModel.findOneAndUpdate(
    { name: workspaceName },
    { $setOnInsert: { name: workspaceName } },
    { upsert: true, new: true },
  );

  const passwordHash = await hashPassword(password, config.BCRYPT_ROUNDS);
  const users = [
    { email: 'admin@cloudops.local', role: 'admin' as const },
    { email: 'operator@cloudops.local', role: 'operator' as const },
    { email: 'viewer@cloudops.local', role: 'viewer' as const },
  ];

  const createdUsers = [];
  for (const user of users) {
    const doc = await UserModel.findOneAndUpdate(
      { workspaceId, email: user.email },
      { $set: { role: user.role, passwordHash, active: true, workspaceId } },
      { upsert: true, new: true },
    );
    createdUsers.push(doc);
  }

  const inventory = buildMockInventory(workspaceId);
  let synced = 0;
  for (const item of inventory) {
    const { version: _ignoredVersion, ...fields } = item;
    await CloudResourceModel.findOneAndUpdate(
      { workspaceId, arn: item.arn },
      {
        $set: { ...fields, lastSyncedAt: new Date() },
        $inc: { version: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    synced += 1;
  }

  const tokens = createdUsers.map((user) => ({
    email: user.email,
    role: user.role,
    token: signAccessToken(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role as 'admin' | 'operator' | 'viewer',
        workspaceId: user.workspaceId,
      },
      config.JWT_SECRET,
      config.JWT_EXPIRES_IN,
    ),
  }));

  logger.info(
    {
      workspaceId,
      users: tokens.map((t) => t.email),
      resources: synced,
      correlationId: randomUUID(),
    },
    'seed complete',
  );

  console.log('\nCloudOps Sentinel demo identities\n');
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Password:  ${password}\n`);
  for (const item of tokens) {
    console.log(`${item.role.padEnd(8)} ${item.email}`);
    console.log(item.token);
    console.log('');
  }
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
