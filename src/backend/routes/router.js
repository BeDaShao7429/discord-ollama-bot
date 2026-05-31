import express from 'express';
import { ChatController } from '../controllers/chatController.js';
import { DocumentController } from '../controllers/documentController.js';

const router = express.Router();

router.post('/chat', ChatController.handleChat);
router.post('/upload', DocumentController.handleUpload);

export { router as backendRouter };