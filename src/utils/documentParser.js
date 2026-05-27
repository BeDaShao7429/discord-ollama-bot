import jschardet from 'jschardet';
import mammoth from 'mammoth';
import pdf from 'pdf-parse-new'; // 修正：直接使用標準 ESM 引入，不再需要 createRequire

export class DocumentParser {
    /**
     * 解析 Discord 附件內容
     * @param {object} attachment - Discord 訊息的附件物件
     * @returns {Promise<string>} 解析後的純文字內容
     */
    static async parse(attachment) {
        try {
            const response = await fetch(attachment.url);
            if (!response.ok) throw new Error(`HTTP 錯誤狀態碼: ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const fileName = attachment.name.toLowerCase();

			// 新增：圖檔格式判定
            if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp')) {
                const base64String = buffer.toString('base64');
                return { type: 'image_base64', content: base64String };
            }

			// 文檔判定
            if (fileName.endsWith('.pdf')) {
                // pdf-parse-new 的呼叫方式與原版完全相同
                const data = await pdf(buffer);
                return data.text;
            } else if (fileName.endsWith('.docx')) {
                const data = await mammoth.extractRawText({ buffer });
                return data.value;
            } else {
                const detected = jschardet.detect(buffer);
                let encoding = detected.encoding ? detected.encoding.toLowerCase() : 'utf-8';
                if (encoding === 'windows-1252') encoding = 'utf-8';
                
                const decoder = new TextDecoder(encoding);
                return { type: 'text', content: decoder.decode(buffer) };
            }
        } catch (error) {
            console.error(`[UTIL_ERROR] 文件解析失敗 (File: ${attachment.name}):`, error.message);
            throw error;
        }
    }
}