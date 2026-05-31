import express from 'express';
import { ChatController } from '../controllers/chatController.js';
import { DocumentController } from '../controllers/documentController.js';
import { AdminController } from '../controllers/adminController.js';

const router = express.Router();

// 常規對話端點
router.post('/chat', ChatController.handleChat);

// 🎯 修正處：精確對齊 DocumentController 內部的 handleUpload 靜態方法
router.post('/upload', DocumentController.handleUpload);

// 系統維護安全端點
router.post('/admin/command', AdminController.handleCommand);

export { router as backendRouter };