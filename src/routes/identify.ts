import { Router } from 'express';
import { identify } from '../controllers/identityController';

const router = Router();

router.post('/identify', identify);

export default router;
