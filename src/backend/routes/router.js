// src/backend/routes/router.js 內部的隱藏升級
import express from 'express';
import { ChatController } from '../controllers/chatController.js';
import { DocumentController } from '../controllers/documentController.js';
import { AdminController } from '../controllers/adminController.js'; // 🎯 移轉至後端的管理員控制器

const router = express.Router();

// business
router.post('/chat', ChatController.handleChat);
router.post('/upload', DocumentController.js);

// admin
router.post('/admin/command', AdminController.handleCommand);

export { router as backendRouter };