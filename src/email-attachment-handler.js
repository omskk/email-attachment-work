import * as PostalMime from 'postal-mime'

/**
 * 处理邮件附件的Worker
 * 检查邮件是否包含附件，并将附件存储到R2中
 */
export default {
  /**
   * 处理邮件的入口函数
   */
  async email(message, env, ctx) {
    await handleEmail(message, env, ctx)
  },
}

/**
 * 清理文件名，移除不安全字符
 * @param filename 原始文件名
 * @return {string} 清理后的文件名
 */
function sanitizeFilename(filename) {
  // 移除所有空字符 (%00)
  let sanitized = filename.replace(/\u0000/g, '');
  // 移除URL编码的空字符
  sanitized = sanitized.replace(/%00/g, '');
  // 移除控制字符
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  // 替换问题字符
  sanitized = sanitized.replace(/[<>:"\/\\|?*]/g, '_');
  // 去除所有空格
  sanitized = sanitized.replace(/\s+/g, '');
  
  // 如果文件名为空，返回默认名称
  if (!sanitized || sanitized.trim() === '') {
    return 'unnamed_file';
  }
  return sanitized;
}

/**
 * 处理邮件主函数
 * @param message 邮件消息
 * @param env 环境变量
 * @param ctx 执行上下文
 */
async function handleEmail(message, env, ctx) {
  try {
    // 创建解析器
    const parser = new PostalMime.default()
    
    // 解析邮件内容
    const rawEmail = new Response(message.raw)
    const email = await parser.parse(await rawEmail.arrayBuffer())
    
    // 检查邮件是否包含附件
    if (!email.attachments || email.attachments.length === 0) {
      console.log('邮件不包含附件')
      return
    }
    
    // 处理所有附件
    for (const attachment of email.attachments) {
      if (!attachment.filename || !attachment.content) {
        console.log('附件无效')
        continue
      }
      
      // 构建文件路径 - 清理文件名后再存储
      const filePath = sanitizeFilename(attachment.filename)
      
      // 存储到R2
      if (env.R2_BUCKET) {
        console.log(`正在存储附件: ${filePath}`)
        await env.R2_BUCKET.put(filePath, attachment.content, {
          httpMetadata: {
            contentType: attachment.mimeType || 'application/octet-stream',
          }
        })
        console.log(`附件已存储: ${filePath}`)
      } else {
        console.error('R2_BUCKET未配置')
      }
    }
    
    // 可选：记录统计信息到Analytics Engine
    if (env.DMARC_ANALYTICS) {
      env.DMARC_ANALYTICS.writeDataPoint({
        blobs: [email.messageId || '', email.from?.address || '', email.subject || ''],
        doubles: [email.attachments.length, Date.now()],
        indexes: [email.messageId?.slice(0, 32) || Date.now().toString()],
      })
    }
    
  } catch (error) {
    console.error('处理邮件时出错:', error)
    throw error
  }
} 