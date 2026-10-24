import { Router } from 'express';
import { handleChat, handleHealth } from '../controllers/chatController.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Health check endpoint
router.get('/health', handleHealth);

// Chat endpoint with validation and rate limiting
router.post('/chat', chatRateLimiter, handleChat);

export default router;
