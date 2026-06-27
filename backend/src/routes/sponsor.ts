import { Router } from 'express';

const router = Router();

// Sponsored transactions via Enoki have been removed.
// Users sign and pay gas with their own wallet.
// This route is kept as a stub for future gas station integration.

router.post('/', async (_req, res) => {
  res.status(501).json({
    error: 'Sponsored transactions are not available. Please sign with your own wallet.',
  });
});

export default router;
