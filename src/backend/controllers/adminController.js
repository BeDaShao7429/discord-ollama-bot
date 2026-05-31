import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js'; 
import { ConfigManager } from '../../utils/configManager.js';
import mongoose from 'mongoose';

export class AdminController {
    /**
     * 處理後端網路層收到的管理員指令要求
     */
    static async handleCommand(req, res) {
        const { commandStr, sessionId, guildId } = req.body;
        const [cmd, param1, param2] = commandStr.trim().split(/\s+/);

        try {
            switch (cmd) {
                case '$help':
                    return res.json({ status: 'success', type: 'help' });
                case '$setconfig':
                    const success = ConfigManager.set(param1, param2);
                    return res.json({ 
                        status: success ? 'success' : 'error', 
                        type: 'config', 
                        config: ConfigManager.get() 
                    });
                case '$clear':
                    const resDoc = await DocumentModel.clear();
                    const resImg = await ImageModel.clear();
                    const resMsg = await MessageModel.clear();
                    const total = (resDoc.deletedCount || 0) + (resImg.deletedCount || 0) + (resMsg.deletedCount || 0);
                    return res.json({ status: 'success', type: 'clear', deletedCount: total });
                case '$listdoc':
                    const db = mongoose.connection.db;
                    const docsSummary = await db.collection('documents').aggregate([
                        { $project: { fileName: 1, chunkCount: { $size: "$chunks" }, charLength: { $sum: { $map: { input: "$chunks", as: "c", in: { $strLenCP: "$$c.content" } } } } } }
                    ]).toArray();
                    const imgsSummary = await db.collection('images').aggregate([
                        { $project: { originalName: 1, chunkCount: { $size: "$chunks" }, base64Size: { $strLenCP: "$base64Data" } } }
                    ]).toArray();
                    return res.json({ status: 'success', type: 'listdoc', docs: docsSummary, imgs: imgsSummary });
                default:
                    return res.status(400).json({ status: 'error', message: `未知系統指令: ${cmd}` });
            }
        } catch (error) {
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }
}