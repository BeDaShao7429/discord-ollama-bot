import jschardet from 'jschardet';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export async function parseDocument(attachment) {
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`HTTP 錯誤狀態碼: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = attachment.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      return data.text;
    } else if (fileName.endsWith('.docx')) {
      const data = await mammoth.extractRawText({ buffer });
      return data.value;
    } else {
      const detected = jschardet.detect(buffer);
      const encoding = detected.encoding || 'utf-8';
      const decoder = new TextDecoder(encoding);
      return decoder.decode(buffer);
    }
  } catch (error) {
    console.error(`[UTIL_ERROR] 文件解析失敗 (File: ${attachment.name}):`, error.message);
    throw error;
  }
}