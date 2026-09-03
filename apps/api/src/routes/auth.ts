import { Router } from 'express';
import {
  loginSchema,
  UserModel,
  serialize,
  verifyPassword,
  signAccessToken,
  UnauthorizedError,
} from '@cloudops/shared';
import { validate } from '../middleware/validate';
import type { ApiConfig } from '../config';

export function authRouter(config: ApiConfig): Router {
  const router = Router();

  router.post('/login', validate(loginSchema), async (req, res, next) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const user = await UserModel.findOne({ email: email.toLowerCase(), active: true });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new UnauthorizedError('Invalid credentials');
      }
      const token = signAccessToken(
        {
          sub: user._id.toString(),
          email: user.email,
          role: user.role as 'admin' | 'operator' | 'viewer',
          workspaceId: user.workspaceId,
        },
        config.JWT_SECRET,
        config.JWT_EXPIRES_IN,
      );
      res.json({
        token,
        user: serialize(user),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
