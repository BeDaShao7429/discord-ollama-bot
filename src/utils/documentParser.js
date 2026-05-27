import pdf from 'pdf-parse-new'; // 現代化原生 ESM 導入，不再報錯
import mammoth from 'mammoth';

export class DocumentParser {
    /**
     * 依據副檔名動態解析二進位 Buffer 並提取純文字
     * @param {Buffer} buffer - 檔案的實體二進位資料
     * @param {string} extension - 帶有點號的副檔名 (例如: .pdf)
     * @returns {Promise<string>} 提取出的純文字內容
     */
    static async parse(buffer, extension) {
        const normalizedExt = extension.toLowerCase();

        switch (normalizedExt) {
            case '.pdf':
                const parsedPdf = await pdf(buffer);
                return parsedPdf.text.trim();

            case '.docx':
                const parsedDocx = await mammoth.extractRawText({ buffer });
                return parsedDocx.value.trim();

            case '.txt':
                return buffer.toString('utf-8').trim();

            default:
                throw new Error(`不支援的檔案副檔名格式: ${extension}`);
        }
    }
}
